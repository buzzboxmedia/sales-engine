import { Router, Request, Response } from 'express';
import { Send, Contact, EmailEvent } from '../models/index.js';
import { trackOpen, trackClick } from '../services/tracker.js';
import { logActivity } from '../services/activity.js';

const router = Router();
const param = (v: string | string[]) => Array.isArray(v) ? v[0] : v;

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
  const destination = rawUrl ? decodeURIComponent(rawUrl) : 'https://talkspresso.com';

  const metadata = {
    ip: (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress,
    userAgent: req.headers['user-agent'],
  };

  // Fire and forget
  if (rawUrl) {
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

export default router;
