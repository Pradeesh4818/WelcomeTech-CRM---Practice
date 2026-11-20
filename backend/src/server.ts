import express from 'express';
import cors from 'cors';
import compression from 'compression';
import fs from 'fs';
import path from 'path';
import { loadEnv } from './config/env';
import connectDB from './config/database';
import { UPLOAD_PUBLIC_BASE as UPLOAD_PUBLIC_BASE_DEFAULT, UPLOAD_ROOT_DIR as UPLOAD_ROOT_DIR_DEFAULT } from './config/storage';
import routes from './routes/index';
import { errorHandler } from './middleware/errorHandler';

loadEnv();

const app = express();
const PORT = process.env.PORT || 8080;

// ─── MIDDLEWARE ──────────────────────────────────
app.use(compression());
if (!process.env.FRONTEND_URL) {
  const msg = 'FRONTEND_URL is not set — CORS will default to http://localhost:3000';
  if (process.env.NODE_ENV === 'production') {
    throw new Error(`${msg}. Set FRONTEND_URL to your frontend origin in production.`);
  }
  console.warn(`[cors] ${msg}`);
}
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
}));
app.use(express.json({
  limit: '10mb',
  // Preserve the raw body so webhook signatures (X-Hub-Signature-256) can be verified.
  verify: (req, _res, buf) => { (req as any).rawBody = buf; },
}));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging for debugging deployment issues
app.use((req, res, next) => {
  const now = new Date().toISOString();
  console.log(`[${now}] ${req.method} ${req.url}`);
  next();
});

// ─── STATIC ASSETS ───────────────────────────────
const uploadDir = process.env.UPLOAD_ROOT_DIR || UPLOAD_ROOT_DIR_DEFAULT;
const publicBase = process.env.UPLOAD_PUBLIC_BASE || UPLOAD_PUBLIC_BASE_DEFAULT;
const API_PREFIX = process.env.API_V1_PREFIX || '/api/v1';

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Serve at root /uploads
app.use(publicBase, express.static(uploadDir));
app.use(publicBase, (_req, res) => {
  res.status(404).send('Not Found');
});

// Also serve at /api/v1/uploads to support staging/production asset URLs
if (publicBase.startsWith('/')) {
  app.use(`${API_PREFIX}${publicBase}`, express.static(uploadDir));
  app.use(`${API_PREFIX}${publicBase}`, (_req, res) => {
    res.status(404).send('Not Found');
  });
}

// ─── ROUTES ──────────────────────────────────────
import { verifyWhatsappWebhook, receiveWhatsappWebhook } from './controllers/settingsController';
import backupRoutes from './routes/backup';

// Direct Webhook endpoints to handle any Callback URL variant from Meta
app.get('/webhooks/whatsapp', verifyWhatsappWebhook);
app.post('/webhooks/whatsapp', receiveWhatsappWebhook);
app.get('/api/webhooks/whatsapp', verifyWhatsappWebhook);
app.post('/api/webhooks/whatsapp', receiveWhatsappWebhook);

// Direct /api/backup endpoints for compatibility
app.use('/api/backup', backupRoutes);

app.use(API_PREFIX, routes);

// Fallback for standard /api/v1 if custom prefix is used
// Serve static Privacy Policy HTML for Meta Crawler validation (non-JS SSR) with Open Graph metadata
app.get(['/privacy-policy', '/privacy-policy/'], (_req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(200).send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Privacy Policy - WelcomeTech CRM</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="Privacy Policy for WelcomeTech CRM application and WhatsApp integration.">
  <meta property="og:title" content="Privacy Policy - WelcomeTech CRM" />
  <meta property="og:description" content="Privacy Policy for WelcomeTech CRM application and WhatsApp integration." />
  <meta property="og:type" content="website" />
  <meta property="og:url" content="https://crm.welcometech.qa/privacy-policy" />
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; max-width: 800px; margin: 40px auto; padding: 20px; line-height: 1.6; color: #1f2937; }
    h1 { font-size: 28px; color: #111827; border-bottom: 2px solid #e5e7eb; padding-bottom: 12px; }
    h2 { font-size: 20px; color: #1f2937; margin-top: 24px; }
    p { margin-bottom: 16px; }
  </style>
</head>
<body>
  <h1>Privacy Policy</h1>
  <p>WelcomeTech CRM ("we", "our", or "us") is committed to protecting your privacy. This Privacy Policy explains how your personal information is collected, used, and disclosed by WelcomeTech CRM.</p>
  <h2>1. Information We Collect</h2>
  <p>We collect information you provide directly to us when using our CRM services, including contact information, customer support tickets, and customer communications via Meta WhatsApp Business API.</p>
  <h2>2. Use of Information</h2>
  <p>We use collected information solely for operating our CRM platform, managing customer requests, sending notification reminders, and delivering customer service.</p>
  <h2>3. Data Protection & Security</h2>
  <p>We implement strict security measures to maintain the safety of your personal data. We do not sell, trade, or transfer your personal data to outside parties.</p>
  <h2>4. Contact Us</h2>
  <p>If you have any questions about this Privacy Policy, please contact us at: <strong>welcometechtrade@gmail.com</strong></p>
</body>
</html>`);
});

app.get(['/terms', '/terms/'], (_req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(200).send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Terms of Service - WelcomeTech CRM</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>body { font-family: sans-serif; max-width: 800px; margin: 40px auto; padding: 20px; line-height: 1.6; color: #1f2937; }</style>
</head>
<body>
  <h1>Terms of Service</h1>
  <p>Welcome to WelcomeTech CRM. By using our platform and WhatsApp integration, you agree to these Terms of Service.</p>
  <h2>Acceptable Use</h2>
  <p>You agree to use our services in compliance with all applicable laws and Meta WhatsApp Cloud API policies.</p>
</body>
</html>`);
});

app.get(['/data-deletion', '/data-deletion/'], (_req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(200).send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>User Data Deletion Instructions - WelcomeTech CRM</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>body { font-family: sans-serif; max-width: 800px; margin: 40px auto; padding: 20px; line-height: 1.6; color: #1f2937; }</style>
</head>
<body>
  <h1>User Data Deletion Instructions</h1>
  <p>WelcomeTech CRM users can request deletion of their account and associated data by emailing <strong>welcometechtrade@gmail.com</strong>.</p>
</body>
</html>`);
});



app.get('/health', (_req, res) => res.json({ status: 'ok', env: process.env.NODE_ENV }));



// ─── ERROR HANDLING ──────────────────────────────
app.use((req, res) => {
  console.warn(`[404] No route matched for ${req.method} ${req.originalUrl}`);
  res.status(404).json({ success: false, message: `Route ${req.originalUrl} not found` });
});
app.use(errorHandler);

import { purgeDeletedLeadsAndOrphans } from './controllers/leadController';
import { assignMissingCustomerNumbers } from './models/Customer';
import { normalizeLegacyProposals } from './models/ProposalMigration';
import { initBackupScheduler } from './services/backupScheduler';

// ─── START ───────────────────────────────────────
const start = async (): Promise<void> => {
  const dbConnected = await connectDB();
  if (dbConnected) {
    await purgeDeletedLeadsAndOrphans();
    await assignMissingCustomerNumbers();
    await normalizeLegacyProposals();
    await initBackupScheduler();
  }
  app.listen(PORT, () => {
    console.log(`
🚀 Server running in ${process.env.APP_ENV || 'local'} mode
📍 Local:   http://localhost:${PORT}
🔗 Prefix:  ${API_PREFIX}
📁 Uploads: ${uploadDir}
    `);
    
    if (!dbConnected) {
      console.warn('⚠️  Running without MongoDB connection. Dev auth fallback may be used.');
    }
  });
};

start();

export default app;
