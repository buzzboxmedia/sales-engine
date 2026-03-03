import { Router, Request, Response } from 'express';
import { Sequence, Contact, Send } from '../models/index.js';

const router = Router();
const param = (v: string | string[]) => Array.isArray(v) ? v[0] : v;

const SEQUENCE_FIELDS = ['name', 'subject', 'steps', 'status'] as const;

function pick<T extends Record<string, any>>(obj: T, fields: readonly string[]): Partial<T> {
  const result: any = {};
  for (const key of fields) {
    if (key in obj) result[key] = obj[key];
  }
  return result;
}

// List sequences
router.get('/', async (req: Request, res: Response) => {
  const sequences = await Sequence.findAll({ order: [['created_at', 'DESC']] });
  res.json(sequences);
});

// Get sequence
router.get('/:id', async (req: Request, res: Response) => {
  const seq = await Sequence.findByPk(param(req.params.id));
  if (!seq) { res.status(404).json({ error: 'Sequence not found' }); return; }
  res.json(seq);
});

// Create sequence
router.post('/', async (req: Request, res: Response) => {
  const seq = await Sequence.create(pick(req.body, SEQUENCE_FIELDS) as any);
  res.status(201).json(seq);
});

// Update sequence
router.patch('/:id', async (req: Request, res: Response) => {
  const seq = await Sequence.findByPk(param(req.params.id));
  if (!seq) { res.status(404).json({ error: 'Sequence not found' }); return; }
  await seq.update({ ...pick(req.body, SEQUENCE_FIELDS), updated_at: new Date() });
  res.json(seq);
});

// Delete a sequence
router.delete('/:id', async (req: Request, res: Response) => {
  const seq = await Sequence.findByPk(param(req.params.id));
  if (!seq) { res.status(404).json({ error: 'Sequence not found' }); return; }
  await seq.destroy();
  res.json({ success: true });
});

// Enroll a contact in a sequence (queue step 1)
router.post('/:id/enroll', async (req: Request, res: Response) => {
  const { contact_id, sender_email } = req.body;
  const seq = await Sequence.findByPk(param(req.params.id));
  if (!seq) { res.status(404).json({ error: 'Sequence not found' }); return; }

  const contact = await Contact.findByPk(contact_id);
  if (!contact) { res.status(404).json({ error: 'Contact not found' }); return; }
  if (contact.suppressed) { res.status(400).json({ error: 'Contact is suppressed' }); return; }

  const steps = seq.steps as any[];
  if (!steps.length) { res.status(400).json({ error: 'Sequence has no steps' }); return; }

  // Check if already enrolled
  const existing = await Send.findOne({
    where: { contact_id, sequence_id: seq.id },
  });
  if (existing) { res.status(400).json({ error: 'Already enrolled in this sequence' }); return; }

  const firstStep = steps[0];
  // Replace template vars
  const body = replaceVars(firstStep.body, contact);
  const subject = replaceVars(firstStep.subject, contact);

  const send = await Send.create({
    contact_id,
    sequence_id: seq.id,
    step_number: 1,
    sender_email: sender_email || 'baron@trytalkspresso.com',
    subject,
    body,
    status: 'queued',
  });

  await contact.update({ status: 'contacted', updated_at: new Date() });
  res.status(201).json(send);
});

// Bulk enroll contacts in a sequence
router.post('/:id/enroll-bulk', async (req: Request, res: Response) => {
  const { contact_ids, sender_email } = req.body;
  const seq = await Sequence.findByPk(param(req.params.id));
  if (!seq) { res.status(404).json({ error: 'Sequence not found' }); return; }

  const steps = seq.steps as any[];
  if (!steps.length) { res.status(400).json({ error: 'Sequence has no steps' }); return; }

  let queued = 0, skipped = 0;
  for (const contact_id of contact_ids) {
    const contact = await Contact.findByPk(contact_id);
    if (!contact || contact.suppressed) { skipped++; continue; }

    const existing = await Send.findOne({ where: { contact_id, sequence_id: seq.id } });
    if (existing) { skipped++; continue; }

    const firstStep = steps[0];
    await Send.create({
      contact_id,
      sequence_id: seq.id,
      step_number: 1,
      sender_email: sender_email || 'baron@trytalkspresso.com',
      subject: replaceVars(firstStep.subject, contact),
      body: replaceVars(firstStep.body, contact),
      status: 'queued',
    });
    await contact.update({ status: 'contacted', updated_at: new Date() });
    queued++;
  }

  res.json({ queued, skipped });
});

// Get enrollees and their step progress for a sequence
router.get('/:id/enrollees', async (req: Request, res: Response) => {
  const seq = await Sequence.findByPk(param(req.params.id));
  if (!seq) { res.status(404).json({ error: 'Sequence not found' }); return; }

  const limit = Math.min(parseInt(req.query.limit as string) || 100, 500);
  const offset = parseInt(req.query.offset as string) || 0;

  // Get all sends for this sequence grouped by contact
  const sends = await Send.findAll({
    where: { sequence_id: seq.id },
    include: [{ model: Contact, as: 'contact', attributes: ['id', 'name', 'first_name', 'email', 'status'] }],
    order: [['step_number', 'ASC']],
  });

  // Group by contact
  const contactMap = new Map<string, {
    contact_id: string;
    name: string;
    email: string;
    contact_status: string;
    steps: Array<{ step: number; status: string; sent_at: string | null; opened_at: string | null; open_count: number; click_count: number; replied_at: string | null; reply_category: string | null }>;
  }>();

  for (const send of sends) {
    const c = (send as any).contact;
    if (!c) continue;
    if (!contactMap.has(c.id)) {
      contactMap.set(c.id, {
        contact_id: c.id,
        name: c.name || c.first_name || c.email,
        email: c.email,
        contact_status: c.status,
        steps: [],
      });
    }
    contactMap.get(c.id)!.steps.push({
      step: send.step_number || 1,
      status: send.status,
      sent_at: send.sent_at?.toISOString() || null,
      opened_at: send.opened_at?.toISOString() || null,
      open_count: send.open_count || 0,
      click_count: send.click_count || 0,
      replied_at: send.replied_at?.toISOString() || null,
      reply_category: send.reply_category || null,
    });
  }

  const enrollees = Array.from(contactMap.values());
  const total = enrollees.length;
  const paged = enrollees.slice(offset, offset + limit);

  const steps = seq.steps as any[];
  const stepCount = steps.length;

  // Summary counts per step
  const stepSummary = steps.map((s: any, i: number) => {
    const stepNum = i + 1;
    const stepSends = sends.filter(se => se.step_number === stepNum);
    return {
      step: stepNum,
      subject: s.subject,
      delay_days: s.delay_days,
      queued: stepSends.filter(se => se.status === 'queued').length,
      sent: stepSends.filter(se => se.status === 'sent').length,
      opened: stepSends.filter(se => (se.open_count || 0) > 0).length,
      replied: stepSends.filter(se => se.status === 'replied').length,
      bounced: stepSends.filter(se => se.status === 'bounced').length,
    };
  });

  res.json({ total, step_count: stepCount, step_summary: stepSummary, enrollees: paged });
});

function replaceVars(text: string, contact: Contact): string {
  return text
    .replace(/\{\{name\}\}/g, contact.name || contact.first_name || 'there')
    .replace(/\{\{first_name\}\}/g, contact.first_name || contact.name?.split(' ')[0] || 'there')
    .replace(/\{\{company\}\}/g, contact.company || 'your company')
    .replace(/\{\{email\}\}/g, contact.email)
    .replace(/\{\{platform\}\}/g, contact.platform || 'your platform')
    .replace(/\{\{niche\}\}/g, contact.niche || 'your space');
}

export default router;
