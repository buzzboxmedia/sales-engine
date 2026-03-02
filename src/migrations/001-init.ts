import dotenv from 'dotenv';
dotenv.config();

import { sequelize } from '../db.js';

async function migrate() {
  console.log('Running migration 001-init...');

  // Create schema
  await sequelize.query('CREATE SCHEMA IF NOT EXISTS sales_engine');
  console.log('Schema sales_engine created');

  // contacts
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS sales_engine.contacts (
      id TEXT PRIMARY KEY,
      project TEXT NOT NULL DEFAULT 'talkspresso',
      email TEXT NOT NULL,
      name TEXT,
      first_name TEXT,
      company TEXT,
      title TEXT,
      platform TEXT,
      niche TEXT,
      profile_url TEXT,
      followers INTEGER,
      source TEXT NOT NULL DEFAULT 'manual',
      status TEXT NOT NULL DEFAULT 'new',
      talkspresso_user_id TEXT,
      suppressed BOOLEAN NOT NULL DEFAULT false,
      tags TEXT[] NOT NULL DEFAULT '{}',
      notes JSONB,
      metadata JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (project, email)
    )
  `);
  await sequelize.query('CREATE INDEX IF NOT EXISTS idx_contacts_status ON sales_engine.contacts (status)');
  await sequelize.query('CREATE INDEX IF NOT EXISTS idx_contacts_project ON sales_engine.contacts (project)');
  await sequelize.query('CREATE INDEX IF NOT EXISTS idx_contacts_talkspresso_user ON sales_engine.contacts (talkspresso_user_id)');
  console.log('Table contacts created');

  // sequences
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS sales_engine.sequences (
      id TEXT PRIMARY KEY,
      project TEXT NOT NULL DEFAULT 'talkspresso',
      name TEXT NOT NULL,
      steps JSONB NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'active',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  console.log('Table sequences created');

  // sends
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS sales_engine.sends (
      id TEXT PRIMARY KEY,
      contact_id TEXT NOT NULL REFERENCES sales_engine.contacts(id),
      sequence_id TEXT REFERENCES sales_engine.sequences(id),
      step_number INTEGER,
      sender_email TEXT NOT NULL,
      subject TEXT NOT NULL,
      body TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued',
      sent_at TIMESTAMPTZ,
      opened_at TIMESTAMPTZ,
      replied_at TIMESTAMPTZ,
      bounced_at TIMESTAMPTZ,
      reply_category TEXT,
      reply_snippet TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await sequelize.query('CREATE INDEX IF NOT EXISTS idx_sends_contact ON sales_engine.sends (contact_id)');
  await sequelize.query('CREATE INDEX IF NOT EXISTS idx_sends_sequence ON sales_engine.sends (sequence_id)');
  await sequelize.query('CREATE INDEX IF NOT EXISTS idx_sends_status ON sales_engine.sends (status)');
  await sequelize.query('CREATE INDEX IF NOT EXISTS idx_sends_sent_at ON sales_engine.sends (sent_at)');
  console.log('Table sends created');

  // sending_accounts
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS sales_engine.sending_accounts (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      app_password TEXT NOT NULL,
      daily_limit INTEGER NOT NULL DEFAULT 30,
      daily_sent INTEGER NOT NULL DEFAULT 0,
      warmup_complete BOOLEAN NOT NULL DEFAULT false,
      status TEXT NOT NULL DEFAULT 'warmup',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  console.log('Table sending_accounts created');

  // conversions
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS sales_engine.conversions (
      id TEXT PRIMARY KEY,
      contact_id TEXT NOT NULL REFERENCES sales_engine.contacts(id),
      event_type TEXT NOT NULL,
      event_data JSONB,
      occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await sequelize.query('CREATE INDEX IF NOT EXISTS idx_conversions_contact ON sales_engine.conversions (contact_id)');
  await sequelize.query('CREATE INDEX IF NOT EXISTS idx_conversions_type ON sales_engine.conversions (event_type)');
  console.log('Table conversions created');

  console.log('Migration 001-init complete!');
  await sequelize.close();
}

migrate().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
