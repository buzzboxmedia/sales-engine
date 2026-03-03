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
