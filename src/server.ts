/**
 * server.ts
 * Express application entrypoint for Bridgekeeper.
 * Handles routing, middleware, static files, and auth callbacks.
 */

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import * as dotenv from 'dotenv';
import { router as apiRouter } from './bridge/router';
import { mockCompleteAsyncAuth } from './vault/async-auth';
import { approveStepUpChallenge } from './vault/stepup';
import { logger } from './bridge/audit';

dotenv.config();

const app = express();
const PORT = parseInt(process.env.PORT ?? '3000', 10);

// ─────────────────────────────────────────────────────────────────────────────
// Middleware
// ─────────────────────────────────────────────────────────────────────────────

app.use(
  helmet({
    contentSecurityPolicy: false, // disabled for demo UI's inline scripts
  })
);
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req: Request, _res: Response, next: NextFunction) => {
  logger.info({ method: req.method, url: req.url }, 'Incoming request');
  next();
});

// ─────────────────────────────────────────────────────────────────────────────
// Static files (frontend)
// ─────────────────────────────────────────────────────────────────────────────

app.use(express.static(path.join(__dirname, '..', 'public')));

// ─────────────────────────────────────────────────────────────────────────────
// API Routes
// ─────────────────────────────────────────────────────────────────────────────

app.use('/api', apiRouter);

// ─────────────────────────────────────────────────────────────────────────────
// Auth Callback Routes (mock + production)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Mock OAuth callback — simulates provider connection in demo mode.
 * In production, this would be the real Auth0 callback.
 */
app.get('/auth/connect', async (req: Request, res: Response) => {
  const { requestId } = req.query as { requestId?: string };

  if (!requestId) {
    res.status(400).send('Missing requestId');
    return;
  }

  if (process.env.MOCK_PROVIDERS === 'true') {
    await mockCompleteAsyncAuth(requestId);
    // Redirect to UI with success message
    res.send(`
      <!DOCTYPE html>
      <html>
      <head><title>Bridgekeeper — Authorization Complete</title>
      <style>
        body { font-family: system-ui; background: #0a0a0f; color: #e2e8f0; 
               display: flex; align-items: center; justify-content: center; 
               height: 100vh; margin: 0; }
        .card { background: #1a1a2e; border: 1px solid #22c55e; border-radius: 12px;
                padding: 2rem; text-align: center; max-width: 400px; }
        h2 { color: #22c55e; } p { color: #94a3b8; }
        button { background: #22c55e; color: #0a0a0f; border: none; 
                 padding: 0.75rem 2rem; border-radius: 8px; cursor: pointer;
                 font-size: 1rem; font-weight: 600; margin-top: 1rem; }
      </style>
      </head>
      <body>
        <div class="card">
          <h2>✅ Authorization Complete</h2>
          <p>Provider successfully connected via Auth0 Token Vault.<br>
             The suspended job will now resume automatically.</p>
          <button onclick="window.close()">Close & Return</button>
        </div>
        <script>
          setTimeout(() => {
            window.opener && window.opener.postMessage({ type: 'async-auth-complete', requestId: '${requestId}' }, '*');
            setTimeout(() => window.close(), 500);
          }, 1500);
        </script>
      </body>
      </html>
    `);
    return;
  }

  // Production: handle real Auth0 callback
  res.redirect('/');
});

/**
 * Step-up authentication callback.
 */
app.get('/auth/stepup', async (req: Request, res: Response) => {
  const { challengeId } = req.query as { challengeId?: string };

  if (!challengeId) {
    res.status(400).send('Missing challengeId');
    return;
  }

  if (process.env.MOCK_PROVIDERS === 'true') {
    await approveStepUpChallenge(challengeId);
    res.send(`
      <!DOCTYPE html>
      <html>
      <head><title>Bridgekeeper — Step-Up Approved</title>
      <style>
        body { font-family: system-ui; background: #0a0a0f; color: #e2e8f0;
               display: flex; align-items: center; justify-content: center;
               height: 100vh; margin: 0; }
        .card { background: #1a1a2e; border: 1px solid #f59e0b; border-radius: 12px;
                padding: 2rem; text-align: center; max-width: 400px; }
        h2 { color: #f59e0b; } p { color: #94a3b8; }
        button { background: #f59e0b; color: #0a0a0f; border: none;
                 padding: 0.75rem 2rem; border-radius: 8px; cursor: pointer;
                 font-size: 1rem; font-weight: 600; margin-top: 1rem; }
      </style>
      </head>
      <body>
        <div class="card">
          <h2>🔐 Step-Up Approved</h2>
          <p>High-risk action authorized. The job will now proceed.</p>
          <button onclick="window.close()">Close & Return</button>
        </div>
        <script>
          setTimeout(() => {
            window.opener && window.opener.postMessage({ type: 'stepup-approved', challengeId: '${challengeId}' }, '*');
            setTimeout(() => window.close(), 500);
          }, 1500);
        </script>
      </body>
      </html>
    `);
    return;
  }

  res.redirect('/');
});

// ─────────────────────────────────────────────────────────────────────────────
// Health check
// ─────────────────────────────────────────────────────────────────────────────

app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'Bridgekeeper',
    version: '1.0.0',
    mockMode: process.env.MOCK_PROVIDERS === 'true',
    timestamp: new Date().toISOString(),
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SPA fallback — serve index.html for all non-API routes
// ─────────────────────────────────────────────────────────────────────────────

app.get('*', (req: Request, res: Response) => {
  if (!req.path.startsWith('/api') && !req.path.startsWith('/auth')) {
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Error middleware
// ─────────────────────────────────────────────────────────────────────────────

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  logger.error({ err: err.message, stack: err.stack }, 'Unhandled error');
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong',
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Start server
if (process.env.NODE_ENV !== 'test' && !process.env.VERCEL) {
  app.listen(PORT, () => {
    logger.info(
      {
        port: PORT,
        mockMode: process.env.MOCK_PROVIDERS === 'true',
        nodeEnv: process.env.NODE_ENV,
      },
      `🔐 Bridgekeeper running on http://localhost:${PORT}`
    );
  });
}

export default app;
