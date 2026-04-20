// ============================================
// AD FUSION v2.0 - Main Express Server
// World-class Meta Ad Optimizer
// ============================================
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import path from 'path';

import config from './config';
import { logger } from './utils/logger';
import { checkConnection } from './config/database';
import { startJobs } from './jobs/runner';

// Import routes
import authRoutes from './routes/auth';
import campaignRoutes from './routes/campaigns';
import aiRoutes from './routes/ai';
import automationRoutes from './routes/automation';
import dashboardRoutes from './routes/dashboard';
import billingRoutes from './routes/billing';
import webhookHandler from './webhooks/handler';
// v2.0 routes
import creativeRoutes from './routes/creative';
import capiRoutes from './routes/capi';
import abtestRoutes from './routes/abtests';
import competitorRoutes from './routes/competitors';
import attributionRoutes from './routes/attribution';
import auditRoutes from './routes/audit';

const app = express();

// ---- Security middleware ----
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://cdn.tailwindcss.com", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:", "blob:"],
      connectSrc: ["'self'", "https://graph.facebook.com", "https://www.facebook.com"],
    },
  },
}));

app.use(cors({
  origin: config.cors.origin,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Workspace-ID'],
}));

app.use(compression());
app.use(cookieParser());
app.use(morgan('combined', { stream: { write: (msg) => logger.info(msg.trim()) } }));

// Rate limiting
const apiLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.maxRequests,
  message: { success: false, error: { code: 'RATE_LIMIT', message: 'Too many requests' } },
  standardHeaders: true,
  legacyHeaders: false,
});

// Body parsing (webhook routes need raw body)
app.use('/api/webhooks/stripe', express.raw({ type: 'application/json' }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ---- Static files ----
app.use('/static', express.static(path.join(__dirname, '..', 'public', 'static')));

// ---- API Routes ----
app.use('/api/auth', authRoutes);
app.use('/api/campaigns', apiLimiter, campaignRoutes);
app.use('/api/ai', apiLimiter, aiRoutes);
app.use('/api/automation', apiLimiter, automationRoutes);
app.use('/api/dashboard', apiLimiter, dashboardRoutes);
app.use('/api/billing', apiLimiter, billingRoutes);
app.use('/api/webhooks', webhookHandler);
// v2.0 routes
app.use('/api/creative', apiLimiter, creativeRoutes);
app.use('/api/capi', apiLimiter, capiRoutes);
app.use('/api/abtests', apiLimiter, abtestRoutes);
app.use('/api/competitors', apiLimiter, competitorRoutes);
app.use('/api/attribution', apiLimiter, attributionRoutes);
app.use('/api/audit', apiLimiter, auditRoutes);

// ---- Health check ----
app.get('/api/health', async (_req, res) => {
  const dbHealthy = await checkConnection();
  res.json({
    status: dbHealthy ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    version: '2.0.0',
    services: {
      database: dbHealthy ? 'connected' : 'disconnected',
      environment: config.env,
    },
    features: {
      creative_intelligence: config.features.creativeIntelligence,
      capi: config.features.capiIntegration,
      andromeda: config.features.andromedaAwareness,
      proactive_ai: config.features.proactiveAiAudit,
      cross_channel: config.features.crossChannelAttribution,
      ab_testing: config.features.abTesting,
      competitor_intel: config.features.competitorIntelligence,
    },
  });
});

// ---- Serve Frontend (SPA) ----
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// ---- Global error handler ----
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error('Unhandled error', { error: err.message, stack: err.stack });
  res.status(500).json({
    success: false,
    error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
  });
});

// ---- Start server ----
async function start() {
  try {
    // Check database connection
    const dbConnected = await checkConnection();
    if (!dbConnected) {
      logger.warn('Database not available — starting in limited mode');
    } else {
      logger.info('Database connected');
    }

    // Start background jobs
    if (config.env !== 'test') {
      startJobs();
    }

    app.listen(config.port, '0.0.0.0', () => {
      logger.info(`Ad Fusion v2.0 server started on port ${config.port} [${config.env}]`);
      logger.info(`Dashboard: http://localhost:${config.port}`);
      logger.info(`API: http://localhost:${config.port}/api`);
      logger.info(`Health: http://localhost:${config.port}/api/health`);
      logger.info('Features: Creative Intelligence, CAPI, A/B Testing, Competitor Intel, Cross-Channel Attribution, Proactive AI Audit');
    });
  } catch (error) {
    logger.error('Failed to start server', { error: (error as Error).message });
    process.exit(1);
  }
}

start();

export default app;
