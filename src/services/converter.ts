import { sequelize } from '../db.js';
import { Contact, Conversion } from '../models/index.js';
import { Op } from 'sequelize';

// Cross-schema queries to detect Talkspresso signups, bookings, revenue
export async function checkConversions(): Promise<void> {
  await checkSignups();
  await checkBookings();
  await checkRevenue();
}

// Check for contacts who signed up on Talkspresso
async function checkSignups(): Promise<void> {
  // Find contacts not yet linked to a Talkspresso user
  const unlinked = await Contact.findAll({
    where: {
      project: 'talkspresso',
      talkspresso_user_id: null,
      status: { [Op.notIn]: ['bounced', 'unsubscribed'] },
    },
  });

  if (!unlinked.length) return;

  const emails = unlinked.map(c => c.email.toLowerCase());

  // Query Talkspresso users table
  const [users] = await sequelize.query(`
    SELECT id, email, "createdAt"
    FROM public."Users"
    WHERE LOWER(email) IN (:emails)
  `, { replacements: { emails } });

  for (const user of users as any[]) {
    const contact = unlinked.find(c => c.email.toLowerCase() === user.email.toLowerCase());
    if (!contact) continue;

    // Link contact to Talkspresso user
    await contact.update({
      talkspresso_user_id: user.id,
      status: contact.status === 'converted' ? 'converted' : 'signed_up',
      updated_at: new Date(),
    });

    // Record conversion event (if not already recorded)
    const existing = await Conversion.findOne({
      where: { contact_id: contact.id, event_type: 'signed_up' },
    });
    if (!existing) {
      await Conversion.create({
        contact_id: contact.id,
        event_type: 'signed_up',
        event_data: { user_id: user.id, signed_up_at: user.createdAt },
        occurred_at: user.createdAt,
      });
      console.log(`Conversion: ${contact.email} signed up (user ${user.id})`);
    }
  }
}

// Check for contacts who have booked sessions
async function checkBookings(): Promise<void> {
  const signedUp = await Contact.findAll({
    where: {
      project: 'talkspresso',
      talkspresso_user_id: { [Op.ne]: null },
      status: { [Op.in]: ['signed_up'] },
    },
  });

  if (!signedUp.length) return;

  const userIds = signedUp.map(c => c.talkspresso_user_id);

  const [appointments] = await sequelize.query(`
    SELECT id, "clientId", "scheduledDate", "createdAt"
    FROM public."Appointments"
    WHERE "clientId" IN (:userIds)
    AND status NOT IN ('cancelled', 'declined')
    LIMIT 100
  `, { replacements: { userIds } });

  for (const apt of appointments as any[]) {
    const contact = signedUp.find(c => c.talkspresso_user_id === apt.clientId);
    if (!contact) continue;

    const existing = await Conversion.findOne({
      where: { contact_id: contact.id, event_type: 'first_booking' },
    });
    if (!existing) {
      await contact.update({ status: 'booked', updated_at: new Date() });
      await Conversion.create({
        contact_id: contact.id,
        event_type: 'first_booking',
        event_data: { appointment_id: apt.id, scheduled_date: apt.scheduledDate },
        occurred_at: apt.createdAt,
      });
      console.log(`Conversion: ${contact.email} booked first session`);
    }
  }
}

// Check for revenue (paid sessions)
async function checkRevenue(): Promise<void> {
  const booked = await Contact.findAll({
    where: {
      project: 'talkspresso',
      talkspresso_user_id: { [Op.ne]: null },
      status: { [Op.in]: ['booked', 'converted'] },
    },
  });

  if (!booked.length) return;

  const userIds = booked.map(c => c.talkspresso_user_id);

  const [transactions] = await sequelize.query(`
    SELECT id, "userId", amount, "createdAt"
    FROM public."Transactions"
    WHERE "userId" IN (:userIds)
    AND status = 'completed'
    AND amount > 0
    LIMIT 100
  `, { replacements: { userIds } });

  for (const txn of transactions as any[]) {
    const contact = booked.find(c => c.talkspresso_user_id === txn.userId);
    if (!contact) continue;

    const existing = await Conversion.findOne({
      where: {
        contact_id: contact.id,
        event_type: 'revenue',
        event_data: { transaction_id: txn.id } as any,
      },
    });
    if (!existing) {
      if (contact.status !== 'converted') {
        await contact.update({ status: 'converted', updated_at: new Date() });
      }
      await Conversion.create({
        contact_id: contact.id,
        event_type: 'revenue',
        event_data: { transaction_id: txn.id, amount: txn.amount },
        occurred_at: txn.createdAt,
      });
      console.log(`Conversion: ${contact.email} revenue $${txn.amount}`);
    }
  }
}
