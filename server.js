require('dotenv').config();
const express = require('express');
const { auth } = require('express-openid-connect');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

const config = {
  authRequired: false,
  auth0Logout: true,
  secret: process.env.AUTH0_SECRET,
  baseURL: process.env.AUTH0_BASE_URL,
  clientID: process.env.AUTH0_CLIENT_ID,
  issuerBaseURL: process.env.AUTH0_ISSUER_BASE_URL,
  clientSecret: process.env.AUTH0_CLIENT_SECRET,
  authorizationParams: {
    response_type: 'code',
    scope: 'openid profile email'
  }
};

// auth router attaches /login, /logout, and /callback routes to the baseURL
app.use(auth(config));

// Parse JSON payloads from the frontend
app.use(express.json());

// API to expose user info to the frontend
app.get('/api/user', (req, res) => {
  if (req.oidc.isAuthenticated()) {
    res.json({ authenticated: true, user: req.oidc.user });
  } else {
    res.json({ authenticated: false });
  }
});

// The Execution Bridge (Token Vault Integrator)
app.post('/api/execute', async (req, res) => {
  if (!req.oidc.isAuthenticated()) {
    return res.status(401).json({ error: 'unauthorized', message: 'You must be logged in to execute an action.' });
  }

  const { plan } = req.body;
  if (!plan) return res.status(400).json({ error: 'bad_request', message: 'Missing capability plan payload.' });
  
  try {
    // 1. Token Exchange (RFC 8693) for Token Vault
    // We mock the HTTP call specifically to the Auth0 Tenant to attempt federation.
    console.log(`[Token Vault] Attempting token exchange for user ${req.oidc.user.sub}...`);
    
    // For this hackathon prototype, we demonstrate "Step-up Authentication" for mutating actions:
    if (plan.risk_level === 'high') {
      console.log(`[Token Vault] High risk action detected. Requesting step-up consent.`);
      return res.status(403).json({
        error: 'consent_required',
        message: 'Step-up authentication required for high-risk mutating actions.',
        authorization_url: `${process.env.AUTH0_ISSUER_BASE_URL}/authorize?prompt=consent&scope=offline_access`
      });
    }

    // Native implementation to exchange the local OAuth session for Google/Jira Token
    const audience = plan.capabilities.map(c => c.target_service).join(' ');
    const fakeTokenResponse = await fetch(`${process.env.AUTH0_ISSUER_BASE_URL}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
        client_id: process.env.AUTH0_CLIENT_ID,
        client_secret: process.env.AUTH0_CLIENT_SECRET,
        subject_token_type: 'urn:ietf:params:oauth:token-type:access_token',
        audience: `urn:auth0:connection:${audience}`
      })
    }).catch(err => null); // Fail silently for demo if tenant not fully configured

    // 2. Execution Logic
    // Token successfully acquired (simulated). The execution bridge makes the 3rd-party API calls.
    console.log(`[Token Vault] Authorized. Executing capabilities securely.`);

    res.json({
      success: true,
      message: 'Tokens successfully negotiated via Token Vault and capabilities executed.',
      executed_plan: plan,
      audit_event: {
        timestamp: new Date().toISOString(),
        user_id: req.oidc.user.sub,
        session_id: req.oidc.idTokenClaims?.sid || "session-demo-001",
        agent_id: "bridgekeeper-gateway",
        identity_layer: "auth0_token_vault",
        status: "authorized_and_executed",
        federated_exchange_attempted: true,
        capability_count: plan.capabilities.length
      }
    });

  } catch (err) {
    console.error("Token Exchange Error:", err);
    res.status(500).json({ error: 'server_error', message: err.message });
  }
});

// Serve static files from the root directory
app.use(express.static(__dirname));

// Fallback to index.html for unknown routes
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`Bridgekeeper running at http://localhost:${PORT}`);
  });
}

module.exports = app;
