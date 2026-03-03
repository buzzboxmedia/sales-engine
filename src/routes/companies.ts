import { Router, Request, Response } from 'express';
import { Op, fn, col, literal } from 'sequelize';
import { Company, Contact, Send } from '../models/index.js';

const router = Router();
const param = (v: string | string[]) => Array.isArray(v) ? v[0] : v;

const COMPANY_CREATE_FIELDS = ['name', 'domain', 'industry', 'size', 'website', 'linkedin_url'] as const;
const COMPANY_UPDATE_FIELDS = ['name', 'domain', 'industry', 'size', 'website', 'linkedin_url', 'metadata'] as const;

const FREE_DOMAINS = new Set([
  'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'aol.com',
  'icloud.com', 'me.com', 'mail.com', 'protonmail.com', 'live.com',
  'msn.com', 'yahoo.co.uk', 'googlemail.com',
]);

function pick<T extends Record<string, any>>(obj: T, fields: readonly string[]): Partial<T> {
  const result: any = {};
  for (const key of fields) {
    if (key in obj) result[key] = obj[key];
  }
  return result;
}

// GET /api/companies - List companies with contact counts and aggregate metrics
router.get('/', async (req: Request, res: Response) => {
  const { search, limit = '50', offset = '0' } = req.query;

  const where: any = {};
  if (search) {
    where[Op.or] = [
      { name: { [Op.iLike]: `%${search}%` } },
      { domain: { [Op.iLike]: `%${search}%` } },
    ];
  }

  const companies = await Company.findAndCountAll({
    where,
    include: [
      {
        model: Contact,
        as: 'contacts',
        attributes: ['id', 'lead_score', 'status'],
        required: false,
      },
    ],
    limit: Math.min(parseInt(limit as string), 200),
    offset: parseInt(offset as string),
    order: [['created_at', 'DESC']],
    distinct: true,
  });

  const results = companies.rows.map((company) => {
    const contacts = (company as any).contacts as any[] || [];
    const avg_lead_score = contacts.length
      ? Math.round(contacts.reduce((sum: number, c: any) => sum + (c.lead_score || 0), 0) / contacts.length)
      : 0;
    return {
      ...company.toJSON(),
      contacts: undefined,
      contact_count: contacts.length,
      avg_lead_score,
    };
  });

  res.json({ total: companies.count, companies: results });
});

// GET /api/companies/:id - Get company with all contacts
router.get('/:id', async (req: Request, res: Response) => {
  const company = await Company.findByPk(param(req.params.id), {
    include: [
      {
        model: Contact,
        as: 'contacts',
        attributes: ['id', 'email', 'name', 'first_name', 'title', 'platform', 'niche', 'status', 'lead_score', 'created_at'],
        order: [['lead_score', 'DESC']],
      },
    ],
  });
  if (!company) { res.status(404).json({ error: 'Company not found' }); return; }
  res.json(company);
});

// POST /api/companies - Create company
router.post('/', async (req: Request, res: Response) => {
  const data = pick(req.body, COMPANY_CREATE_FIELDS) as any;
  if (!data.name) { res.status(400).json({ error: 'name is required' }); return; }
  const company = await Company.create(data);
  res.status(201).json(company);
});

// PATCH /api/companies/:id - Update company
router.patch('/:id', async (req: Request, res: Response) => {
  const company = await Company.findByPk(param(req.params.id));
  if (!company) { res.status(404).json({ error: 'Company not found' }); return; }
  await company.update({ ...pick(req.body, COMPANY_UPDATE_FIELDS), updated_at: new Date() });
  res.json(company);
});

// DELETE /api/companies/:id - Delete company (nullify contacts.company_id)
router.delete('/:id', async (req: Request, res: Response) => {
  const company = await Company.findByPk(param(req.params.id));
  if (!company) { res.status(404).json({ error: 'Company not found' }); return; }
  await Contact.update({ company_id: null } as any, { where: { company_id: company.id } });
  await company.destroy();
  res.json({ ok: true });
});

// POST /api/companies/auto-detect - Auto-detect companies from contact email domains
router.post('/auto-detect', async (_req: Request, res: Response) => {
  // Find all contacts without a company_id
  const contacts = await Contact.findAll({
    where: { company_id: null },
    attributes: ['id', 'email', 'project'],
  });

  // Group by domain
  const domainMap = new Map<string, { contacts: Contact[]; project: string }>();
  for (const contact of contacts) {
    const atIndex = contact.email.indexOf('@');
    if (atIndex === -1) continue;
    const domain = contact.email.slice(atIndex + 1).toLowerCase();
    if (FREE_DOMAINS.has(domain)) continue;

    if (!domainMap.has(domain)) {
      domainMap.set(domain, { contacts: [], project: contact.project });
    }
    domainMap.get(domain)!.contacts.push(contact);
  }

  let companies_created = 0;
  let contacts_assigned = 0;

  for (const [domain, { contacts: domainContacts, project }] of domainMap.entries()) {
    // Only group domains with 2+ contacts
    if (domainContacts.length < 2) continue;

    // Derive a company name from the domain (e.g. acmeinc.com -> Acmeinc)
    const namePart = domain.split('.')[0];
    const companyName = namePart.charAt(0).toUpperCase() + namePart.slice(1);

    // Find or create the company
    const [company, created] = await Company.findOrCreate({
      where: { project, domain },
      defaults: { name: companyName, domain, project, website: `https://${domain}` },
    });

    if (created) companies_created++;

    // Assign contacts to this company
    const ids = domainContacts.map(c => c.id);
    const [updated] = await Contact.update(
      { company_id: company.id } as any,
      { where: { id: ids, company_id: null } }
    );
    contacts_assigned += updated;
  }

  res.json({ companies_created, contacts_assigned });
});

export default router;
