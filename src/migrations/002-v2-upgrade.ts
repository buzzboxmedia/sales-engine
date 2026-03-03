import dotenv from 'dotenv';
dotenv.config();

import { sequelize } from '../db.js';

async function migrate() {
  console.log('Running migration 002-v2-upgrade...');

  // companies
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS sales_engine.companies (
      id TEXT PRIMARY KEY,
      project TEXT NOT NULL DEFAULT 'talkspresso',
      name TEXT NOT NULL,
      domain TEXT,
      industry TEXT,
      size TEXT,
      website TEXT,
      linkedin_url TEXT,
      metadata JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await sequelize.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'companies_project_domain_unique'
        AND conrelid = 'sales_engine.companies'::regclass
      ) THEN
        ALTER TABLE sales_engine.companies
          ADD CONSTRAINT companies_project_domain_unique UNIQUE (project, domain);
      END IF;
    END $$
  `);
  console.log('Table companies created');

  // email_events
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS sales_engine.email_events (
      id TEXT PRIMARY KEY,
      send_id TEXT REFERENCES sales_engine.sends(id),
      event_type TEXT NOT NULL,
      metadata JSONB NOT NULL DEFAULT '{}',
      occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await sequelize.query('CREATE INDEX IF NOT EXISTS idx_email_events_send_id ON sales_engine.email_events (send_id)');
  await sequelize.query('CREATE INDEX IF NOT EXISTS idx_email_events_type ON sales_engine.email_events (event_type)');
  console.log('Table email_events created');

  // lists
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS sales_engine.lists (
      id TEXT PRIMARY KEY,
      project TEXT NOT NULL DEFAULT 'talkspresso',
      name TEXT NOT NULL,
      description TEXT,
      filter_criteria JSONB,
      is_dynamic BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  console.log('Table lists created');

  // list_members
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS sales_engine.list_members (
      list_id TEXT NOT NULL REFERENCES sales_engine.lists(id),
      contact_id TEXT NOT NULL REFERENCES sales_engine.contacts(id),
      added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (list_id, contact_id)
    )
  `);
  console.log('Table list_members created');

  // email_templates
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS sales_engine.email_templates (
      id TEXT PRIMARY KEY,
      project TEXT NOT NULL DEFAULT 'talkspresso',
      name TEXT NOT NULL,
      subject TEXT NOT NULL,
      html_body TEXT NOT NULL,
      text_body TEXT,
      category TEXT NOT NULL DEFAULT 'outreach',
      thumbnail_url TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  console.log('Table email_templates created');

  // activity_log
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS sales_engine.activity_log (
      id TEXT PRIMARY KEY,
      contact_id TEXT REFERENCES sales_engine.contacts(id),
      activity_type TEXT NOT NULL,
      description TEXT,
      metadata JSONB NOT NULL DEFAULT '{}',
      occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await sequelize.query('CREATE INDEX IF NOT EXISTS idx_activity_log_contact ON sales_engine.activity_log (contact_id, occurred_at DESC)');
  console.log('Table activity_log created');

  // ALTER contacts - add new columns
  await sequelize.query(`
    ALTER TABLE sales_engine.contacts
      ADD COLUMN IF NOT EXISTS company_id TEXT REFERENCES sales_engine.companies(id),
      ADD COLUMN IF NOT EXISTS lead_score INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS linkedin_url TEXT,
      ADD COLUMN IF NOT EXISTS phone TEXT,
      ADD COLUMN IF NOT EXISTS city TEXT,
      ADD COLUMN IF NOT EXISTS state TEXT,
      ADD COLUMN IF NOT EXISTS avatar_url TEXT
  `);
  await sequelize.query('CREATE INDEX IF NOT EXISTS idx_contacts_company ON sales_engine.contacts (company_id)');
  await sequelize.query('CREATE INDEX IF NOT EXISTS idx_contacts_lead_score ON sales_engine.contacts (lead_score DESC)');
  await sequelize.query('CREATE INDEX IF NOT EXISTS idx_contacts_last_activity ON sales_engine.contacts (last_activity_at DESC)');
  console.log('contacts table altered');

  // ALTER sends - add new columns
  await sequelize.query(`
    ALTER TABLE sales_engine.sends
      ADD COLUMN IF NOT EXISTS open_count INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS click_count INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS first_opened_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS last_opened_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS tracking_id TEXT
  `);
  await sequelize.query('CREATE INDEX IF NOT EXISTS idx_sends_tracking_id ON sales_engine.sends (tracking_id)');
  console.log('sends table altered');

  console.log('Migration 002-v2-upgrade complete!');
  await sequelize.close();
}

migrate().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
