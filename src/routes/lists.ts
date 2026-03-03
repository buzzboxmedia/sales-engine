import { Router, Request, Response } from 'express';
import { Op } from 'sequelize';
import { sequelize } from '../db.js';
import { List, ListMember, Contact, Send, Sequence } from '../models/index.js';

const router = Router();
const param = (v: string | string[]) => Array.isArray(v) ? v[0] : v;

const LIST_CREATE_FIELDS = ['name', 'description', 'is_dynamic', 'filter_criteria'] as const;
const LIST_UPDATE_FIELDS = ['name', 'description', 'filter_criteria'] as const;

function pick<T extends Record<string, any>>(obj: T, fields: readonly string[]): Partial<T> {
  const result: any = {};
  for (const key of fields) {
    if (key in obj) result[key] = obj[key];
  }
  return result;
}

// Build a WHERE clause from filter_criteria for dynamic lists
// Supported filters: { status, platform, niche, source, min_lead_score, tag, suppressed }
function buildDynamicWhere(criteria: any): any {
  const where: any = {};
  if (criteria.status) where.status = criteria.status;
  if (criteria.platform) where.platform = criteria.platform;
  if (criteria.niche) where.niche = criteria.niche;
  if (criteria.source) where.source = criteria.source;
  if (criteria.suppressed !== undefined) where.suppressed = criteria.suppressed;
  if (criteria.tag) where.tags = { [Op.contains]: [criteria.tag] };
  if (criteria.min_lead_score !== undefined) {
    where.lead_score = { [Op.gte]: criteria.min_lead_score };
  }
  return where;
}

// GET /api/lists - List all lists with member counts
router.get('/', async (_req: Request, res: Response) => {
  const lists = await List.findAll({ order: [['created_at', 'DESC']] });

  const results = await Promise.all(lists.map(async (list) => {
    let member_count: number;
    if (list.is_dynamic && list.filter_criteria) {
      member_count = await Contact.count({ where: buildDynamicWhere(list.filter_criteria) });
    } else {
      member_count = await ListMember.count({ where: { list_id: list.id } });
    }
    return { ...list.toJSON(), member_count };
  }));

  res.json(results);
});

// GET /api/lists/:id - Get list with members
router.get('/:id', async (req: Request, res: Response) => {
  const list = await List.findByPk(param(req.params.id));
  if (!list) { res.status(404).json({ error: 'List not found' }); return; }

  let contacts: Contact[];
  if (list.is_dynamic && list.filter_criteria) {
    contacts = await Contact.findAll({
      where: buildDynamicWhere(list.filter_criteria),
      order: [['created_at', 'DESC']],
      limit: 500,
    });
  } else {
    contacts = await Contact.findAll({
      include: [{ model: List, as: 'lists', where: { id: list.id }, attributes: [] }],
      order: [['created_at', 'DESC']],
    });
  }

  res.json({ ...list.toJSON(), member_count: contacts.length, contacts });
});

// POST /api/lists - Create list
router.post('/', async (req: Request, res: Response) => {
  const data = pick(req.body, LIST_CREATE_FIELDS) as any;
  if (!data.name) { res.status(400).json({ error: 'name is required' }); return; }
  const list = await List.create(data);
  res.status(201).json(list);
});

// PATCH /api/lists/:id - Update list
router.patch('/:id', async (req: Request, res: Response) => {
  const list = await List.findByPk(param(req.params.id));
  if (!list) { res.status(404).json({ error: 'List not found' }); return; }
  await list.update({ ...pick(req.body, LIST_UPDATE_FIELDS), updated_at: new Date() });
  res.json(list);
});

// DELETE /api/lists/:id - Delete list and memberships
router.delete('/:id', async (req: Request, res: Response) => {
  const list = await List.findByPk(param(req.params.id));
  if (!list) { res.status(404).json({ error: 'List not found' }); return; }
  await ListMember.destroy({ where: { list_id: list.id } });
  await list.destroy();
  res.json({ ok: true });
});

// POST /api/lists/:id/members - Add contacts to list
router.post('/:id/members', async (req: Request, res: Response) => {
  const list = await List.findByPk(param(req.params.id));
  if (!list) { res.status(404).json({ error: 'List not found' }); return; }

  const { contact_ids } = req.body;
  if (!Array.isArray(contact_ids) || contact_ids.length === 0) {
    res.status(400).json({ error: 'contact_ids array required' });
    return;
  }

  let added = 0, skipped = 0;
  for (const contact_id of contact_ids) {
    const [, created] = await ListMember.findOrCreate({
      where: { list_id: list.id, contact_id },
      defaults: { list_id: list.id, contact_id },
    });
    if (created) added++; else skipped++;
  }

  res.json({ added, skipped });
});

// DELETE /api/lists/:id/members/:contactId - Remove contact from list
router.delete('/:id/members/:contactId', async (req: Request, res: Response) => {
  const deleted = await ListMember.destroy({
    where: {
      list_id: param(req.params.id),
      contact_id: param(req.params.contactId),
    },
  });
  if (!deleted) { res.status(404).json({ error: 'Member not found' }); return; }
  res.json({ ok: true });
});

// POST /api/lists/:id/enroll-sequence - Enroll all list members in a sequence
router.post('/:id/enroll-sequence', async (req: Request, res: Response) => {
  const list = await List.findByPk(param(req.params.id));
  if (!list) { res.status(404).json({ error: 'List not found' }); return; }

  const { sequence_id, sender_email } = req.body;
  if (!sequence_id) { res.status(400).json({ error: 'sequence_id is required' }); return; }

  const seq = await Sequence.findByPk(sequence_id);
  if (!seq) { res.status(404).json({ error: 'Sequence not found' }); return; }

  const steps = seq.steps as any[];
  if (!steps.length) { res.status(400).json({ error: 'Sequence has no steps' }); return; }

  let contacts: Contact[];
  if (list.is_dynamic && list.filter_criteria) {
    contacts = await Contact.findAll({ where: buildDynamicWhere(list.filter_criteria) });
  } else {
    contacts = await Contact.findAll({
      include: [{ model: List, as: 'lists', where: { id: list.id }, attributes: [] }],
    });
  }

  let queued = 0, skipped = 0;
  const firstStep = steps[0];
  const from = sender_email || 'baron@trytalkspresso.com';

  for (const contact of contacts) {
    if (contact.suppressed) { skipped++; continue; }

    const existing = await Send.findOne({ where: { contact_id: contact.id, sequence_id: seq.id } });
    if (existing) { skipped++; continue; }

    await Send.create({
      contact_id: contact.id,
      sequence_id: seq.id,
      step_number: 1,
      sender_email: from,
      subject: replaceVars(firstStep.subject, contact),
      body: replaceVars(firstStep.body, contact),
      status: 'queued',
    });
    await contact.update({ status: 'contacted', updated_at: new Date() });
    queued++;
  }

  res.json({ queued, skipped, total: contacts.length });
});

// GET /api/lists/:id/export - CSV export
router.get('/:id/export', async (req: Request, res: Response) => {
  const list = await List.findByPk(param(req.params.id));
  if (!list) { res.status(404).json({ error: 'List not found' }); return; }

  let contacts: Contact[];
  if (list.is_dynamic && list.filter_criteria) {
    contacts = await Contact.findAll({ where: buildDynamicWhere(list.filter_criteria) });
  } else {
    contacts = await Contact.findAll({
      include: [{ model: List, as: 'lists', where: { id: list.id }, attributes: [] }],
    });
  }

  const headers = ['id', 'email', 'name', 'first_name', 'company', 'title', 'platform', 'niche', 'status', 'lead_score', 'source', 'created_at'];
  const rows = contacts.map(c =>
    headers.map(h => {
      const val = (c as any)[h];
      if (val === null || val === undefined) return '';
      const str = String(val);
      return str.includes(',') || str.includes('"') || str.includes('\n')
        ? `"${str.replace(/"/g, '""')}"` : str;
    }).join(',')
  );

  const csv = [headers.join(','), ...rows].join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="list-${list.id}.csv"`);
  res.send(csv);
});

function replaceVars(text: string, contact: Contact): string {
  return text
    .replace(/\{\{name\}\}/g, contact.name || contact.first_name || 'there')
    .replace(/\{\{first_name\}\}/g, contact.first_name || contact.name?.split(' ')[0] || 'there')
    .replace(/\{\{company\}\}/g, contact.company || 'your company')
    .replace(/\{\{email\}\}/g, contact.email)
    .replace(/\{\{platform\}\}/g, contact.platform || '')
    .replace(/\{\{niche\}\}/g, contact.niche || '');
}

export default router;
