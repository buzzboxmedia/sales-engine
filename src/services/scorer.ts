import { Contact, EmailEvent } from '../models/index.js';

const SCORE_RULES = {
  email_opened: 2,
  link_clicked: 5,
  replied_interested: 20,
  replied_not_interested: -10,
  signed_up: 30,
  booked: 50,
  paid: 100,
  bounced: -50,
} as const;

export type ScoreEvent = keyof typeof SCORE_RULES;

// Apply a score event delta to a contact, clamp to minimum 0, return new score
export async function applyScore(contactId: string, event: ScoreEvent): Promise<number> {
  const contact = await Contact.findByPk(contactId);
  if (!contact) throw new Error(`Contact not found: ${contactId}`);

  const delta = SCORE_RULES[event];
  const newScore = Math.max(0, contact.lead_score + delta);

  await contact.update({ lead_score: newScore, updated_at: new Date() });
  return newScore;
}

// Recalculate the full score from all email_events associated with this contact's sends
export async function recalculateScore(contactId: string): Promise<number> {
  const contact = await Contact.findByPk(contactId);
  if (!contact) throw new Error(`Contact not found: ${contactId}`);

  // Fetch all email events for this contact via their sends
  const events = await EmailEvent.findAll({
    include: [
      {
        association: 'send',
        where: { contact_id: contactId },
        attributes: [],
        required: true,
      },
    ],
  });

  const EVENT_TYPE_TO_RULE: Record<string, ScoreEvent | undefined> = {
    open: 'email_opened',
    click: 'link_clicked',
    bounce: 'bounced',
    unsubscribe: undefined,
  };

  let score = 0;
  for (const event of events) {
    const rule = EVENT_TYPE_TO_RULE[event.event_type];
    if (rule !== undefined) {
      score += SCORE_RULES[rule];
    }
  }

  const newScore = Math.max(0, score);
  await contact.update({ lead_score: newScore, updated_at: new Date() });
  return newScore;
}
