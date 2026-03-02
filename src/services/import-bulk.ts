/**
 * Bulk importer: loads all discovered outreach data into sales_engine.
 * Run with: npx tsx src/services/import-bulk.ts
 *
 * Sources:
 * - LinkedIn CSVs (~15K unique): agencies, coaches, consultants, influencers, etc.
 * - feb_4___all_categories.csv (~8K, separate lead gen round)
 * - Instantly category lists (~9.7K): agencies_leads, coaches_leads
 * - YouTube channels (~40 verified emails)
 * - Therapy/health (~880 emails)
 * - Email campaign archives
 */
import dotenv from 'dotenv';
dotenv.config();

import fs from 'fs';
import path from 'path';
import { sequelize } from '../db.js';
import { Contact } from '../models/index.js';
import { createId } from '@paralleldrive/cuid2';
import { Op } from 'sequelize';

const DROPBOX = resolveDropboxRoot();

function resolveDropboxRoot(): string {
  const home = process.env.HOME || '/Users/baronmiller';
  const direct = path.join(home, 'Dropbox');
  const cloudStorage = path.join(home, 'Library/CloudStorage/Dropbox');
  if (fs.existsSync(cloudStorage)) return cloudStorage;
  if (fs.existsSync(direct)) return direct;
  throw new Error('Cannot find Dropbox');
}

function dp(relativePath: string): string {
  return path.join(DROPBOX, relativePath);
}

// Smarter CSV parser that handles quoted fields with commas
function parseCSV(content: string): Record<string, string>[] {
  const lines = content.trim().split('\n');
  if (lines.length < 2) return [];

  const headers = parseCSVLine(lines[0]);
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const values = parseCSVLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h.trim()] = (values[idx] || '').trim();
    });
    rows.push(row);
  }
  return rows;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

// Extract email from a row regardless of column name casing
function getEmail(row: Record<string, string>): string | null {
  const emailKeys = ['email', 'Email', 'EMAIL', 'primary_real_email', 'business_email'];
  for (const key of emailKeys) {
    if (row[key] && row[key].includes('@')) {
      return row[key].toLowerCase().trim();
    }
  }
  // Fallback: check all values for email-like strings
  for (const val of Object.values(row)) {
    if (val && val.includes('@') && val.includes('.') && !val.includes(' ')) {
      return val.toLowerCase().trim();
    }
  }
  return null;
}

// Basic email validation
function isValidEmail(email: string): boolean {
  if (!email || !email.includes('@') || !email.includes('.')) return false;
  if (email.length < 5 || email.length > 254) return false;
  // Skip obviously bad emails
  if (email.includes('example.com') || email.includes('test@') || email.includes('noreply')) return false;
  if (email.startsWith('.') || email.endsWith('.')) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Get name from row
function getName(row: Record<string, string>): string | null {
  return row['name'] || row['Name'] || row['firstName'] || row['First Name'] || row['creator_name'] || row['companyName'] || row['org_name'] || null;
}

// Get company/website
function getCompany(row: Record<string, string>): string | null {
  return row['company'] || row['companyName'] || row['org_name'] || row['organization'] || null;
}

function getWebsite(row: Record<string, string>): string | null {
  return row['website'] || row['Website'] || row['Website/Social'] || row['url'] || null;
}

function getNiche(row: Record<string, string>): string | null {
  return row['specialty'] || row['niche'] || row['Niche'] || row['Category'] || row['type'] || row['org_type'] || null;
}

function getSource(row: Record<string, string>): string | null {
  return row['source'] || row['Source'] || null;
}

interface ImportResult {
  file: string;
  total: number;
  created: number;
  enriched: number;
  skipped: number;
  invalid: number;
}

async function importCSVFile(
  filePath: string,
  defaultSource: string,
  defaultTags: string[],
  defaultPlatform?: string,
): Promise<ImportResult> {
  const fileName = path.basename(filePath);
  const result: ImportResult = { file: fileName, total: 0, created: 0, enriched: 0, skipped: 0, invalid: 0 };

  if (!fs.existsSync(filePath)) {
    console.log(`  SKIP (not found): ${fileName}`);
    return result;
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const rows = parseCSV(content);
  result.total = rows.length;

  for (const row of rows) {
    const email = getEmail(row);
    if (!email || !isValidEmail(email)) {
      result.invalid++;
      continue;
    }

    // Check if already exists
    const existing = await Contact.findOne({ where: { email, project: 'talkspresso' } });

    if (existing) {
      // Enrich with new data if we have it
      const updates: Record<string, any> = {};
      const name = getName(row);
      const company = getCompany(row);
      const niche = getNiche(row);
      const website = getWebsite(row);

      if (name && !existing.name) updates.name = name;
      if (name && !existing.first_name) updates.first_name = name.split(' ')[0];
      if (company && !existing.company) updates.company = company;
      if (niche && !existing.niche) updates.niche = niche;
      if (website && !existing.profile_url) updates.profile_url = website;

      // Add tags without duplicates
      const newTags = [...new Set([...existing.tags, ...defaultTags])];
      if (JSON.stringify(newTags) !== JSON.stringify(existing.tags)) {
        updates.tags = newTags;
      }

      if (Object.keys(updates).length > 0) {
        updates.updated_at = new Date();
        await existing.update(updates);
        result.enriched++;
      } else {
        result.skipped++;
      }
      continue;
    }

    // Create new contact
    try {
      const name = getName(row);
      await Contact.create({
        email,
        name: name || null,
        first_name: name ? name.split(' ')[0] : null,
        company: getCompany(row) || null,
        niche: getNiche(row) || null,
        platform: defaultPlatform || null,
        profile_url: getWebsite(row) || null,
        source: defaultSource,
        tags: defaultTags,
        metadata: row['Category'] ? { category: row['Category'] } : null,
      });
      result.created++;
    } catch (err: any) {
      if (err.name === 'SequelizeUniqueConstraintError') {
        result.skipped++;
      } else {
        console.error(`  Error creating ${email}:`, err.message);
        result.skipped++;
      }
    }
  }

  console.log(`  ${fileName}: ${result.created} new, ${result.enriched} enriched, ${result.skipped} skip, ${result.invalid} invalid (${result.total} total)`);
  return result;
}

async function importEmailOnlyFile(
  filePath: string,
  defaultSource: string,
  defaultTags: string[],
): Promise<ImportResult> {
  const fileName = path.basename(filePath);
  const result: ImportResult = { file: fileName, total: 0, created: 0, enriched: 0, skipped: 0, invalid: 0 };

  if (!fs.existsSync(filePath)) {
    console.log(`  SKIP (not found): ${fileName}`);
    return result;
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.trim().split('\n');
  // Skip header if first line looks like a header
  const startIdx = lines[0].toLowerCase().includes('email') ? 1 : 0;

  for (let i = startIdx; i < lines.length; i++) {
    const email = lines[i].trim().toLowerCase();
    result.total++;
    if (!isValidEmail(email)) { result.invalid++; continue; }

    const existing = await Contact.findOne({ where: { email, project: 'talkspresso' } });
    if (existing) {
      const newTags = [...new Set([...existing.tags, ...defaultTags])];
      if (JSON.stringify(newTags) !== JSON.stringify(existing.tags)) {
        await existing.update({ tags: newTags, updated_at: new Date() });
        result.enriched++;
      } else {
        result.skipped++;
      }
      continue;
    }

    try {
      await Contact.create({ email, source: defaultSource, tags: defaultTags });
      result.created++;
    } catch {
      result.skipped++;
    }
  }

  console.log(`  ${fileName}: ${result.created} new, ${result.enriched} enriched, ${result.skipped} skip, ${result.invalid} invalid (${result.total} total)`);
  return result;
}

// --- Main ---

async function run() {
  console.log('=== Sales Engine Bulk Import ===\n');
  await sequelize.authenticate();

  const beforeCount = await Contact.count();
  console.log(`Starting contacts: ${beforeCount}\n`);

  const results: ImportResult[] = [];

  // --- LinkedIn CSVs ---
  console.log('--- LinkedIn Prospect Lists ---');
  const linkedinDir = dp('Talkspresso/tasks/completed/linkedin');

  results.push(await importCSVFile(
    path.join(linkedinDir, 'agencies.csv'),
    'linkedin', ['linkedin', 'agencies'], 'LinkedIn',
  ));
  results.push(await importCSVFile(
    path.join(linkedinDir, 'coaches.csv'),
    'linkedin', ['linkedin', 'coaches'], 'LinkedIn',
  ));
  results.push(await importCSVFile(
    path.join(linkedinDir, 'consultants.csv'),
    'linkedin', ['linkedin', 'consultants'], 'LinkedIn',
  ));
  results.push(await importCSVFile(
    path.join(linkedinDir, 'influencers.csv'),
    'linkedin', ['linkedin', 'influencers'], 'LinkedIn',
  ));
  results.push(await importCSVFile(
    path.join(linkedinDir, 'fractional_cxos.csv'),
    'linkedin', ['linkedin', 'fractional-cxo'], 'LinkedIn',
  ));
  results.push(await importCSVFile(
    path.join(linkedinDir, 'direct_market.csv'),
    'linkedin', ['linkedin', 'direct-marketing'], 'LinkedIn',
  ));
  results.push(await importCSVFile(
    path.join(linkedinDir, 'video_consultants.csv'),
    'linkedin', ['linkedin', 'video-consultants'], 'LinkedIn',
  ));
  results.push(await importCSVFile(
    path.join(linkedinDir, 'organizations.csv'),
    'linkedin', ['linkedin', 'organizations'], 'LinkedIn',
  ));

  // feb_4___all_categories.csv is a separate lead gen round, not a superset
  results.push(await importCSVFile(
    path.join(linkedinDir, 'feb_4___all_categories.csv'),
    'linkedin', ['linkedin', 'feb-4-batch'], 'LinkedIn',
  ));

  // Enriched profiles (has LinkedIn URLs)
  results.push(await importCSVFile(
    path.join(linkedinDir, 'linkedin_enriched.csv'),
    'linkedin', ['linkedin', 'enriched'], 'LinkedIn',
  ));

  // --- Instantly Category Lists ---
  console.log('\n--- Instantly Category Lists ---');
  const instantlyDir = dp('Talkspresso/tasks/completed/instantly');

  results.push(await importCSVFile(
    path.join(instantlyDir, 'agencies_leads.csv'),
    'instantly', ['instantly', 'agencies'], undefined,
  ));
  results.push(await importCSVFile(
    path.join(instantlyDir, 'coaches_leads.csv'),
    'instantly', ['instantly', 'coaches'], undefined,
  ));

  // --- YouTube Channels ---
  console.log('\n--- YouTube Channels ---');
  const ytDir = dp('Talkspresso/marketing/leads/youtube-channels');

  results.push(await importCSVFile(
    path.join(ytDir, 'channels_15k_75k_real_emails.csv'),
    'csv', ['youtube', 'channels-15k-75k'], 'YouTube',
  ));
  results.push(await importCSVFile(
    path.join(ytDir, 'OUTREACH_READY_CHANNELS.csv'),
    'csv', ['youtube', 'outreach-ready'], 'YouTube',
  ));

  // --- Therapy / Health Vertical ---
  console.log('\n--- Therapy/Health Vertical ---');
  const therapyDir = dp('Talkspresso/marketing/Email Campaigns/Channels/Therapy');

  results.push(await importEmailOnlyFile(
    path.join(therapyDir, 'extracted_emails.csv'),
    'csv', ['therapy', 'email-campaign'],
  ));

  // Check for providers_info.csv (has names)
  const providersPath = path.join(therapyDir, 'providers_info.csv');
  if (fs.existsSync(providersPath)) {
    results.push(await importCSVFile(
      providersPath,
      'csv', ['therapy', 'providers'],
    ));
  }

  const nidhwPath = path.join(therapyDir, 'NIDHW_Email_List.csv');
  if (fs.existsSync(nidhwPath)) {
    results.push(await importCSVFile(
      nidhwPath,
      'csv', ['therapy', 'nidhw'],
    ));
  }

  // --- Check for other email campaign files ---
  console.log('\n--- Other Email Campaign Archives ---');
  const campaignDir = dp('Talkspresso/marketing/Email Campaigns');
  if (fs.existsSync(campaignDir)) {
    const walkCSVs = (dir: string, depth = 0): string[] => {
      if (depth > 3) return [];
      const files: string[] = [];
      try {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          if (entry.isDirectory()) {
            files.push(...walkCSVs(path.join(dir, entry.name), depth + 1));
          } else if (entry.name.endsWith('.csv') && !entry.name.startsWith('.')) {
            files.push(path.join(dir, entry.name));
          }
        }
      } catch {}
      return files;
    };

    const allCampaignCSVs = walkCSVs(campaignDir);
    // Skip files we already imported above
    const alreadyImported = new Set([
      path.join(therapyDir, 'extracted_emails.csv'),
      providersPath,
      nidhwPath,
    ]);

    for (const csvPath of allCampaignCSVs) {
      if (alreadyImported.has(csvPath)) continue;
      const relName = csvPath.replace(campaignDir + '/', '');
      const tag = relName.replace(/\//g, '-').replace('.csv', '').toLowerCase();
      results.push(await importCSVFile(
        csvPath,
        'csv', ['email-campaign', tag],
      ));
    }
  }

  // --- Summary ---
  const afterCount = await Contact.count();
  const suppressedCount = await Contact.count({ where: { suppressed: true } });
  const newContacts = afterCount - beforeCount;

  const totalCreated = results.reduce((s, r) => s + r.created, 0);
  const totalEnriched = results.reduce((s, r) => s + r.enriched, 0);
  const totalSkipped = results.reduce((s, r) => s + r.skipped, 0);
  const totalInvalid = results.reduce((s, r) => s + r.invalid, 0);
  const totalProcessed = results.reduce((s, r) => s + r.total, 0);

  console.log('\n=== Bulk Import Complete ===');
  console.log(`Files processed: ${results.length}`);
  console.log(`Rows processed: ${totalProcessed.toLocaleString()}`);
  console.log(`New contacts: ${totalCreated.toLocaleString()}`);
  console.log(`Enriched: ${totalEnriched.toLocaleString()}`);
  console.log(`Duplicates skipped: ${totalSkipped.toLocaleString()}`);
  console.log(`Invalid emails: ${totalInvalid.toLocaleString()}`);
  console.log(`\nTotal contacts now: ${afterCount.toLocaleString()} (was ${beforeCount.toLocaleString()}, +${newContacts.toLocaleString()})`);
  console.log(`Suppressed: ${suppressedCount.toLocaleString()}`);
  console.log(`Contactable: ${(afterCount - suppressedCount).toLocaleString()}`);

  await sequelize.close();
}

run().catch(err => { console.error('Import failed:', err); process.exit(1); });
