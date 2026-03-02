import nodemailer from 'nodemailer';
import { SendingAccount, Send, Contact } from '../models/index.js';
import { Op } from 'sequelize';

const DELAY_BETWEEN_SENDS_MS = 5000;

interface TransporterCache {
  [email: string]: nodemailer.Transporter;
}

const transporters: TransporterCache = {};

function getTransporter(account: SendingAccount): nodemailer.Transporter {
  if (!transporters[account.email]) {
    transporters[account.email] = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      auth: {
        user: account.email,
        pass: account.app_password,
      },
    });
  }
  return transporters[account.email];
}

// Pick the next available sending account (round-robin, respects daily limits)
export async function getAvailableAccount(): Promise<SendingAccount | null> {
  const accounts = await SendingAccount.findAll({
    where: {
      status: { [Op.in]: ['active', 'warmup'] },
      daily_sent: { [Op.lt]: { [Op.col]: 'daily_limit' } },
    },
    order: [['daily_sent', 'ASC']], // use least-used first
  });

  // Manual filter since Op.lt with Op.col doesn't work cleanly
  const available = accounts.filter(a => a.daily_sent < a.daily_limit);
  return available[0] || null;
}

// Send a single email
export async function sendEmail(send: Send): Promise<boolean> {
  const account = await SendingAccount.findOne({ where: { email: send.sender_email } });
  if (!account) {
    console.error(`No sending account for ${send.sender_email}`);
    return false;
  }

  if (account.daily_sent >= account.daily_limit) {
    console.log(`Daily limit reached for ${account.email}`);
    return false;
  }

  const contact = await Contact.findByPk(send.contact_id);
  if (!contact) return false;

  const transporter = getTransporter(account);

  try {
    await transporter.sendMail({
      from: `"${account.display_name}" <${account.email}>`,
      to: contact.email,
      subject: send.subject,
      html: send.body,
    });

    await send.update({ status: 'sent', sent_at: new Date() });
    await account.update({
      daily_sent: account.daily_sent + 1,
      updated_at: new Date(),
    });

    console.log(`Sent to ${contact.email} via ${account.email}`);
    return true;
  } catch (err: any) {
    console.error(`Failed to send to ${contact.email}:`, err.message);

    if (err.responseCode === 550 || err.message?.includes('bounce')) {
      await send.update({ status: 'bounced', bounced_at: new Date() });
      await contact.update({ status: 'bounced', suppressed: true, updated_at: new Date() });
    }

    return false;
  }
}

// Process all queued sends with delay between each
export async function processQueue(): Promise<number> {
  const queued = await Send.findAll({
    where: { status: 'queued' },
    order: [['created_at', 'ASC']],
    limit: 50,
  });

  if (!queued.length) return 0;

  let sent = 0;
  for (const send of queued) {
    const account = await getAvailableAccount();
    if (!account) {
      console.log('No available sending accounts, stopping queue');
      break;
    }

    // Update sender_email to available account if needed
    if (send.sender_email !== account.email) {
      await send.update({ sender_email: account.email });
    }

    const success = await sendEmail(send);
    if (success) sent++;

    // Delay between sends
    await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_SENDS_MS));
  }

  return sent;
}

// Reset daily counters (called at midnight)
export async function resetDailyCounters(): Promise<void> {
  await SendingAccount.update(
    { daily_sent: 0, updated_at: new Date() },
    { where: {} },
  );
  console.log('Daily send counters reset');
}
