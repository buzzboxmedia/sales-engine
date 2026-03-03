import { Send, EmailEvent, Contact } from '../models/index.js';
import { applyScore } from './scorer.js';
import { logActivity } from './activity.js';

interface TrackMetadata {
  ip?: string;
  userAgent?: string;
}

// In-memory dedup cache: key → expiry timestamp
// Prevents bot prefetch and email client scanning from inflating counts
const dedupCache = new Map<string, number>();

const OPEN_DEDUP_MS = 5 * 60 * 1000;  // 5 minutes
const CLICK_DEDUP_MS = 30 * 1000;     // 30 seconds

function isDuplicate(key: string, windowMs: number): boolean {
  const now = Date.now();
  const expiry = dedupCache.get(key);
  if (expiry && now < expiry) return true;
  dedupCache.set(key, now + windowMs);
  return false;
}

// Periodically clean up expired dedup entries (every 10 minutes)
setInterval(() => {
  const now = Date.now();
  for (const [key, expiry] of dedupCache) {
    if (now >= expiry) dedupCache.delete(key);
  }
}, 10 * 60 * 1000);

// Process an email open event
export async function trackOpen(trackingId: string, metadata: TrackMetadata): Promise<void> {
  // Dedup: ignore opens from the same tracking_id within 5 minutes
  if (isDuplicate(`open:${trackingId}`, OPEN_DEDUP_MS)) return;

  const send = await Send.findOne({ where: { tracking_id: trackingId } });
  if (!send) return;

  const now = new Date();

  await EmailEvent.create({
    send_id: send.id,
    event_type: 'open',
    metadata: { ip: metadata.ip, userAgent: metadata.userAgent },
    occurred_at: now,
  });

  await send.update({
    open_count: send.open_count + 1,
    first_opened_at: send.first_opened_at ?? now,
    last_opened_at: now,
    // Also set legacy opened_at on first open
    opened_at: send.opened_at ?? now,
  });

  await Contact.update(
    { last_activity_at: now, updated_at: now },
    { where: { id: send.contact_id } },
  );

  await applyScore(send.contact_id, 'email_opened');

  await logActivity({
    contactId: send.contact_id,
    type: 'email_opened',
    description: `Opened email: ${send.subject}`,
    metadata: { send_id: send.id, tracking_id: trackingId, ip: metadata.ip },
  });
}

// Process a link click event
export async function trackClick(trackingId: string, url: string, metadata: TrackMetadata): Promise<void> {
  // Dedup: ignore clicks from the same tracking_id+url within 30 seconds
  if (isDuplicate(`click:${trackingId}:${url}`, CLICK_DEDUP_MS)) return;

  const send = await Send.findOne({ where: { tracking_id: trackingId } });
  if (!send) return;

  const now = new Date();

  await EmailEvent.create({
    send_id: send.id,
    event_type: 'click',
    metadata: { url, ip: metadata.ip, userAgent: metadata.userAgent },
    occurred_at: now,
  });

  await send.update({
    click_count: send.click_count + 1,
  });

  await Contact.update(
    { last_activity_at: now, updated_at: now },
    { where: { id: send.contact_id } },
  );

  await applyScore(send.contact_id, 'link_clicked');

  await logActivity({
    contactId: send.contact_id,
    type: 'link_clicked',
    description: `Clicked link in email: ${send.subject}`,
    metadata: { send_id: send.id, tracking_id: trackingId, url, ip: metadata.ip },
  });
}
