import { Router, Request, Response } from 'express';
import { Send, Contact, EmailEvent, Conversion } from '../models/index.js';
import { trackOpen, trackClick } from '../services/tracker.js';
import { logActivity } from '../services/activity.js';

const router = Router();
const param = (v: string | string[]) => Array.isArray(v) ? v[0] : v;

// Allowed redirect destinations — talkspresso.com and subdomains only
const ALLOWED_REDIRECT_FALLBACK = 'https://talkspresso.com';

function isAllowedRedirectUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === 'https:' &&
      (parsed.hostname === 'talkspresso.com' || parsed.hostname.endsWith('.talkspresso.com'))
    );
  } catch {
    return false;
  }
}

// 1x1 transparent GIF
const PIXEL = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');

// GET /t/o/:trackingId - Tracking pixel (open)
router.get('/o/:trackingId', (req: Request, res: Response) => {
  const trackingId = param(req.params.trackingId);
  const metadata = {
    ip: (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress,
    userAgent: req.headers['user-agent'],
  };

  // Fire and forget — do not await
  trackOpen(trackingId, metadata).catch(console.error);

  res.set({
    'Content-Type': 'image/gif',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
    'Content-Length': String(PIXEL.length),
  });
  res.send(PIXEL);
});

// GET /t/c/:trackingId - Click redirect
router.get('/c/:trackingId', (req: Request, res: Response) => {
  const trackingId = param(req.params.trackingId);
  const rawUrl = req.query.url as string | undefined;
  const decoded = rawUrl ? decodeURIComponent(rawUrl) : '';
  const destination = (decoded && isAllowedRedirectUrl(decoded)) ? decoded : ALLOWED_REDIRECT_FALLBACK;

  const metadata = {
    ip: (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress,
    userAgent: req.headers['user-agent'],
  };

  // Fire and forget — only track if a valid URL was provided
  if (decoded && isAllowedRedirectUrl(decoded)) {
    trackClick(trackingId, destination, metadata).catch(console.error);
  }

  res.redirect(302, destination);
});

// GET /t/u/:trackingId - Unsubscribe
router.get('/u/:trackingId', async (req: Request, res: Response) => {
  const trackingId = param(req.params.trackingId);

  const send = await Send.findOne({ where: { tracking_id: trackingId } });
  if (!send) {
    res.status(200).send('<html><body><p>You have been unsubscribed.</p></body></html>');
    return;
  }

  const contact = await Contact.findByPk(send.contact_id);
  if (contact && !contact.suppressed) {
    await contact.update({
      suppressed: true,
      status: 'unsubscribed',
      updated_at: new Date(),
    });

    await EmailEvent.create({
      send_id: send.id,
      event_type: 'unsubscribe',
      metadata: {
        ip: (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress,
        userAgent: req.headers['user-agent'],
      },
      occurred_at: new Date(),
    });

    await logActivity({
      contactId: contact.id,
      type: 'unsubscribed',
      description: 'Contact unsubscribed via email link',
      metadata: { send_id: send.id, tracking_id: trackingId },
    });
  }

  res.set('Content-Type', 'text/html');
  res.status(200).send(`<!DOCTYPE html>
<html>
<head><title>Unsubscribed</title></head>
<body style="font-family:sans-serif;max-width:480px;margin:60px auto;text-align:center;color:#333;">
  <h2>You have been unsubscribed</h2>
  <p>You will no longer receive emails from us.</p>
</body>
</html>`);
});

// POST /t/attribution - Link a talkspresso signup back to the originating send
router.post('/attribution', async (req: Request, res: Response) => {
  const { tracking_id, talkspresso_user_id } = req.body;

  if (!tracking_id || !talkspresso_user_id) {
    res.status(400).json({ error: 'tracking_id and talkspresso_user_id are required' });
    return;
  }

  const send = await Send.findOne({ where: { tracking_id } });
  if (!send) {
    res.status(404).json({ error: 'tracking_id not found' });
    return;
  }

  const contact = await Contact.findByPk(send.contact_id);
  if (!contact) {
    res.status(404).json({ error: 'Contact not found' });
    return;
  }

  await contact.update({
    talkspresso_user_id,
    status: 'signed_up',
    updated_at: new Date(),
  });

  await Conversion.create({
    contact_id: contact.id,
    event_type: 'attributed_signup',
    event_data: {
      tracking_id,
      send_id: send.id,
      talkspresso_user_id,
      sequence_id: send.sequence_id,
    },
  });

  await logActivity({
    contactId: contact.id,
    type: 'attributed_signup',
    description: 'Contact signed up for Talkspresso via email campaign',
    metadata: { tracking_id, send_id: send.id, talkspresso_user_id },
  });

  res.json({ ok: true, contact_id: contact.id });
});

export default router;
