const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const sessionMiddleware = require('./config/session');

const authRoutes = require('./routes/auth');
const requestRoutes = require('./routes/requests');
const calendarRoutes = require('./routes/calendar');
const adminRoutes = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 3001;
const isProduction = process.env.NODE_ENV === 'production';

// Trust proxy in production (behind Railway/Render load balancer)
if (isProduction) {
  app.set('trust proxy', 1);
}

// Security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:"],
      connectSrc: ["'self'"],
    },
  },
}));

// CORS — in production, frontend is served from same origin
app.use(cors({
  origin: isProduction
    ? (process.env.CLIENT_URL || true)
    : (process.env.CLIENT_URL || 'http://localhost:5173'),
  credentials: true,
}));

// Body parsing (10mb limit for CSV imports)
app.use(express.json({ limit: '10mb' }));

// Session
app.use(sessionMiddleware);

// Rate limiting on auth routes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  message: { error: 'Too many attempts. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/verify-otp', authLimiter);

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/requests', requestRoutes);
app.use('/api/calendar', calendarRoutes);
app.use('/api/admin', adminRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// --- Production: serve built React frontend ---
if (isProduction) {
  const clientDist = path.join(__dirname, '../../client/dist');
  // Hashed assets (JS/CSS) — cache forever (immutable)
  app.use('/assets', express.static(path.join(clientDist, 'assets'), {
    maxAge: '1y',
    immutable: true,
  }));
  // Other static files
  app.use(express.static(clientDist, { maxAge: 0 }));
  // All non-API routes → index.html with no-cache so browser always gets latest
  app.get('*', (req, res) => {
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

// Log startup diagnostics
console.log('Starting VNC ICU server...');
console.log(`  PORT=${PORT}, NODE_ENV=${process.env.NODE_ENV}`);
console.log(`  DATABASE_URL=${process.env.DATABASE_URL ? 'set (' + process.env.DATABASE_URL.split('@')[1]?.split('/')[0] + ')' : 'NOT SET'}`);
console.log(`  SESSION_SECRET=${process.env.SESSION_SECRET ? 'set' : 'NOT SET'}`);

app.listen(PORT, '0.0.0.0', () => {
  console.log(`VNC ICU server running on port ${PORT} [${isProduction ? 'production' : 'development'}]`);
});
