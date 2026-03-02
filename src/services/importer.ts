/**
 * One-time importer: migrates all existing outreach data into the sales_engine schema.
 * Run with: npm run import
 */
import dotenv from 'dotenv';
dotenv.config();

import fs from 'fs';
import path from 'path';
import { sequelize } from '../db.js';
import { Contact, Sequence, Send } from '../models/index.js';
import { createId } from '@paralleldrive/cuid2';

// Resolve Dropbox path (handles both ~/Dropbox/ and ~/Library/CloudStorage/Dropbox/)
function resolveDropbox(relativePath: string): string {
  const home = process.env.HOME || '/Users/baronmiller';
  const direct = path.join(home, 'Dropbox', relativePath);
  const cloudStorage = path.join(home, 'Library/CloudStorage/Dropbox', relativePath);
  if (fs.existsSync(direct)) return direct;
  if (fs.existsSync(cloudStorage)) return cloudStorage;
  throw new Error(`Cannot find Dropbox path: ${relativePath}`);
}

function parseCSV(content: string): Record<string, string>[] {
  const lines = content.trim().split('\n');
  const headers = lines[0].split(',').map(h => h.trim());
  return lines.slice(1).map(line => {
    const values = line.split(',').map(v => v.trim());
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = values[i] || ''; });
    return row;
  });
}

async function importSuppressionList(): Promise<number> {
  console.log('\n--- Importing suppression list ---');
  const filePath = resolveDropbox('Talkspresso/outreach/instantly-export/master_suppression_list.csv');
  const content = fs.readFileSync(filePath, 'utf-8');
  const rows = parseCSV(content);

  let created = 0, skipped = 0;
  for (const row of rows) {
    if (!row.email) continue;
    try {
      await Contact.create({
        email: row.email.toLowerCase().trim(),
        source: 'instantly',
        status: 'unsubscribed',
        suppressed: true,
        tags: ['suppression-list'],
      });
      created++;
    } catch (err: any) {
      if (err.name === 'SequelizeUniqueConstraintError') {
        // Update existing to mark as suppressed
        await Contact.update(
          { suppressed: true, status: 'unsubscribed', updated_at: new Date() },
          { where: { email: row.email.toLowerCase().trim(), project: 'talkspresso' } },
        );
        skipped++;
      } else {
        console.error(`Error importing ${row.email}:`, err.message);
      }
    }
  }
  console.log(`Suppression list: ${created} created, ${skipped} updated/skipped (${rows.length} total)`);
  return created;
}

async function importLeadBatches(): Promise<number> {
  console.log('\n--- Importing lead batches ---');
  const leadsDir = resolveDropbox('Talkspresso/outreach/leads');
  const files = fs.readdirSync(leadsDir).filter(f => f.startsWith('batch-') && f.endsWith('.csv'));

  let created = 0, skipped = 0;
  for (const file of files.sort()) {
    const content = fs.readFileSync(path.join(leadsDir, file), 'utf-8');
    const rows = parseCSV(content);

    for (const row of rows) {
      if (!row.email) continue;
      try {
        await Contact.create({
          email: row.email.toLowerCase().trim(),
          name: row.name || null,
          first_name: row.name?.split(' ')[0] || null,
          platform: row.platform || null,
          followers: row.followers ? parseInt(row.followers) : null,
          niche: row.niche || null,
          profile_url: row.profile_url || null,
          source: 'csv',
          tags: ['lead-batch', file.replace('.csv', '')],
          notes: row.notes ? { notes: row.notes } : null,
        });
        created++;
      } catch (err: any) {
        if (err.name === 'SequelizeUniqueConstraintError') {
          // Update with richer data if we have it
          const updates: any = { updated_at: new Date() };
          if (row.name) updates.name = row.name;
          if (row.name) updates.first_name = row.name.split(' ')[0];
          if (row.platform) updates.platform = row.platform;
          if (row.followers) updates.followers = parseInt(row.followers);
          if (row.niche) updates.niche = row.niche;
          if (row.profile_url) updates.profile_url = row.profile_url;
          await Contact.update(updates, {
            where: { email: row.email.toLowerCase().trim(), project: 'talkspresso' },
          });
          skipped++;
        }
      }
    }
    console.log(`  ${file}: processed ${rows.length} rows`);
  }
  console.log(`Lead batches: ${created} created, ${skipped} updated (${files.length} files)`);
  return created;
}

async function importInstantlySends(): Promise<number> {
  console.log('\n--- Importing Instantly sends ---');
  const filePath = resolveDropbox('Talkspresso/outreach/instantly-export/instantly_sent_log.json');
  const data: any[] = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

  let created = 0, skipped = 0;
  for (const row of data) {
    if (!row.email) continue;
    const email = row.email.toLowerCase().trim();

    // Ensure contact exists
    let contact = await Contact.findOne({ where: { email, project: 'talkspresso' } });
    if (!contact) {
      contact = await Contact.create({
        email,
        source: 'instantly',
        status: 'contacted',
      });
    } else if (contact.status === 'new') {
      await contact.update({ status: 'contacted', updated_at: new Date() });
    }

    // Create send record
    try {
      await Send.create({
        contact_id: contact.id,
        sender_email: row.from || 'instantly',
        subject: row.subject || '(no subject)',
        body: '', // sent_log doesn't include body
        status: 'sent',
        sent_at: row.date ? new Date(row.date) : new Date(),
      });
      created++;
    } catch (err: any) {
      skipped++;
    }
  }
  console.log(`Instantly sends: ${created} created, ${skipped} skipped (${data.length} total)`);
  return created;
}

async function importInstantlyReplies(): Promise<number> {
  console.log('\n--- Importing Instantly replies ---');
  const filePath = resolveDropbox('Talkspresso/outreach/instantly-export/instantly_replies.json');
  const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  const items: any[] = data.items || data;

  let processed = 0;
  for (const reply of items) {
    const fromEmail = reply.from_address_email?.toLowerCase()?.trim();
    if (!fromEmail) continue;

    // Find or create the contact
    let contact = await Contact.findOne({ where: { email: fromEmail, project: 'talkspresso' } });
    if (!contact) {
      contact = await Contact.create({
        email: fromEmail,
        source: 'instantly',
        status: 'replied',
      });
    }

    // Categorize reply
    let replyCategory = 'interested';
    const preview = (reply.content_preview || reply.body?.text || '').toLowerCase();
    if (reply.ai_interest_value === 0 || preview.includes('out of office') || preview.includes('ooo')) {
      replyCategory = 'auto_reply';
    } else if (preview.includes('unsubscribe') || preview.includes('remove') || preview.includes('stop')) {
      replyCategory = 'unsubscribe';
    } else if (preview.includes('not interested') || preview.includes('no thank') || preview.includes('no thanks')) {
      replyCategory = 'not_interested';
    }

    // Find matching send and update it
    const matchingSend = await Send.findOne({
      where: { contact_id: contact?.id },
      order: [['sent_at', 'DESC']],
    });

    if (matchingSend) {
      await matchingSend.update({
        status: 'replied',
        replied_at: reply.timestamp_email ? new Date(reply.timestamp_email) : new Date(),
        reply_category: replyCategory,
        reply_snippet: (reply.content_preview || '').substring(0, 200),
      });
    }

    // Update contact status
    if (contact) {
      const statusMap: Record<string, string> = {
        interested: 'interested',
        not_interested: 'not_interested',
        unsubscribe: 'unsubscribed',
        auto_reply: 'replied',
      };
      await contact.update({
        status: statusMap[replyCategory] || 'replied',
        updated_at: new Date(),
      });
    }

    processed++;
  }
  console.log(`Instantly replies: ${processed} processed (${items.length} total)`);
  return processed;
}

async function importSendGridSends(): Promise<number> {
  console.log('\n--- Importing SendGrid sends ---');
  const filePath = resolveDropbox('Talkspresso/outreach/logs/sent.json');
  const data: any[] = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

  let created = 0, skipped = 0;
  for (const row of data) {
    if (!row.email) continue;
    const email = row.email.toLowerCase().trim();

    // Ensure contact exists
    let contact = await Contact.findOne({ where: { email, project: 'talkspresso' } });
    if (!contact) {
      contact = await Contact.create({
        email,
        name: row.name || null,
        first_name: row.name?.split(' ')[0] || null,
        niche: row.niche || null,
        platform: row.platform || null,
        source: 'csv',
        status: 'contacted',
        notes: { sourceFile: row.sourceFile },
      });
    } else {
      // Enrich with data from send log
      const updates: any = { updated_at: new Date() };
      if (row.name && !contact.name) updates.name = row.name;
      if (row.name && !contact.first_name) updates.first_name = row.name.split(' ')[0];
      if (row.niche && !contact.niche) updates.niche = row.niche;
      if (row.platform && !contact.platform) updates.platform = row.platform;
      if (contact.status === 'new') updates.status = 'contacted';
      await contact.update(updates);
    }

    // Create send record
    try {
      await Send.create({
        contact_id: contact.id,
        sender_email: 'baron@trytalkspresso.com',
        subject: row.subject || '(no subject)',
        body: '', // sent.json doesn't include body
        status: 'sent',
        sent_at: row.sentAt ? new Date(row.sentAt) : new Date(),
        step_number: row.sequence || null,
      });
      created++;
    } catch (err: any) {
      skipped++;
    }
  }
  console.log(`SendGrid sends: ${created} created, ${skipped} skipped (${data.length} total)`);
  return created;
}

async function importEmailSequences(): Promise<void> {
  console.log('\n--- Importing email sequences ---');

  // Sequence 1: Cold Outreach
  await Sequence.create({
    name: 'cold-outreach-v1',
    steps: [
      {
        step: 1,
        delay_days: 0,
        subject: 'Quick question about {{niche}}',
        body: `Hi {{first_name}},\n\nI saw your work on {{platform}} and thought you might be interested in what we're building.\n\nTalkspresso lets creators like you monetize your audience through paid video calls and workshops. One link handles scheduling, video, and payments. You keep 90%.\n\nTina Matinpour has been running workshops for hundreds of people on the platform. Figured I'd reach out since it seems like a fit for what you're doing.\n\nWorth a quick look? <a href="https://talkspresso.com/for-creators">talkspresso.com/for-creators</a>\n\nBaron Miller\nFounder, Talkspresso`,
      },
      {
        step: 2,
        delay_days: 3,
        subject: 'Re: Quick question about {{niche}}',
        body: `{{first_name}},\n\nNot sure if you saw my last email, but wanted to add one thing.\n\nIt's free to start. No setup fees, no monthly charges. You only pay when you get paid (we take 10%).\n\nWould this work for you?\n\nBaron`,
      },
      {
        step: 3,
        delay_days: 7,
        subject: 'Re: Quick question about {{niche}}',
        body: `{{first_name}},\n\nNo worries if this isn't a fit. Just wanted to make sure you didn't miss it.\n\nIf you ever want to add paid calls or workshops to your offering, we're here: <a href="https://talkspresso.com/for-creators">talkspresso.com/for-creators</a>\n\nBaron`,
      },
    ],
  });

  // Sequence 2: Re-engagement (dormant providers)
  await Sequence.create({
    name: 're-engagement-v1',
    steps: [
      {
        step: 1,
        delay_days: 0,
        subject: 'Your Talkspresso account is ready',
        body: `Hi {{first_name}},\n\nYou signed up for Talkspresso a while back, but I don't think you ever shared your link.\n\nWe've made a bunch of updates since you joined:\n- Better video quality\n- Easier scheduling\n- Faster payouts\n\nYour account is ready to go. All you need to do is share your link with your audience.\n\nLog in here: <a href="https://app.talkspresso.com">app.talkspresso.com</a>\n\nIf you need help getting started, just reply to this email.\n\nBaron Miller\nFounder, Talkspresso`,
      },
      {
        step: 2,
        delay_days: 5,
        subject: 'Re: Your Talkspresso account is ready',
        body: `{{first_name}},\n\nQuick tips to get your first paid booking:\n\n1. <b>Price it right.</b> Start at $50-$100 for a 1:1 call. You can always raise it.\n2. <b>Share your link.</b> Add it to your bio, mention it in a post, send it to your email list.\n3. <b>Offer something specific.</b> "Book a strategy call" is vague. "30-min portfolio review" is clear.\n\nThat's it. Most people overcomplicate this.\n\nNeed help? Reply to this email and I'll walk you through it.\n\nBaron`,
      },
      {
        step: 3,
        delay_days: 10,
        subject: 'Re: Your Talkspresso account is ready',
        body: `{{first_name}},\n\nI'll make this simple.\n\nReply to this email and I'll personally help you get your first paid booking on Talkspresso.\n\nI'll look at your profile, help you price your services, and tell you exactly where to share your link.\n\nNo charge, no catch. I just want to see you succeed.\n\nBaron Miller\nbaron@trytalkspresso.com`,
      },
    ],
  });

  // Niche variants (fitness)
  await Sequence.create({
    name: 'niche-fitness-v1',
    steps: [
      {
        step: 1,
        delay_days: 0,
        subject: 'Beyond meal plans and PDFs',
        body: `Hi {{first_name}},\n\nI've been following your content and noticed you're helping people with {{niche}}. Most creators in your space stick to meal plans and downloadable guides, but you could be doing something more valuable.\n\nTalkspresso lets you offer paid video calls and group workshops. One link handles scheduling, video, and payments. You keep 90%.\n\nThink: personalized form checks, live Q&A sessions, accountability calls. Things your audience would actually pay for.\n\nFree to start, no monthly fees: <a href="https://talkspresso.com/for-creators">talkspresso.com/for-creators</a>\n\nBaron Miller\nFounder, Talkspresso`,
      },
    ],
  });

  // Niche variants (business)
  await Sequence.create({
    name: 'niche-business-v1',
    steps: [
      {
        step: 1,
        delay_days: 0,
        subject: 'Scale without building a course',
        body: `Hi {{first_name}},\n\nSaw your work on {{platform}}. Quick question: are you getting requests for 1:1 time from your audience?\n\nMost business coaches hit a ceiling. Either you're doing too many 1:1s, or you're building a course that takes months to create and sells once.\n\nTalkspresso is the middle ground. Paid group calls and workshops. One link handles scheduling, video, and payments. You keep 90%.\n\nRun a live session once, sell it to 20 people. Keep it high-touch without trading time for money.\n\nWorth a look? <a href="https://talkspresso.com/for-creators">talkspresso.com/for-creators</a>\n\nBaron Miller\nFounder, Talkspresso`,
      },
    ],
  });

  console.log('Email sequences: 4 sequences imported');
}

// --- Main ---

async function runImport() {
  console.log('=== Sales Engine Data Import ===');
  console.log('Connecting to database...');
  await sequelize.authenticate();

  // Import in order: leads first (creates contacts), then sends (links to contacts), then replies
  await importLeadBatches();
  await importSuppressionList();
  await importInstantlySends();
  await importSendGridSends();
  await importInstantlyReplies();
  await importEmailSequences();

  // Summary
  const totalContacts = await Contact.count();
  const totalSends = await Send.count();
  const totalSuppressed = await Contact.count({ where: { suppressed: true } });
  const totalReplied = await Send.count({ where: { status: 'replied' } });

  console.log('\n=== Import Complete ===');
  console.log(`Contacts: ${totalContacts}`);
  console.log(`Sends: ${totalSends}`);
  console.log(`Suppressed: ${totalSuppressed}`);
  console.log(`Replied: ${totalReplied}`);

  await sequelize.close();
}

runImport().catch(err => {
  console.error('Import failed:', err);
  process.exit(1);
});
