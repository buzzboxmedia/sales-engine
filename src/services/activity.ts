import { ActivityLog, Contact } from '../models/index.js';

export async function logActivity(params: {
  contactId: string;
  type: string;
  description: string;
  metadata?: Record<string, any>;
}): Promise<void> {
  const now = new Date();

  await ActivityLog.create({
    contact_id: params.contactId,
    activity_type: params.type,
    description: params.description,
    metadata: params.metadata ?? {},
    occurred_at: now,
  });

  await Contact.update(
    { last_activity_at: now, updated_at: now },
    { where: { id: params.contactId } },
  );
}
