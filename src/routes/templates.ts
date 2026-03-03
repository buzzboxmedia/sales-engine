import { Router, Request, Response } from 'express';
import { EmailTemplate } from '../models/index.js';
import { renderTemplate } from '../services/template-renderer.js';

const router = Router();
const param = (v: string | string[]) => Array.isArray(v) ? v[0] : v;

const TEMPLATE_CREATE_FIELDS = ['name', 'subject', 'html_body', 'text_body', 'category'] as const;
const TEMPLATE_UPDATE_FIELDS = ['name', 'subject', 'html_body', 'text_body', 'category', 'thumbnail_url'] as const;

function pick<T extends Record<string, any>>(obj: T, fields: readonly string[]): Partial<T> {
  const result: any = {};
  for (const key of fields) {
    if (key in obj) result[key] = obj[key];
  }
  return result;
}

const SAMPLE_DATA: Record<string, string> = {
  first_name: 'Sarah',
  name: 'Sarah Johnson',
  company: 'Acme Inc',
  niche: 'coaching',
  platform: 'LinkedIn',
  booking_link: 'https://talkspresso.com/book/baron',
  email: 'sarah@acmeinc.com',
  title: 'Founder',
};

// GET /api/templates - List all templates
router.get('/', async (req: Request, res: Response) => {
  const { category, project = 'talkspresso' } = req.query;

  const where: any = { project };
  if (category) where.category = category;

  const templates = await EmailTemplate.findAll({
    where,
    order: [['created_at', 'DESC']],
  });

  res.json(templates);
});

// GET /api/templates/:id - Get one template
router.get('/:id', async (req: Request, res: Response) => {
  const template = await EmailTemplate.findByPk(param(req.params.id));
  if (!template) { res.status(404).json({ error: 'Template not found' }); return; }
  res.json(template);
});

// POST /api/templates - Create template
router.post('/', async (req: Request, res: Response) => {
  const data = pick(req.body, TEMPLATE_CREATE_FIELDS) as any;
  if (!data.name || !data.subject || !data.html_body) {
    res.status(400).json({ error: 'name, subject, and html_body are required' });
    return;
  }
  const project = req.body.project || 'talkspresso';
  const template = await EmailTemplate.create({ ...data, project });
  res.status(201).json(template);
});

// PATCH /api/templates/:id - Update template
router.patch('/:id', async (req: Request, res: Response) => {
  const template = await EmailTemplate.findByPk(param(req.params.id));
  if (!template) { res.status(404).json({ error: 'Template not found' }); return; }
  await template.update({ ...pick(req.body, TEMPLATE_UPDATE_FIELDS), updated_at: new Date() });
  res.json(template);
});

// DELETE /api/templates/:id - Delete template
router.delete('/:id', async (req: Request, res: Response) => {
  const template = await EmailTemplate.findByPk(param(req.params.id));
  if (!template) { res.status(404).json({ error: 'Template not found' }); return; }
  await template.destroy();
  res.json({ ok: true });
});

// POST /api/templates/:id/preview - Render template with sample data
router.post('/:id/preview', async (req: Request, res: Response) => {
  const template = await EmailTemplate.findByPk(param(req.params.id));
  if (!template) { res.status(404).json({ error: 'Template not found' }); return; }

  // Merge request-provided data over sample defaults
  const data = { ...SAMPLE_DATA, ...(req.body || {}) };
  const rendered_html = renderTemplate(template.html_body, data);
  const rendered_subject = renderTemplate(template.subject, data);

  res.json({
    id: template.id,
    name: template.name,
    rendered_subject,
    rendered_html,
  });
});

export default router;
