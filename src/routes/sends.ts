import { Router, Request, Response } from 'express';
import { Op } from 'sequelize';
import { Send, Contact } from '../models/index.js';

const router = Router();
const param = (v: string | string[]) => Array.isArray(v) ? v[0] : v;

// List sends with filtering
router.get('/', async (req: Request, res: Response) => {
  const { status, contact_id, sequence_id, limit = '50', offset = '0' } = req.query;

  const where: any = {};
  if (status) where.status = status;
  if (contact_id) where.contact_id = contact_id;
  if (sequence_id) where.sequence_id = sequence_id;

  const sends = await Send.findAndCountAll({
    where,
    include: [{ model: Contact, as: 'contact', attributes: ['id', 'email', 'name', 'company'] }],
    limit: Math.min(parseInt(limit as string), 200),
    offset: parseInt(offset as string),
    order: [['created_at', 'DESC']],
  });

  res.json({ total: sends.count, sends: sends.rows });
});

// Queue a one-off email
router.post('/queue', async (req: Request, res: Response) => {
  const { contact_id, sender_email, subject, body } = req.body;

  const contact = await Contact.findByPk(contact_id);
  if (!contact) { res.status(404).json({ error: 'Contact not found' }); return; }
  if (contact.suppressed) { res.status(400).json({ error: 'Contact is suppressed' }); return; }

  const send = await Send.create({
    contact_id,
    sender_email: sender_email || 'baron@trytalkspresso.com',
    subject,
    body,
    status: 'queued',
  });

  res.status(201).json(send);
});

// Get recent replies
router.get('/replies', async (req: Request, res: Response) => {
  const { limit = '20' } = req.query;

  const replies = await Send.findAll({
    where: { status: 'replied' },
    include: [{ model: Contact, as: 'contact', attributes: ['id', 'email', 'name', 'company'] }],
    order: [['replied_at', 'DESC']],
    limit: Math.min(parseInt(limit as string), 200),
  });

  res.json(replies);
});

// Mark a send as replied (manual)
router.post('/:id/reply', async (req: Request, res: Response) => {
  const { reply_category, reply_snippet } = req.body;
  const send = await Send.findByPk(param(req.params.id));
  if (!send) { res.status(404).json({ error: 'Send not found' }); return; }

  await send.update({
    status: 'replied',
    replied_at: new Date(),
    reply_category: reply_category || 'interested',
    reply_snippet: reply_snippet || null,
  });

  // Update contact status based on reply category
  const contact = await Contact.findByPk(send.contact_id);
  if (contact) {
    const statusMap: Record<string, string> = {
      interested: 'interested',
      not_interested: 'not_interested',
      unsubscribe: 'unsubscribed',
      auto_reply: contact.status, // keep current
    };
    const newStatus = statusMap[reply_category] || 'replied';
    await contact.update({ status: newStatus, updated_at: new Date() });
  }

  res.json(send);
});

export default router;
