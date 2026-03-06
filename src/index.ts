import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { sequelize } from './db.js';
import './models/index.js'; // register associations
import contactRoutes from './routes/contacts.js';
import sendRoutes from './routes/sends.js';
import sequenceRoutes from './routes/sequences.js';
import dashboardRoutes from './routes/dashboard.js';
import trackRoutes from './routes/track.js';
import activityRoutes from './routes/activity.js';
import templateRoutes from './routes/templates.js';
import listRoutes from './routes/lists.js';
import companyRoutes from './routes/companies.js';
import adminRoutes from './routes/admin.js';
import { startScheduler } from './services/scheduler.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.set('trust proxy', 1);
const PORT = parseInt(process.env.PORT || '3100');

// Security headers (permissive CSP for inline scripts/styles in dashboard)
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "cdn.jsdelivr.net"],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "fonts.googleapis.com"],
      fontSrc: ["'self'", "fonts.googleapis.com", "fonts.gstatic.com"],
      connectSrc: ["'self'"],
      imgSrc: ["'self'", "data:"],
    },
  },
}));

// Middleware
app.use(express.json({ limit: '5mb' }));

// Rate limit API routes: 200 requests per 15 minutes
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});
app.use('/api/', apiLimiter);

// Auth middleware for API routes
function authMiddleware(req: express.Request, res: express.Response, next: express.NextFunction) {
  // Allow dashboard page without auth
  if (req.path === '/dashboard' || req.path.startsWith('/public/')) {
    // Dashboard uses token from query param or localStorage
    next();
    return;
  }

  const token = req.headers.authorization?.replace('Bearer ', '') || req.query.token;
  if (!token || token !== process.env.API_TOKEN) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
}

// Static files
app.use('/public', express.static(path.join(__dirname, 'public')));

// Rate limit tracking routes: 60 req/min per IP
const trackingLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});

// Public tracking routes — no auth required, must be before auth middleware
app.use('/t', trackingLimiter, trackRoutes);

// Dashboard page (served without API auth, has its own token input)
app.get('/dashboard', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// Password login — validates password, returns API token
app.post('/api/login', (req, res) => {
  const { password } = req.body;
  if (password === process.env.DASHBOARD_PASSWORD) {
    res.json({ token: process.env.API_TOKEN });
  } else {
    res.status(401).json({ error: 'Wrong password' });
  }
});

// API routes (require auth)
app.use('/api/contacts', authMiddleware, contactRoutes);
app.use('/api/sends', authMiddleware, sendRoutes);
app.use('/api/sequences', authMiddleware, sequenceRoutes);
app.use('/api/dashboard', authMiddleware, dashboardRoutes);
app.use('/api/activity', authMiddleware, activityRoutes);
app.use('/api/templates', authMiddleware, templateRoutes);
app.use('/api/lists', authMiddleware, listRoutes);
app.use('/api/companies', authMiddleware, companyRoutes);
app.use('/api/admin', authMiddleware, adminRoutes);

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Global error handler - no stack traces in responses
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start
async function start() {
  try {
    await sequelize.authenticate();
    console.log('Database connected');

    // Start crons unless running migrations or imports
    if (process.env.NO_CRON !== 'true') {
      startScheduler();
    }

    app.listen(PORT, () => {
      console.log(`Sales Engine running on port ${PORT}`);
      console.log(`Dashboard: http://localhost:${PORT}/dashboard`);
    });
  } catch (err) {
    console.error('Failed to start:', err);
    process.exit(1);
  }
}

start();

export default app;
