import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { sequelize } from './db.js';
import './models/index.js'; // register associations
import contactRoutes from './routes/contacts.js';
import sendRoutes from './routes/sends.js';
import sequenceRoutes from './routes/sequences.js';
import dashboardRoutes from './routes/dashboard.js';
import { startScheduler } from './services/scheduler.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = parseInt(process.env.PORT || '3100');

// Middleware
app.use(express.json({ limit: '5mb' }));

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

// Dashboard page (served without API auth, has its own token input)
app.get('/dashboard', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// API routes (require auth)
app.use('/api/contacts', authMiddleware, contactRoutes);
app.use('/api/sends', authMiddleware, sendRoutes);
app.use('/api/sequences', authMiddleware, sequenceRoutes);
app.use('/api/dashboard', authMiddleware, dashboardRoutes);

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
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
