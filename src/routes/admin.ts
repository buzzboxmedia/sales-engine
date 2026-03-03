import { Router, Request, Response } from 'express';
import { SendingAccount, Contact } from '../models/index.js';
import { Op } from 'sequelize';

const router = Router();

// List sending accounts
router.get('/sending-accounts', async (_req: Request, res: Response) => {
  const accounts = await SendingAccount.findAll();
  res.json(accounts);
});

// Update sending account (e.g. daily_limit)
router.patch('/sending-accounts/:id', async (req: Request, res: Response) => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const account = await SendingAccount.findByPk(id);
  if (!account) { res.status(404).json({ error: 'Account not found' }); return; }

  const allowed = ['daily_limit', 'status'] as const;
  const updates: any = {};
  for (const key of allowed) {
    if (key in req.body) updates[key] = req.body[key];
  }
  await account.update(updates);
  res.json(account);
});

// Get queue depth + today's send count
router.get('/sending-status', async (_req: Request, res: Response) => {
  const accounts = await SendingAccount.findAll();
  res.json({
    accounts: accounts.map(a => ({
      id: a.id,
      email: a.email,
      daily_limit: a.daily_limit,
      daily_sent: a.daily_sent,
      status: a.status,
    })),
  });
});

// Get batch of contact IDs for enrollment (status=new, not suppressed)
router.get('/contact-ids', async (req: Request, res: Response) => {
  const limit = Math.min(parseInt(req.query.limit as string) || 500, 5000);
  const offset = parseInt(req.query.offset as string) || 0;

  const contacts = await Contact.findAll({
    where: {
      status: 'new',
      suppressed: { [Op.ne]: true },
    },
    attributes: ['id'],
    order: [['created_at', 'ASC']],
    limit,
    offset,
  });

  res.json({
    count: contacts.length,
    contact_ids: contacts.map(c => c.id),
  });
});

export default router;
