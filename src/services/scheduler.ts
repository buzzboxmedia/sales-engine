import cron from 'node-cron';
import { Op } from 'sequelize';
import { processQueue, resetDailyCounters } from './mailer.js';
import { checkConversions } from './converter.js';
import { Send, Contact, Sequence, SendingAccount } from '../models/index.js';

// Domain warmup schedule: [day_threshold, daily_limit]
// Domain age starts from WARMUP_START_DATE. Ramps conservatively to protect reputation.
const WARMUP_START_DATE = new Date('2026-03-03');
const WARMUP_SCHEDULE: [number, number][] = [
  [0, 15],    // Days 0-6:   15/day
  [7, 30],    // Days 7-13:  30/day
  [14, 50],   // Days 14-20: 50/day
  [21, 75],   // Days 21-27: 75/day
  [28, 100],  // Days 28-41: 100/day
  [42, 150],  // Days 42-55: 150/day
  [56, 200],  // Days 56+:   200/day (full speed)
];

async function applyWarmupLimit(): Promise<void> {
  const daysSinceStart = Math.floor((Date.now() - WARMUP_START_DATE.getTime()) / (1000 * 60 * 60 * 24));

  // Find the right tier: last entry where daysSinceStart >= threshold
  let targetLimit = WARMUP_SCHEDULE[0][1];
  for (const [threshold, limit] of WARMUP_SCHEDULE) {
    if (daysSinceStart >= threshold) targetLimit = limit;
  }

  const accounts = await SendingAccount.findAll({ where: { status: { [Op.in]: ['active', 'warmup'] } } });
  for (const account of accounts) {
    if (account.daily_limit !== targetLimit) {
      await account.update({ daily_limit: targetLimit, updated_at: new Date() });
      console.log(`Warmup: ${account.email} daily_limit updated to ${targetLimit} (day ${daysSinceStart})`);
    }
  }
}

// Daily enrollment target: starts at 50, increase per the ramp schedule.
// Adjust this value as sending infrastructure scales.
const DAILY_ENROLLMENT_TARGET = parseInt(process.env.DAILY_ENROLLMENT_TARGET || '50');

// Terminal statuses — contacts in these states are never enrolled or followed up
const TERMINAL_STATUSES = ['replied', 'interested', 'not_interested', 'signed_up', 'booked', 'converted', 'unsubscribed', 'bounced'];

// Persona segmentation: maps sequence name to niche/title keyword tests.
// Precedence order: A → B → C → D → E (first match wins).
function getPersonaSequenceName(contact: Contact): string {
  const niche = (contact.niche || '').toLowerCase();
  const title = (contact.title || '').toLowerCase();

  // Persona A: Fitness & Wellness
  if (/fitness|health|wellness|nutrition|yoga|workout|weight|gym/.test(niche)) {
    return 'fitness-wellness-outreach';
  }

  // Persona B: Business & Career Coach
  if (/business|entrepreneur|career|leadership|productivity|sales|startup|coach/.test(niche) ||
      /coach|consultant|advisor/.test(title)) {
    return 'business-coach-outreach';
  }

  // Persona C: Creative & Content Creator
  if (/photography|design|creative|podcast|music|art|video|content|writer|film/.test(niche)) {
    return 'creative-creator-outreach';
  }

  // Persona D: Finance & Investing
  if (/finance|investing|money|tax|crypto|stock|wealth|trading|budget|financial/.test(niche)) {
    return 'finance-expert-outreach';
  }

  // Persona E: General (catch-all)
  return 'general-expert-outreach';
}

// Enroll a batch of new contacts into their persona-matched sequences
async function enrollContacts(): Promise<number> {
  // Load all persona sequences once
  const sequences = await Sequence.findAll({
    where: {
      project: 'talkspresso',
      status: 'active',
      name: {
        [Op.in]: [
          'fitness-wellness-outreach',
          'business-coach-outreach',
          'creative-creator-outreach',
          'finance-expert-outreach',
          'general-expert-outreach',
        ],
      },
    },
  });

  const seqByName = new Map<string, Sequence>();
  for (const seq of sequences) seqByName.set(seq.name, seq);

  // Find unenrolled, unsuppressed contacts with status 'new'
  // Prioritise by followers DESC (higher reach first), then id for stability
  const candidates = await Contact.findAll({
    where: {
      project: 'talkspresso',
      status: 'new',
      suppressed: false,
    },
    order: [
      ['followers', 'DESC NULLS LAST'],
      ['id', 'ASC'],
    ],
    limit: DAILY_ENROLLMENT_TARGET * 3, // fetch extra to account for already-active contacts
  });

  let enrolled = 0;
  let skipped = 0;

  for (const contact of candidates) {
    if (enrolled >= DAILY_ENROLLMENT_TARGET) break;

    // Skip if contact is in a terminal status (double-check after fetch)
    if (TERMINAL_STATUSES.includes(contact.status)) { skipped++; continue; }

    // Skip if contact already has any active sequence enrollment
    const activeEnrollment = await Send.findOne({
      where: {
        contact_id: contact.id,
        status: { [Op.in]: ['queued', 'sent'] },
        sequence_id: { [Op.ne]: null },
      },
    });
    if (activeEnrollment) { skipped++; continue; }

    // Determine persona sequence
    const seqName = getPersonaSequenceName(contact);
    const seq = seqByName.get(seqName);
    if (!seq) { skipped++; continue; }

    const steps = seq.steps as any[];
    if (!steps.length) { skipped++; continue; }

    // Check not already enrolled in this sequence
    const alreadyEnrolled = await Send.findOne({
      where: { contact_id: contact.id, sequence_id: seq.id },
    });
    if (alreadyEnrolled) { skipped++; continue; }

    const firstStep = steps[0];
    await Send.create({
      contact_id: contact.id,
      sequence_id: seq.id,
      step_number: 1,
      sender_email: 'baron@trytalkspresso.com',
      subject: replaceVars(firstStep.subject, contact),
      body: replaceVars(firstStep.body, contact),
      status: 'queued',
    });

    await contact.update({ status: 'contacted', updated_at: new Date() });
    enrolled++;
  }

  if (enrolled > 0 || skipped > 0) {
    console.log(`Daily enrollment: ${enrolled} enrolled, ${skipped} skipped`);
  }
  return enrolled;
}

// Queue follow-up emails for contacts who haven't replied
async function queueFollowUps(): Promise<number> {
  // Find sends that were sent but not replied to, where the sequence has a next step
  const sentNotReplied = await Send.findAll({
    where: {
      status: 'sent',
      sequence_id: { [Op.ne]: null },
      replied_at: null,
    },
    include: [{ model: Contact, as: 'contact' }],
  });

  let queued = 0;
  for (const send of sentNotReplied) {
    if (!send.sequence_id || !send.step_number) continue;

    const contact = (send as any).contact as Contact;
    if (!contact || contact.suppressed) continue;
    // Skip if contact already replied, signed up, etc.
    if (['replied', 'interested', 'not_interested', 'signed_up', 'booked', 'converted', 'unsubscribed', 'bounced'].includes(contact.status)) continue;

    const sequence = await Sequence.findByPk(send.sequence_id);
    if (!sequence || sequence.status !== 'active') continue;

    const steps = sequence.steps as any[];
    const nextStepNum = send.step_number + 1;
    const nextStep = steps.find((s: any) => s.step === nextStepNum);
    if (!nextStep) continue;

    // Check if enough time has passed
    const sentAt = send.sent_at;
    if (!sentAt) continue;
    const daysSinceSent = (Date.now() - sentAt.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceSent < nextStep.delay_days) continue;

    // Check if follow-up already queued/sent
    const existing = await Send.findOne({
      where: {
        contact_id: send.contact_id,
        sequence_id: send.sequence_id,
        step_number: nextStepNum,
      },
    });
    if (existing) continue;

    // Queue the follow-up
    await Send.create({
      contact_id: send.contact_id,
      sequence_id: send.sequence_id,
      step_number: nextStepNum,
      sender_email: send.sender_email,
      subject: replaceVars(nextStep.subject, contact),
      body: replaceVars(nextStep.body, contact),
      status: 'queued',
    });
    queued++;
  }

  if (queued > 0) console.log(`Queued ${queued} follow-up emails`);
  return queued;
}

function replaceVars(text: string, contact: Contact): string {
  return text
    .replace(/\{\{name\}\}/g, contact.name || contact.first_name || 'there')
    .replace(/\{\{first_name\}\}/g, contact.first_name || contact.name?.split(' ')[0] || 'there')
    .replace(/\{\{company\}\}/g, contact.company || 'your company')
    .replace(/\{\{email\}\}/g, contact.email)
    .replace(/\{\{platform\}\}/g, contact.platform || '')
    .replace(/\{\{niche\}\}/g, contact.niche || '');
}

export function startScheduler() {
  console.log('Starting scheduler...');

  // Process send queue every 2 minutes
  cron.schedule('*/2 * * * *', async () => {
    try {
      const sent = await processQueue();
      if (sent > 0) console.log(`Processed queue: ${sent} emails sent`);
    } catch (err) {
      console.error('Queue processing error:', err);
    }
  });

  // Queue follow-ups every 30 minutes
  cron.schedule('*/30 * * * *', async () => {
    try {
      await queueFollowUps();
    } catch (err) {
      console.error('Follow-up queuing error:', err);
    }
  });

  // Check Talkspresso conversions every 30 minutes
  cron.schedule('15,45 * * * *', async () => {
    try {
      await checkConversions();
    } catch (err) {
      console.error('Conversion check error:', err);
    }
  });

  // Daily enrollment: run at 8am CT — enroll new contacts into persona sequences
  cron.schedule('0 8 * * *', async () => {
    try {
      const count = await enrollContacts();
      if (count > 0) console.log(`Daily enrollment complete: ${count} contacts enrolled`);
    } catch (err) {
      console.error('Daily enrollment error:', err);
    }
  }, { timezone: 'America/Chicago' });

  // Reset daily send counters at midnight CT + apply warmup limit
  cron.schedule('0 0 * * *', async () => {
    try {
      await resetDailyCounters();
      await applyWarmupLimit();
    } catch (err) {
      console.error('Daily reset error:', err);
    }
  }, { timezone: 'America/Chicago' });

  // Apply warmup limit on startup too
  applyWarmupLimit().catch(err => console.error('Warmup init error:', err));

  console.log('Scheduler started: queue (2m), follow-ups (30m), conversions (30m), enrollment (8am CT), daily reset (midnight CT)');
}
