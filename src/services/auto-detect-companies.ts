import dotenv from 'dotenv';
dotenv.config();

import { sequelize } from '../db.js';
import { Company, Contact } from '../models/index.js';
import { createId } from '@paralleldrive/cuid2';
import { Op } from 'sequelize';

const FREE_DOMAINS = new Set([
  'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'aol.com',
  'icloud.com', 'me.com', 'mail.com', 'protonmail.com', 'live.com',
  'msn.com', 'ymail.com', 'comcast.net', 'att.net', 'sbcglobal.net',
]);

async function autoDetect() {
  await sequelize.authenticate();
  console.log('Connected to database');

  const contacts = await Contact.findAll({
    where: { company_id: null, project: 'talkspresso' },
    attributes: ['id', 'email'],
  });
  console.log(`Found ${contacts.length} contacts without company`);

  const domainMap = new Map<string, string[]>();
  for (const c of contacts) {
    const domain = c.email.split('@')[1]?.toLowerCase();
    if (!domain || FREE_DOMAINS.has(domain)) continue;
    if (!domainMap.has(domain)) domainMap.set(domain, []);
    domainMap.get(domain)!.push(c.id);
  }

  let companiesCreated = 0, contactsAssigned = 0;
  for (const [domain, contactIds] of domainMap) {
    if (contactIds.length < 2) continue;

    let company = await Company.findOne({ where: { domain, project: 'talkspresso' } });
    if (!company) {
      const name = domain.split('.')[0];
      company = await Company.create({
        id: createId(),
        project: 'talkspresso',
        name: name.charAt(0).toUpperCase() + name.slice(1),
        domain,
      });
      companiesCreated++;
    }

    await Contact.update(
      { company_id: company.id },
      { where: { id: { [Op.in]: contactIds } } },
    );
    contactsAssigned += contactIds.length;
  }

  console.log(`Done: ${companiesCreated} companies created, ${contactsAssigned} contacts assigned`);
  process.exit(0);
}

autoDetect().catch(e => { console.error(e); process.exit(1); });
