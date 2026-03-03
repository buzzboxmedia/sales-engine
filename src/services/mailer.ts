import nodemailer from 'nodemailer';
import { createId } from '@paralleldrive/cuid2';
import { SendingAccount, Send, Contact, Sequence } from '../models/index.js';
import { logActivity } from './activity.js';
import { Op } from 'sequelize';

const BASE_URL = process.env.BASE_URL || 'https://sales.talkspresso.com';

// Check if a URL is a talkspresso.com destination
function isTalkspressoUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.hostname === 'talkspresso.com' || parsed.hostname.endsWith('.talkspresso.com');
  } catch {
    return false;
  }
}

// Append UTM + se params to a talkspresso.com URL
function appendTrackingParams(url: string, trackingId: string, sequenceName: string): string {
  try {
    const parsed = new URL(url);
    parsed.searchParams.set('utm_source', 'sales_engine');
    parsed.searchParams.set('utm_medium', 'email');
    parsed.searchParams.set('utm_campaign', sequenceName);
    parsed.searchParams.set('se', trackingId);
    return parsed.toString();
  } catch {
    return url;
  }
}

// Strip HTML tags for plain text fallback
function htmlToPlainText(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<li[^>]*>/gi, '  - ')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Inject tracking pixel + wrap/param links + append unsubscribe footer
function injectTracking(html: string, trackingId: string, sequenceName: string): string {
  // For talkspresso.com links: append UTM params directly
  // For all other links: wrap through /t/c/ redirect for tracking
  const processedLinks = html.replace(
    /href="([^"]+)"/g,
    (_match, url: string) => {
      if (url.startsWith('mailto:') || url.includes('/t/u/')) {
        return `href="${url}"`;
      }
      if (isTalkspressoUrl(url)) {
        return `href="${appendTrackingParams(url, trackingId, sequenceName)}"`;
      }
      return `href="${BASE_URL}/t/c/${trackingId}?url=${encodeURIComponent(url)}"`;
    },
  );

  // Append unsubscribe footer + tracking pixel
  const footer = `
<div style="margin-top:20px;padding-top:10px;border-top:1px solid #eee;font-size:11px;color:#999;">
  <a href="${BASE_URL}/t/u/${trackingId}" style="color:#999;">Unsubscribe</a>
</div>
<img src="${BASE_URL}/t/o/${trackingId}" width="1" height="1" style="display:none" alt="" />`;

  // Insert before </body> if present, otherwise append
  if (processedLinks.includes('</body>')) {
    return processedLinks.replace('</body>', `${footer}\n</body>`);
  }
  return processedLinks + footer;
}

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

  // Generate tracking_id and save it before sending
  const trackingId = createId();
  await send.update({ tracking_id: trackingId });

  // Resolve sequence name for UTM campaign param
  let sequenceName = 'default';
  if (send.sequence_id) {
    const sequence = await Sequence.findByPk(send.sequence_id);
    if (sequence?.name) {
      sequenceName = sequence.name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_-]/g, '');
    }
  }

  // Inject tracking pixel, process links, append unsubscribe footer
  const trackedHtml = injectTracking(send.body, trackingId, sequenceName);
  const plainText = htmlToPlainText(send.body) + `\n\nUnsubscribe: ${BASE_URL}/t/u/${trackingId}`;

  const transporter = getTransporter(account);

  try {
    await transporter.sendMail({
      from: `"${account.display_name}" <${account.email}>`,
      to: contact.email,
      subject: send.subject,
      html: trackedHtml,
      text: plainText,
    });

    await send.update({ status: 'sent', sent_at: new Date() });
    await account.update({
      daily_sent: account.daily_sent + 1,
      updated_at: new Date(),
    });

    await logActivity({
      contactId: send.contact_id,
      type: 'email_sent',
      description: `Sent email: ${send.subject}`,
      metadata: { send_id: send.id, sender_email: send.sender_email, tracking_id: trackingId },
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
