import { Send, EmailEvent, Contact } from '../models/index.js';
import { applyScore } from './scorer.js';
import { logActivity } from './activity.js';

interface TrackMetadata {
  ip?: string;
  userAgent?: string;
}

// Process an email open event
export async function trackOpen(trackingId: string, metadata: TrackMetadata): Promise<void> {
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
