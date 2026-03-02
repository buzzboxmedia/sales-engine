import { Router, Request, Response } from 'express';
import { Op, fn, col, literal } from 'sequelize';
import { sequelize } from '../db.js';
import { Contact, Send, Conversion } from '../models/index.js';

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

export default router;
