import { Router, Request, Response } from 'express';
import { Op } from 'sequelize';
import { ActivityLog, Contact } from '../models/index.js';

const router = Router();

// GET /api/activity - List recent activity
router.get('/', async (req: Request, res: Response) => {
  const {
    contact_id,
    type,
    since,
    limit = '50',
  } = req.query;

  const parsedLimit = Math.min(parseInt(limit as string) || 50, 200);

  const where: any = {};
  if (contact_id) where.contact_id = contact_id;
  if (type) where.activity_type = type;
  if (since) where.occurred_at = { [Op.gte]: new Date(since as string) };

  const logs = await ActivityLog.findAll({
    where,
    include: [
      {
        model: Contact,
        as: 'contact',
        attributes: ['id', 'email', 'name', 'first_name', 'company', 'lead_score'],
        required: false,
      },
    ],
    order: [['occurred_at', 'DESC']],
    limit: parsedLimit,
  });

  res.json({ activity: logs, count: logs.length });
});

export default router;
