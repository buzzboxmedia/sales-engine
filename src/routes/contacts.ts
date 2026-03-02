import { Router, Request, Response } from 'express';
import { Op } from 'sequelize';
import { Contact, Send, Conversion } from '../models/index.js';

const router = Router();
const param = (v: string | string[]) => Array.isArray(v) ? v[0] : v;

// List contacts with filtering
router.get('/', async (req: Request, res: Response) => {
  const { status, source, project, search, tag, suppressed, limit = '50', offset = '0' } = req.query;

  const where: any = {};
  if (status) where.status = status;
  if (source) where.source = source;
  if (project) where.project = project;
  if (suppressed !== undefined) where.suppressed = suppressed === 'true';
  if (tag) where.tags = { [Op.contains]: [tag as string] };
  if (search) {
    where[Op.or] = [
      { email: { [Op.iLike]: `%${search}%` } },
      { name: { [Op.iLike]: `%${search}%` } },
      { company: { [Op.iLike]: `%${search}%` } },
    ];
  }

  const contacts = await Contact.findAndCountAll({
    where,
    limit: Math.min(parseInt(limit as string), 200),
    offset: parseInt(offset as string),
    order: [['created_at', 'DESC']],
  });

  res.json({ total: contacts.count, contacts: contacts.rows });
});

// Get single contact with sends + conversions
router.get('/:id', async (req: Request, res: Response) => {
  const contact = await Contact.findByPk(param(req.params.id), {
    include: [
      { model: Send, as: 'sends', order: [['created_at', 'DESC']] },
      { model: Conversion, as: 'conversions', order: [['occurred_at', 'DESC']] },
    ],
  });
  if (!contact) { res.status(404).json({ error: 'Contact not found' }); return; }
  res.json(contact);
});

// Create contact
router.post('/', async (req: Request, res: Response) => {
  const contact = await Contact.create(req.body);
  res.status(201).json(contact);
});

// Update contact
router.patch('/:id', async (req: Request, res: Response) => {
  const contact = await Contact.findByPk(param(req.params.id));
  if (!contact) { res.status(404).json({ error: 'Contact not found' }); return; }
  await contact.update({ ...req.body, updated_at: new Date() });
  res.json(contact);
});

// Bulk import contacts
router.post('/import', async (req: Request, res: Response) => {
  const { contacts } = req.body;
  if (!Array.isArray(contacts)) { res.status(400).json({ error: 'contacts array required' }); return; }

  let created = 0, skipped = 0;
  for (const c of contacts) {
    try {
      await Contact.create(c);
      created++;
    } catch (err: any) {
      if (err.name === 'SequelizeUniqueConstraintError') {
        skipped++;
      } else {
        throw err;
      }
    }
  }

  res.json({ created, skipped, total: contacts.length });
});

// Suppress contact (master do-not-email)
router.post('/:id/suppress', async (req: Request, res: Response) => {
  const contact = await Contact.findByPk(param(req.params.id));
  if (!contact) { res.status(404).json({ error: 'Contact not found' }); return; }
  await contact.update({ suppressed: true, status: 'unsubscribed', updated_at: new Date() });
  res.json({ ok: true });
});

// Search by email (exact)
router.get('/lookup/:email', async (req: Request, res: Response) => {
  const contact = await Contact.findOne({
    where: { email: param(req.params.email).toLowerCase() },
    include: [
      { model: Send, as: 'sends' },
      { model: Conversion, as: 'conversions' },
    ],
  });
  if (!contact) { res.status(404).json({ error: 'Contact not found' }); return; }
  res.json(contact);
});

export default router;
