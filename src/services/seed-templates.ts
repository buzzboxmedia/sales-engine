import dotenv from 'dotenv';
dotenv.config();

import { sequelize } from '../db.js';
import '../models/index.js';
import { EmailTemplate } from '../models/index.js';
import { htmlToText } from './template-renderer.js';

const templates = [
  {
    name: 'Cold Intro',
    category: 'outreach',
    subject: 'Quick question about {{company}}',
    html_body: `<p style="margin: 0 0 16px 0; font-family: Arial, sans-serif; font-size: 15px; line-height: 1.6; color: #333;">Hi {{first_name}},</p>

<p style="margin: 0 0 16px 0; font-family: Arial, sans-serif; font-size: 15px; line-height: 1.6; color: #333;">I came across your profile on {{platform}} and wanted to reach out.</p>

<p style="margin: 0 0 16px 0; font-family: Arial, sans-serif; font-size: 15px; line-height: 1.6; color: #333;">I'm building Talkspresso — a platform that lets {{niche}} experts like you get paid for 1:1 video calls. No subscriptions, no setup fees. You set your rate, clients book and pay, you show up.</p>

<p style="margin: 0 0 16px 0; font-family: Arial, sans-serif; font-size: 15px; line-height: 1.6; color: #333;">A lot of people in your space already use their existing audience and content to drive bookings. You're clearly someone who knows what they're talking about — it seemed like a natural fit.</p>

<p style="margin: 0 0 16px 0; font-family: Arial, sans-serif; font-size: 15px; line-height: 1.6; color: #333;">Would you be open to a quick look? Happy to walk you through it in 10 minutes or just send you the link.</p>

<p style="margin: 0 0 16px 0; font-family: Arial, sans-serif; font-size: 15px; line-height: 1.6; color: #333;">Baron</p>`,
  },
  {
    name: 'Follow-Up',
    category: 'follow_up',
    subject: 'Re: Quick question about {{company}}',
    html_body: `<p style="margin: 0 0 16px 0; font-family: Arial, sans-serif; font-size: 15px; line-height: 1.6; color: #333;">Hi {{first_name}},</p>

<p style="margin: 0 0 16px 0; font-family: Arial, sans-serif; font-size: 15px; line-height: 1.6; color: #333;">Just bumping this to the top — I know things get buried.</p>

<p style="margin: 0 0 16px 0; font-family: Arial, sans-serif; font-size: 15px; line-height: 1.6; color: #333;">If you're curious about Talkspresso, you can grab a time here: <a href="{{booking_link}}" style="color: #4F46E5;">{{booking_link}}</a></p>

<p style="margin: 0 0 16px 0; font-family: Arial, sans-serif; font-size: 15px; line-height: 1.6; color: #333;">Baron</p>`,
  },
  {
    name: 'Value Add',
    category: 'nurture',
    subject: 'Thought you\'d find this useful, {{first_name}}',
    html_body: `<p style="margin: 0 0 16px 0; font-family: Arial, sans-serif; font-size: 15px; line-height: 1.6; color: #333;">Hi {{first_name}},</p>

<p style="margin: 0 0 16px 0; font-family: Arial, sans-serif; font-size: 15px; line-height: 1.6; color: #333;">Quick thought — most {{niche}} experts I talk to are already giving away tons of value for free (on {{platform}}, in DMs, etc.). The missing piece is usually just a simple way to charge for the good stuff.</p>

<p style="margin: 0 0 16px 0; font-family: Arial, sans-serif; font-size: 15px; line-height: 1.6; color: #333;">That's exactly what Talkspresso is built for. You get a personal booking page, set your own rate, and clients pay upfront before the call. No awkward invoicing, no chasing payments.</p>

<p style="margin: 0 0 16px 0; font-family: Arial, sans-serif; font-size: 15px; line-height: 1.6; color: #333;">One of the use cases I see a lot: someone posts a thread on {{platform}}, it takes off, and suddenly 20 people want a deeper conversation. Instead of doing it for free in DMs, they book a 30-minute call.</p>

<p style="margin: 0 0 16px 0; font-family: Arial, sans-serif; font-size: 15px; line-height: 1.6; color: #333;">Worth a look if the timing is right: <a href="{{booking_link}}" style="color: #4F46E5;">{{booking_link}}</a></p>

<p style="margin: 0 0 16px 0; font-family: Arial, sans-serif; font-size: 15px; line-height: 1.6; color: #333;">Baron</p>`,
  },
  {
    name: 'Social Proof',
    category: 'nurture',
    subject: 'How {{niche}} experts are earning on Talkspresso',
    html_body: `<p style="margin: 0 0 16px 0; font-family: Arial, sans-serif; font-size: 15px; line-height: 1.6; color: #333;">Hi {{first_name}},</p>

<p style="margin: 0 0 16px 0; font-family: Arial, sans-serif; font-size: 15px; line-height: 1.6; color: #333;">Wanted to share something — we have {{niche}} experts on Talkspresso earning $150–$400 per session. Some are doing 5–10 calls a week on top of their main work. It adds up fast.</p>

<p style="margin: 0 0 16px 0; font-family: Arial, sans-serif; font-size: 15px; line-height: 1.6; color: #333;">What they all have in common: an existing audience (like yours) and knowledge people are willing to pay for (also like yours).</p>

<p style="margin: 0 0 16px 0; font-family: Arial, sans-serif; font-size: 15px; line-height: 1.6; color: #333;">Setup takes about 10 minutes. No technical skill needed.</p>

<p style="margin: 0 0 16px 0; font-family: Arial, sans-serif; font-size: 15px; line-height: 1.6; color: #333;">See how it works: <a href="{{booking_link}}" style="color: #4F46E5;">{{booking_link}}</a></p>

<p style="margin: 0 0 16px 0; font-family: Arial, sans-serif; font-size: 15px; line-height: 1.6; color: #333;">Baron</p>`,
  },
  {
    name: 'Break-Up',
    category: 'break_up',
    subject: 'Closing the loop, {{first_name}}',
    html_body: `<p style="margin: 0 0 16px 0; font-family: Arial, sans-serif; font-size: 15px; line-height: 1.6; color: #333;">Hi {{first_name}},</p>

<p style="margin: 0 0 16px 0; font-family: Arial, sans-serif; font-size: 15px; line-height: 1.6; color: #333;">I'll leave you alone after this one — I know timing isn't always right, and I don't want to be that person in your inbox.</p>

<p style="margin: 0 0 16px 0; font-family: Arial, sans-serif; font-size: 15px; line-height: 1.6; color: #333;">If Talkspresso ever makes sense — whether that's now or six months from now — you can always find me here: <a href="{{booking_link}}" style="color: #4F46E5;">{{booking_link}}</a></p>

<p style="margin: 0 0 16px 0; font-family: Arial, sans-serif; font-size: 15px; line-height: 1.6; color: #333;">Wishing you well with everything at {{company}}.</p>

<p style="margin: 0 0 16px 0; font-family: Arial, sans-serif; font-size: 15px; line-height: 1.6; color: #333;">Baron</p>`,
  },
];

async function seedTemplates() {
  try {
    await sequelize.authenticate();

    const existing = await EmailTemplate.count({ where: { project: 'talkspresso' } });
    if (existing > 0) {
      console.log(`Skipping seed — ${existing} templates already exist.`);
      await sequelize.close();
      return;
    }

    for (const t of templates) {
      await EmailTemplate.create({
        project: 'talkspresso',
        name: t.name,
        subject: t.subject,
        html_body: t.html_body,
        text_body: htmlToText(t.html_body),
        category: t.category,
      });
      console.log(`Created: ${t.name}`);
    }

    console.log(`Done. Seeded ${templates.length} templates.`);
    await sequelize.close();
  } catch (err) {
    console.error('Seed failed:', err);
    process.exit(1);
  }
}

seedTemplates();
