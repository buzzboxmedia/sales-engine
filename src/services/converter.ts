import { sequelize } from '../db.js';
import { Contact, Conversion } from '../models/index.js';
import { Op } from 'sequelize';
import { applyScore } from './scorer.js';
import { logActivity } from './activity.js';

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
      talkspresso_user_id: null,
      status: { [Op.notIn]: ['bounced', 'unsubscribed'] },
    },
    limit: 5000,
  });

  if (!unlinked.length) return;

  const emails = unlinked.map(c => c.email.toLowerCase());

  // Query Talkspresso users table (batch in chunks of 500)
  for (let i = 0; i < emails.length; i += 500) {
    const batch = emails.slice(i, i + 500);

    const [users] = await sequelize.query(`
      SELECT id, email, "createdAt"
      FROM public."Users"
      WHERE LOWER(email) IN (:emails)
    `, { replacements: { emails: batch } });

    for (const user of users as any[]) {
      const contact = unlinked.find(c => c.email.toLowerCase() === user.email.toLowerCase());
      if (!contact) continue;

      // Link contact to Talkspresso user
      const prevStatus = contact.status;
      await contact.update({
        talkspresso_user_id: user.id,
        status: contact.status === 'converted' ? 'converted' : 'signed_up',
        last_activity_at: new Date(),
      });

      // Apply lead score
      await applyScore(contact.id, 'signed_up');

      // Log activity
      await logActivity({
        contactId: contact.id,
        type: 'conversion',
        description: `Signed up on Talkspresso (was ${prevStatus})`,
        metadata: { user_id: user.id, signed_up_at: user.createdAt },
      });

      // Record conversion event
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
}

// Check for contacts who have booked sessions via Clients table
async function checkBookings(): Promise<void> {
  // Get contacts who signed up but haven't booked yet
  const signedUp = await Contact.findAll({
    where: {
      status: 'signed_up',
    },
  });

  if (!signedUp.length) return;

  const emails = signedUp.map(c => c.email.toLowerCase());

  // Join path: Clients.email -> Appointments.client_id
  // Clients table stores the email of people who book
  for (let i = 0; i < emails.length; i += 500) {
    const batch = emails.slice(i, i + 500);

    const [bookings] = await sequelize.query(`
      SELECT DISTINCT ON (cl.email)
        cl.email, cl.id as client_id,
        a.id as appointment_id, a.start_time, a.status as apt_status,
        a.paid, a."createdAt" as booked_at
      FROM public."Clients" cl
      JOIN public."Appointments" a ON a.client_id = cl.id
      WHERE LOWER(cl.email) IN (:emails)
        AND a.status NOT IN ('cancelled')
        AND a.approval_status NOT IN ('declined')
      ORDER BY cl.email, a."createdAt" ASC
    `, { replacements: { emails: batch } });

    for (const booking of bookings as any[]) {
      const contact = signedUp.find(c => c.email.toLowerCase() === booking.email.toLowerCase());
      if (!contact) continue;

      const existing = await Conversion.findOne({
        where: { contact_id: contact.id, event_type: 'first_booking' },
      });
      if (!existing) {
        await contact.update({
          status: 'booked',
          last_activity_at: new Date(),
        });

        await applyScore(contact.id, 'booked');

        await logActivity({
          contactId: contact.id,
          type: 'conversion',
          description: `Booked first session on Talkspresso`,
          metadata: { appointment_id: booking.appointment_id, start_time: booking.start_time },
        });

        await Conversion.create({
          contact_id: contact.id,
          event_type: 'first_booking',
          event_data: {
            appointment_id: booking.appointment_id,
            client_id: booking.client_id,
            start_time: booking.start_time,
          },
          occurred_at: booking.booked_at,
        });
        console.log(`Conversion: ${contact.email} booked first session`);
      }
    }
  }
}

// Check for revenue (paid sessions) via Transactions joined through Appointments/Clients
async function checkRevenue(): Promise<void> {
  const booked = await Contact.findAll({
    where: {
      status: { [Op.in]: ['booked', 'converted'] },
    },
  });

  if (!booked.length) return;

  const emails = booked.map(c => c.email.toLowerCase());

  for (let i = 0; i < emails.length; i += 500) {
    const batch = emails.slice(i, i + 500);

    // Join: Clients.email -> Appointments.client_id -> Transactions.appointment_id
    const [transactions] = await sequelize.query(`
      SELECT cl.email, t.id as txn_id, t.amount, t."createdAt" as paid_at,
        t.appointment_id, t.transaction_type
      FROM public."Clients" cl
      JOIN public."Appointments" a ON a.client_id = cl.id
      JOIN public."Transactions" t ON t.appointment_id = a.id
      WHERE LOWER(cl.email) IN (:emails)
        AND t.amount > 0
    `, { replacements: { emails: batch } });

    for (const txn of transactions as any[]) {
      const contact = booked.find(c => c.email.toLowerCase() === txn.email.toLowerCase());
      if (!contact) continue;

      // Check if this specific transaction was already recorded
      const existing = await Conversion.findOne({
        where: {
          contact_id: contact.id,
          event_type: 'revenue',
        },
      });

      if (!existing) {
        if (contact.status !== 'converted') {
          await contact.update({
            status: 'converted',
            last_activity_at: new Date(),
          });
        }

        await applyScore(contact.id, 'paid');

        await logActivity({
          contactId: contact.id,
          type: 'conversion',
          description: `Paid $${txn.amount} on Talkspresso`,
          metadata: { transaction_id: txn.txn_id, amount: txn.amount },
        });

        await Conversion.create({
          contact_id: contact.id,
          event_type: 'revenue',
          event_data: { transaction_id: txn.txn_id, amount: txn.amount },
          occurred_at: txn.paid_at,
        });
        console.log(`Conversion: ${contact.email} paid $${txn.amount}`);
      }
    }
  }
}
