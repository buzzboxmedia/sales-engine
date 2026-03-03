# Talkspresso Sales Engine — Outreach Strategy

**Version:** 1.0
**Date:** March 2, 2026
**Owner:** Grover (Growth)
**Downstream:** Sage (copy), Reid (implementation)

---

## Overview

We have ~81,000 contacts. The goal is to enroll them into persona-matched email sequences, ramp send volume over 6 months, and auto-stop outreach the moment someone signs up for Talkspresso.

This document defines:
1. Buyer personas (based on actual contact data fields)
2. Sequence specs per persona
3. 6-month volume ramp
4. Enrollment / segmentation rules
5. Suppression rules

---

## Part 1: Buyer Personas

Segmentation is based on the fields that actually exist in the `contacts` table:
- `niche` (text) — what they teach/create about
- `platform` (text) — where they have their audience (Instagram, YouTube, LinkedIn, TikTok, etc.)
- `followers` (integer) — audience size
- `title` (text) — self-described role (coach, consultant, creator, etc.)

### Persona A — The Fitness & Wellness Creator

**Who they are:** Personal trainers, nutrition coaches, yoga instructors, wellness influencers. Primarily on Instagram, TikTok, and YouTube. Audience-focused. Already monetize through merch, programs, or brand deals. They understand the value of their time and attention but usually give 1:1 advice for free in DMs.

**Data filter:**
```
niche ILIKE '%fitness%' OR niche ILIKE '%health%' OR niche ILIKE '%wellness%'
OR niche ILIKE '%nutrition%' OR niche ILIKE '%yoga%' OR niche ILIKE '%workout%'
OR niche ILIKE '%weight%' OR niche ILIKE '%gym%'
```

**Typical follower range:** 5,000–500,000
**Primary platform:** Instagram, TikTok
**Pain point they feel:** "People DM me all day for free advice. I can't scale it."
**Talkspresso angle:** Turn your DMs into paid calls. Set your rate. Show up, get paid.

**Sequence name:** `fitness-wellness-outreach`

---

### Persona B — The Business & Career Coach

**Who they are:** Startup advisors, career coaches, sales coaches, productivity consultants, LinkedIn thought leaders. Mix of solopreneurs and freelancers who already charge for their time in some form but use clunky tools (Calendly + Venmo, invoices, Zoom links).

**Data filter:**
```
niche ILIKE '%business%' OR niche ILIKE '%entrepreneur%' OR niche ILIKE '%career%'
OR niche ILIKE '%leadership%' OR niche ILIKE '%productivity%' OR niche ILIKE '%sales%'
OR niche ILIKE '%startup%' OR niche ILIKE '%coach%'
OR title ILIKE '%coach%' OR title ILIKE '%consultant%' OR title ILIKE '%advisor%'
```

**Typical follower range:** 2,000–100,000
**Primary platform:** LinkedIn, YouTube
**Pain point they feel:** "I'm doing free discovery calls and drowning in logistics."
**Talkspresso angle:** Replace your Calendly + payment chaos with one link. Clients book and pay upfront. You just show up.

**Sequence name:** `business-coach-outreach`

---

### Persona C — The Creative & Content Creator

**Who they are:** Photographers, designers, writers, podcasters, musicians, artists. Usually on YouTube, Instagram, or TikTok. Large audiences who follow them for their creative work. Monetize through courses, Patreon, or client work. Undermonetized 1:1 time.

**Data filter:**
```
niche ILIKE '%photography%' OR niche ILIKE '%design%' OR niche ILIKE '%creative%'
OR niche ILIKE '%podcast%' OR niche ILIKE '%music%' OR niche ILIKE '%art%'
OR niche ILIKE '%video%' OR niche ILIKE '%content%' OR niche ILIKE '%writer%'
OR niche ILIKE '%film%'
```

**Typical follower range:** 5,000–1,000,000
**Primary platform:** YouTube, Instagram, TikTok
**Pain point they feel:** "People want to learn from me 1:1 but I have no clean way to offer that."
**Talkspresso angle:** Your audience already wants access to you. Give them a way to book a call with you. You set the price, they pay before you talk.

**Sequence name:** `creative-creator-outreach`

---

### Persona D — The Finance & Investing Expert

**Who they are:** Personal finance influencers, investing educators, tax advisors, financial planners with an audience. Heavy on YouTube and Twitter/X. Regulatory environment makes them careful about what they say, but their audience craves personalized guidance.

**Data filter:**
```
niche ILIKE '%finance%' OR niche ILIKE '%investing%' OR niche ILIKE '%money%'
OR niche ILIKE '%tax%' OR niche ILIKE '%crypto%' OR niche ILIKE '%stock%'
OR niche ILIKE '%wealth%' OR niche ILIKE '%trading%' OR niche ILIKE '%budget%'
OR niche ILIKE '%financial%'
```

**Typical follower range:** 10,000–500,000
**Primary platform:** YouTube, Twitter/X, LinkedIn
**Pain point they feel:** "I can't give personalized financial advice at scale. I turn people away constantly."
**Talkspresso angle:** Charge for your time, not your advice. A 30-minute strategy call where someone pays $200 to talk through their situation. No subscriptions, no liability beyond the conversation.

**Sequence name:** `finance-expert-outreach`

---

### Persona E — General Expert (Catch-All)

**Who they are:** Everyone who doesn't fit cleanly into A–D. Could be parenting coaches, relationship experts, language teachers, travel creators, tech educators. Still valuable contacts — just need a more generic pitch.

**Data filter:** Any contact not matched by A–D filters. Also used for contacts where `niche` is null.

**Sequence name:** `general-expert-outreach`

**Note:** This is the default sequence. If niche is null, they land here. If volume is large, consider splitting by platform (Instagram vs LinkedIn vs YouTube) rather than by niche.

---

## Part 2: Sequence Specs Per Persona

### Universal Sequence Structure (5 emails)

All sequences follow the same cadence pattern. Copy angle changes per persona. Spacing is identical across all personas to simplify the scheduler.

| Step | Email Type       | Delay (from prior email) | Purpose                              |
|------|-----------------|--------------------------|--------------------------------------|
| 1    | Cold Intro       | Day 0 (enrollment)       | First touch, personalized hook       |
| 2    | Value Add        | +4 days                  | Educate, give before asking again    |
| 3    | Social Proof     | +4 days                  | Credibility, show others doing it    |
| 4    | Soft Follow-Up   | +5 days                  | Gentle nudge, low friction           |
| 5    | Break-Up         | +7 days                  | Close the loop, leave door open      |

**Total sequence duration:** 20 days from enrollment to last email.

**Why 5 emails:** Industry benchmarks show 80% of cold email replies come within the first 5 touches. Beyond that, incremental response rate drops sharply while unsubscribe rate climbs.

**Why these delays:** 4-5 day gaps feel human. 2-3 days feels aggressive. 7+ days loses the thread.

---

### Persona A — Fitness & Wellness Copy Angles

| Step | Subject Line (Sage: use as starting point) | Core Message |
|------|--------------------------------------------|--------------|
| 1    | "Quick question, {{first_name}}"           | "I see your fitness content on {{platform}} — people clearly trust you. Are you getting paid for the 1:1 advice you give away in DMs?" |
| 2    | "The DM problem most fitness creators have" | Acknowledge the volume of requests they get, explain how paid calls solve it without alienating audience |
| 3    | "How a yoga creator earns $2k/month from 30-min calls" | Story-driven social proof: real creator, relatable journey, simple outcome |
| 4    | "Still worth a look?"                       | One-line follow-up, direct CTA to talkspresso.com/join |
| 5    | "Closing the loop, {{first_name}}"          | Graceful exit, keep the door open |

---

### Persona B — Business & Career Coach Copy Angles

| Step | Subject Line | Core Message |
|------|-------------|--------------|
| 1    | "Saw your work on {{platform}}"              | "You clearly know what you're talking about. Are you charging for 1:1 time, or still doing free calls?" |
| 2    | "The discovery call trap"                    | Most coaches lose 30% of their billable hours to free discovery. Talkspresso makes the first call paid. |
| 3    | "How a business coach went from $0 to $3k MRR in 6 weeks" | Real story, specific numbers, LinkedIn credibility angle |
| 4    | "Worth 2 minutes to see?"                    | Link to a 2-minute demo/overview on talkspresso.com |
| 5    | "Last email from me, {{first_name}}"         | Clean exit, mention they can always find Baron at the link |

---

### Persona C — Creative & Content Creator Copy Angles

| Step | Subject Line | Core Message |
|------|-------------|--------------|
| 1    | "Your {{niche}} audience is asking for 1:1 time" | "You have people who'd pay to pick your brain. Most creators don't monetize that." |
| 2    | "The thing Patreon can't do"                | Patreon = subscriptions. Talkspresso = direct access, one call at a time. Lower commitment for both sides. |
| 3    | "How a photographer charges $150/hour for creative direction calls" | Niche example, platform-relevant story |
| 4    | "Just one question"                          | "If you had a 'book a call with me' button, what would you charge?" Low-friction reply hook |
| 5    | "Not for everyone — that's fine"             | Permission-based close, no pressure, talkspresso.com link |

---

### Persona D — Finance & Investing Expert Copy Angles

| Step | Subject Line | Core Message |
|------|-------------|--------------|
| 1    | "{{first_name}} — quick question about your audience" | "People watch your {{platform}} videos then want to apply it to their specific situation. Are you monetizing that?" |
| 2    | "Why finance creators undercharge for 1:1 time" | Data point: finance niche commands the highest per-session rates ($150–$500). You're leaving money on the table. |
| 3    | "A CPA with 40k YouTube subscribers earns $4k/month in calls" | Relatable example, credibility-first approach |
| 4    | "The short version"                          | One paragraph. Direct link. |
| 5    | "Wrapping up, {{first_name}}"               | Clean close. |

---

### Persona E — General Expert Copy Angles

Use the existing seeded templates (Cold Intro, Value Add, Social Proof, Follow-Up, Break-Up) as the base. These are already well-written and work for a broad audience.

The `{{niche}}` and `{{platform}}` variables are already in the templates, so they will auto-personalize even for general contacts.

---

## Part 3: 6-Month Volume Ramp

### Sending Infrastructure Assumptions

- **Current capacity:** ~200 emails/day (based on `daily_limit` defaults of 30/account)
- **Target by Month 6:** 500 emails/day
- **Scaling mechanism:** Add sending accounts. Each Gmail account = 30-50 emails/day safely. Need ~10-17 accounts at full scale.
- **Scheduler:** Already processes queue every 2 minutes, queues follow-ups every 30 minutes.

### Ramp Schedule

| Period        | Dates          | New Enrollments/Day | Total Active in Sequences | Cumulative Enrolled |
|---------------|----------------|---------------------|--------------------------|---------------------|
| Weeks 1-2     | Mar 2–15       | 50/day              | 50–100                   | ~700               |
| Weeks 3-4     | Mar 16–31      | 100/day             | 400–600                  | ~2,800             |
| Month 2       | Apr 1–30       | 150/day             | 1,000–1,500              | ~7,300             |
| Month 3       | May 1–31       | 200/day             | 1,500–2,000              | ~13,500            |
| Month 4       | Jun 1–30       | 300/day             | 2,500–3,000              | ~22,500            |
| Month 5       | Jul 1–31       | 400/day             | 3,000–4,000              | ~34,500            |
| Month 6       | Aug 1–31       | 500/day             | 4,000–5,000              | ~49,500            |

**Key:** "New Enrollments/Day" = fresh contacts entering Step 1. "Total Active" = all contacts currently mid-sequence. At any given time, contacts are at different steps — this is the layering.

### Why Ramp Slowly

1. **Deliverability:** New sending domains/accounts need warmup. Jumping to 500/day on Day 1 = spam folder death.
2. **Iteration:** Weeks 1-2 are test runs. Learn open rates and reply rates before scaling.
3. **Suppression hygiene:** Early bounces will be caught, accounts adjusted before high volume.

### Sending Account Scale Plan

| Month | Accounts Needed | Emails/Account/Day |
|-------|----------------|--------------------|
| 1     | 4-5            | 30-40              |
| 2-3   | 5-7            | 30-40              |
| 4-5   | 8-12           | 35-45              |
| 6     | 12-17          | 35-45              |

**Account types to use:** Google Workspace accounts under a custom domain (e.g., `baron@trytalkspresso.com`, `hello@trytalkspresso.com`, etc.). Avoid sending from generic Gmail — use branded domains for deliverability.

---

## Part 4: Enrollment & Segmentation Rules

### Priority Order for Enrollment

Enroll contacts in this order (highest-quality first):

1. **Contacts with `followers` > 10,000** — larger audiences = higher upside per conversion
2. **Contacts with a `niche` value set** — can be matched to a persona sequence
3. **Contacts with `platform` set** — enables personalization variables
4. **All remaining contacts** — enroll in general sequence

### Per-Persona Enrollment Rules

```
Persona A (Fitness): niche matches fitness/health/wellness/yoga/nutrition
Persona B (Business): niche or title matches business/coach/consultant/advisor/career
Persona C (Creative): niche matches photography/design/creative/podcast/content/video
Persona D (Finance): niche matches finance/investing/money/crypto/tax/trading
Persona E (General): All others, or where niche IS NULL
```

**Precedence:** If a contact could match multiple personas, assign to the first match in order A → B → C → D → E.

### Deduplication

The system already checks for existing enrollment before creating a Send record (see `sequences.ts` line 66-69). A contact will not be enrolled in the same sequence twice.

A contact should not be in multiple sequences simultaneously. Enforce this at enrollment time: before enrolling, check that the contact has no active sequence enrollment (status = 'queued' or 'sent' sends with no terminal status).

### Daily Enrollment Process (for Reid to automate)

```
1. Query contacts WHERE status = 'new' AND suppressed = false
   ORDER BY followers DESC NULLS LAST
   LIMIT [daily_enrollment_target]

2. For each contact:
   a. Determine persona (A/B/C/D/E) based on niche/title
   b. Look up sequence_id for that persona
   c. Call POST /sequences/:id/enroll with contact_id
   d. Mark contact status = 'contacted' (already done in enroll endpoint)

3. Log enrollment count for the day
```

---

## Part 5: Suppression Rules

These are non-negotiable. Any contact matching these conditions must be excluded from all outreach.

### Hard Suppression (contact.suppressed = true)

Never email. This flag is set by:
- Contact clicking the unsubscribe link in any email
- Admin manually suppressing via POST /contacts/:id/suppress
- Bounce detection (responseCode 550 or bounce message in SMTP error)

The enroll endpoint already checks `contact.suppressed` before creating a Send. This is correct. Do not bypass it.

### Status-Based Suppression

The scheduler's `queueFollowUps()` function already skips contacts with these statuses (see `scheduler.ts` line 26):
```
replied, interested, not_interested, signed_up, booked, converted, unsubscribed, bounced
```

This is the correct behavior. No changes needed. Ensure enrollment logic also checks status before enrolling a fresh contact.

### Conversion Auto-Stop

The most important suppression: **anyone who signs up for Talkspresso must stop receiving sales emails immediately.**

The `checkConversions()` service (runs every 30 minutes) already:
1. Queries the Talkspresso `Users` table
2. Matches emails against our contact list
3. Sets contact.status = 'signed_up' and contact.talkspresso_user_id

Since `queueFollowUps()` skips 'signed_up' contacts, the auto-stop is already implemented. The lag time is at most 30 minutes (conversion check interval). This is acceptable.

### Reply-Based Suppression

When a contact replies and the reply is categorized:
- `reply_category = 'not_interested'` → set contact.suppressed = true
- `reply_category = 'unsubscribe'` → set contact.suppressed = true
- `reply_category = 'interested'` → remove from sequence (Baron handles manually)
- `reply_category = 'positive'` → remove from sequence (Baron handles manually)

**Reid:** The reply classification logic should set these statuses. The follow-up scheduler already stops on 'replied' status — but suppressed = true is the belt-and-suspenders protection.

### Bounce Handling

Already implemented in `mailer.ts` (line 185-188): bounce → status = 'bounced', suppressed = true.

---

## Part 6: The Layering Picture

At steady state (Month 3+), here is what a typical day looks like:

```
Monday, May 4, 2026 (example):
- 200 new contacts enrolled → receive Step 1
- ~200 contacts (enrolled ~4 days ago) → receive Step 2
- ~200 contacts (enrolled ~8 days ago) → receive Step 3
- ~180 contacts (enrolled ~13 days ago) → receive Step 4 (some already replied/unsubscribed)
- ~150 contacts (enrolled ~20 days ago) → receive Step 5 (more attrition)

Total emails sent that day: ~930
Active contacts mid-sequence: ~930
```

This is why the daily send limit matters. At 200 new enrollments/day, total daily send volume is roughly 4-5x the enrollment rate once the pipeline is full. At Month 3 enrollment pace (200/day), daily sends = ~800-1,000. This requires ~20-25 email accounts at 40/day each.

**Recommendation:** Plan sending account infrastructure ahead of the enrollment ramp by 2-3 weeks.

---

## Part 7: Measurement

### Weekly Metrics to Track

| Metric | Target | Notes |
|--------|--------|-------|
| Open rate | 30-45% | Below 20% = deliverability or subject line problem |
| Reply rate (positive) | 2-5% | Includes "interested" and "tell me more" |
| Unsubscribe rate | <2% | Above 3% = sequence too aggressive or audience mismatch |
| Bounce rate | <1% | Above 2% = list quality issue, slow down |
| Conversion rate (signup) | 0.5-2% | Of all enrolled contacts, % who sign up |

### A/B Testing Priority (once volume allows)

1. **Subject lines** on Step 1 — biggest lever for open rate
2. **CTA in Step 2** — "book a demo" vs "check it out" vs "reply to this email"
3. **Sequence length** — 5 emails vs 7 emails for personas with lower reply rates

### When to Pause and Reassess

- Open rate drops below 15% for 3 consecutive days → deliverability issue, stop and audit
- Bounce rate exceeds 3% in a week → list quality issue, scrub before continuing
- Google/Gmail flags the sending domain → immediate pause, contact Reid

---

## For Sage: Copy Brief Summary

You're writing 5 emails per persona (25 emails total). Each email should be:
- **Short:** 100-150 words max per email. No walls of text.
- **Personal:** Use `{{first_name}}`, `{{platform}}`, `{{niche}}` variables wherever possible
- **Low friction:** No long pitches. One clear CTA per email.
- **Conversational tone:** Baron's voice. Not corporate. Not salesy. Like a DM from someone who genuinely thinks this would help them.

The existing seed templates (Cold Intro, Value Add, Social Proof, Follow-Up, Break-Up) are a strong starting point. Adapt them per persona by changing the hook in the opening line and the social proof example.

Primary CTA across all emails: `https://talkspresso.com/join` (or whatever the current signup URL is).

---

## For Reid: Implementation Summary

### What needs to be built

1. **Create 5 sequences** in the database (one per persona), each with 5 steps and the specified `delay_days`
2. **Enrollment script** — daily cron that:
   - Queries `contacts WHERE status = 'new' AND suppressed = false`
   - Assigns persona based on niche/title text matching
   - Enrolls in the correct sequence via existing `/sequences/:id/enroll` endpoint
   - Respects daily enrollment target (starts at 50/day, scales per ramp table)
3. **Sequence step format** (matches existing SequenceStep interface):
   ```json
   {
     "step": 1,
     "delay_days": 0,
     "subject": "Quick question, {{first_name}}",
     "body": "<p>Hi {{first_name}}...</p>"
   }
   ```
4. **Verify suppression** is checked before enrollment (already done in enroll endpoint)
5. **Enrollment deduplication** — before enrolling, check no active sends exist for this contact across any sequence

### Existing infrastructure that already works (don't rebuild)
- Follow-up queuing: `scheduler.ts` → `queueFollowUps()`
- Conversion detection: `converter.ts` → `checkConversions()` (runs every 30 min)
- Status-based suppression: already in `queueFollowUps()` skip list
- Bounce handling: already in `mailer.ts`
- Unsubscribe links: already injected via `injectTracking()`
- Template variable replacement: `replaceVars()` in both `sequences.ts` and `scheduler.ts`

---

*Last updated: March 2, 2026*
