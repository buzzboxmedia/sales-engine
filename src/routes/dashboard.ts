import { Router, Request, Response } from 'express';
import { Op, fn, col, literal } from 'sequelize';
import { sequelize } from '../db.js';
import { Contact, Send, Conversion, Sequence } from '../models/index.js';

const router = Router();

// Funnel metrics
router.get('/funnel', async (req: Request, res: Response) => {
  const { project = 'talkspresso' } = req.query;

  const [statusCounts] = await sequelize.query(`
    SELECT status, COUNT(*) as count
    FROM sales_engine.contacts
    WHERE project = :project
    GROUP BY status
  `, { replacements: { project } });

  const totalContacts = await Contact.count({ where: { project: project as string } });
  const totalSent = await Send.count({ where: { status: { [Op.ne]: 'queued' } } });
  const totalReplied = await Send.count({ where: { status: 'replied' } });
  const totalBounced = await Send.count({ where: { status: 'bounced' } });

  const signedUp = await Contact.count({ where: { project: project as string, status: { [Op.in]: ['signed_up', 'booked', 'converted'] } } });
  const booked = await Contact.count({ where: { project: project as string, status: { [Op.in]: ['booked', 'converted'] } } });
  const converted = await Contact.count({ where: { project: project as string, status: 'converted' } });

  res.json({
    total_contacts: totalContacts,
    funnel: {
      emailed: totalSent,
      replied: totalReplied,
      bounced: totalBounced,
      signed_up: signedUp,
      booked,
      converted,
    },
    conversion_rates: {
      reply_rate: totalSent > 0 ? ((totalReplied / totalSent) * 100).toFixed(1) + '%' : '0%',
      signup_rate: totalReplied > 0 ? ((signedUp / totalReplied) * 100).toFixed(1) + '%' : '0%',
      book_rate: signedUp > 0 ? ((booked / signedUp) * 100).toFixed(1) + '%' : '0%',
    },
    status_breakdown: statusCounts,
  });
});

// Activity feed (recent sends + replies)
router.get('/activity', async (req: Request, res: Response) => {
  const { limit = '30' } = req.query;

  const recentSends = await Send.findAll({
    where: { status: { [Op.ne]: 'queued' } },
    include: [{ model: Contact, as: 'contact', attributes: ['id', 'email', 'name', 'company'] }],
    order: [['sent_at', 'DESC']],
    limit: parseInt(limit as string),
  });

  const recentReplies = await Send.findAll({
    where: { status: 'replied' },
    include: [{ model: Contact, as: 'contact', attributes: ['id', 'email', 'name', 'company'] }],
    order: [['replied_at', 'DESC']],
    limit: 10,
  });

  res.json({ recent_sends: recentSends, recent_replies: recentReplies });
});

// Reply breakdown
router.get('/replies', async (req: Request, res: Response) => {
  const [categories] = await sequelize.query(`
    SELECT reply_category, COUNT(*) as count
    FROM sales_engine.sends
    WHERE status = 'replied'
    GROUP BY reply_category
  `);

  res.json(categories);
});

// Daily stats for charting
router.get('/daily', async (req: Request, res: Response) => {
  const { days = '30' } = req.query;
  const safeDays = Math.max(1, Math.min(365, parseInt(days as string) || 30));

  const [daily] = await sequelize.query(`
    SELECT
      DATE(sent_at) as date,
      COUNT(*) as sent,
      COUNT(*) FILTER (WHERE status = 'replied') as replied,
      COUNT(*) FILTER (WHERE status = 'bounced') as bounced
    FROM sales_engine.sends
    WHERE sent_at >= NOW() - INTERVAL :interval
    GROUP BY DATE(sent_at)
    ORDER BY date
  `, { replacements: { interval: `${safeDays} days` } });

  res.json(daily);
});

// Status summary (for agent check-ins)
router.get('/status', async (req: Request, res: Response) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const sentToday = await Send.count({
    where: { sent_at: { [Op.gte]: today }, status: { [Op.ne]: 'queued' } },
  });

  const repliedToday = await Send.count({
    where: { replied_at: { [Op.gte]: today } },
  });

  const queued = await Send.count({ where: { status: 'queued' } });

  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 7);

  const sentThisWeek = await Send.count({
    where: { sent_at: { [Op.gte]: weekAgo }, status: { [Op.ne]: 'queued' } },
  });

  const repliedThisWeek = await Send.count({
    where: { replied_at: { [Op.gte]: weekAgo } },
  });

  const totalContacts = await Contact.count({ where: { project: 'talkspresso' } });
  const suppressedCount = await Contact.count({ where: { suppressed: true } });

  res.json({
    today: { sent: sentToday, replied: repliedToday },
    this_week: { sent: sentThisWeek, replied: repliedThisWeek },
    queued,
    total_contacts: totalContacts,
    suppressed: suppressedCount,
  });
});

// Schedule: queued sends + projected future sends for next 30 days
router.get('/schedule', async (req: Request, res: Response) => {
  const { days = '30' } = req.query;
  const safeDays = Math.max(1, Math.min(90, parseInt(days as string) || 30));

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const rangeEnd = new Date(today);
  rangeEnd.setDate(rangeEnd.getDate() + safeDays);

  // --- 1. Queued sends (already in the queue) ---
  const queuedSends = await Send.findAll({
    where: {
      status: 'queued',
      created_at: { [Op.lte]: rangeEnd },
    },
    include: [
      { model: Contact, as: 'contact', attributes: ['id', 'name', 'email'] },
      { model: Sequence, as: 'sequence', attributes: ['id', 'name'] },
    ],
  });

  // --- 2. Projected sends: find active 'sent' sends with a next step pending ---
  // Contacts not in a terminal status
  const terminalStatuses = ['replied', 'interested', 'not_interested', 'signed_up', 'booked', 'converted', 'unsubscribed', 'bounced'];

  const sentNotReplied = await Send.findAll({
    where: {
      status: 'sent',
      sequence_id: { [Op.ne]: null },
      replied_at: null,
    },
    include: [
      {
        model: Contact,
        as: 'contact',
        attributes: ['id', 'name', 'email', 'status', 'suppressed'],
        where: {
          suppressed: false,
          status: { [Op.notIn]: terminalStatuses },
        },
      },
      { model: Sequence, as: 'sequence', attributes: ['id', 'name', 'steps', 'status'] },
    ],
  });

  // Build a set of (contact_id, sequence_id, step_number) that already have a queued/sent record
  const existingKeys = new Set<string>();
  const allExisting = await Send.findAll({
    where: {
      status: { [Op.in]: ['queued', 'sent'] },
      sequence_id: { [Op.ne]: null },
    },
    attributes: ['contact_id', 'sequence_id', 'step_number'],
  });
  for (const s of allExisting) {
    existingKeys.add(`${s.contact_id}:${s.sequence_id}:${s.step_number}`);
  }

  type ScheduleSend = {
    date: string;
    contact_name: string;
    contact_email: string;
    sequence_name: string | null;
    step_number: number;
    subject: string;
    status: 'queued' | 'projected';
  };

  const projected: ScheduleSend[] = [];
  const dayMap = new Map<string, ScheduleSend[]>();

  for (const send of sentNotReplied) {
    if (!send.sequence_id || !send.step_number || !send.sent_at) continue;

    const contact = (send as any).contact;
    const sequence = (send as any).sequence;
    if (!contact || !sequence || sequence.status !== 'active') continue;

    const steps = sequence.steps as Array<{ step: number; delay_days: number; subject: string; body: string }>;
    const nextStepNum = send.step_number + 1;
    const nextStep = steps.find(s => s.step === nextStepNum);
    if (!nextStep) continue;

    // Skip if already queued or sent
    const key = `${send.contact_id}:${send.sequence_id}:${nextStepNum}`;
    if (existingKeys.has(key)) continue;

    // Calculate projected fire date
    const projectedDate = new Date(send.sent_at);
    projectedDate.setDate(projectedDate.getDate() + nextStep.delay_days);
    projectedDate.setHours(0, 0, 0, 0);

    if (projectedDate < today || projectedDate >= rangeEnd) continue;

    projected.push({
      date: projectedDate.toISOString().slice(0, 10),
      contact_name: contact.name || contact.email,
      contact_email: contact.email,
      sequence_name: sequence.name,
      step_number: nextStepNum,
      subject: nextStep.subject,
      status: 'projected',
    });
  }

  // --- 3. Group everything by date ---

  for (const send of queuedSends) {
    const contact = (send as any).contact;
    const sequence = (send as any).sequence;
    if (!contact) continue;

    // Queued sends go on today (they fire as soon as processed)
    const dateKey = today.toISOString().slice(0, 10);
    if (!dayMap.has(dateKey)) dayMap.set(dateKey, []);
    dayMap.get(dateKey)!.push({
      date: dateKey,
      contact_name: contact.name || contact.email,
      contact_email: contact.email,
      sequence_name: sequence?.name || null,
      step_number: send.step_number || 1,
      subject: send.subject,
      status: 'queued',
    });
  }

  for (const item of projected) {
    if (!dayMap.has(item.date)) dayMap.set(item.date, []);
    dayMap.get(item.date)!.push(item);
  }

  // Build sorted array of days with sends
  const days_arr = Array.from(dayMap.entries())
    .map(([date, sends]) => ({ date, sends }))
    .sort((a, b) => a.date.localeCompare(b.date));

  res.json({ days: days_arr });
});

export default router;
