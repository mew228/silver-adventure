# Bridgekeeper — Architecture & Security Model

## Overview

Bridgekeeper is a two-layer system that separates **AI intent decomposition** from **governed API execution**. Auth0 Token Vault sits at the trust boundary between the layers — all OAuth lifecycle management is delegated to Vault, and the local agent never sees a raw credential.

---

## System Components

```
┌─────────────────────────────────────────────────────────────────┐
│                         BROWSER / CLIENT                        │
│  index.html + app.js                                            │
│  • Capability Planner UI         • Step-up consent modal        │
│  • Real-time job status polling  • Async-auth banner            │
│  • Audit log viewer                                             │
└────────────────────────────┬────────────────────────────────────┘
                             │ HTTP (POST /api/plan, POST /api/execute)
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│              LAYER 2: GOVERNED EXECUTION BRIDGE                 │
│                    (Node.js / Express)                          │
│                                                                 │
│  bridge/router.ts       — validates all inbound requests (Zod) │
│  bridge/planner.ts      — decomposes goal → CapabilityPlan[]   │
│  bridge/executor.ts     — orchestrates with policy + vault      │
│  bridge/policy.ts       — LOW/MEDIUM/HIGH risk posture engine  │
│  bridge/audit.ts        — structured pino logger + ring buffer │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              AUTH0 TOKEN VAULT LAYER                    │   │
│  │  vault/client.ts    — SDK wrapper, never caches tokens  │   │
│  │  vault/delegated.ts — silent refresh on near-expiry     │   │
│  │  vault/async-auth.ts— suspend/resume for unlinked prv   │   │
│  │  vault/stepup.ts    — step-up MFA for HIGH-risk actions │   │
│  └─────────────────────────────────────────────────────────┘   │
└────────────────────────────┬────────────────────────────────────┘
                             │ scoped access_token (per request)
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                      PROVIDER APIs                              │
│  Gmail · Google Calendar · GitHub · Jira · Notion · Slack      │
└─────────────────────────────────────────────────────────────────┘
```

```
                        LOCAL AGENT SANDBOX
┌─────────────────────────────────────────────────────────────────┐
│  agent/local-agent.ts (Claude claude-sonnet-4-20250514)          │
│                                                                 │
│  ✅ Allowed:  POST /api/plan  → receives CapabilityPlan JSON    │
│  ❌ Blocked:  direct HTTP to any provider API                   │
│  ❌ Blocked:  direct access to Token Vault                      │
│  ❌ Blocked:  storage of any credential or refresh token        │
└─────────────────────────────────────────────────────────────────┘
```

---

## Token Vault Integration Points (4 of 4)

### (a) Normal Delegated OAuth
**File:** `src/vault/delegated.ts` → `getTokenForProvider()`

When a provider is connected, `vault/client.ts` calls the Auth0 Management API's Token Vault endpoint to retrieve a valid access token. The bridge fetches a fresh token **per provider API call** — it is never stored in process memory or cached between requests.

```
executor.ts → getTokenForProvider(userId, 'gmail')
           → vaultClient.getToken(userId, 'gmail')
           → GET /api/v2/users/{userId}/token-vault/gmail
           ← { access_token, expires_at, scope }
           → gmail.readGmailThreads(accessToken, query)
```

### (b) Token Refresh
**File:** `src/vault/delegated.ts` → `refreshToken()`

Before returning a token, `getTokenForProvider()` checks if it expires within 5 minutes. If so, it triggers a silent refresh. In production, re-fetching from the Token Vault API automatically uses the stored refresh token to return a fresh access token—no user interaction required.

```
token.expiresAt - Date.now() < 5 * 60 * 1000
  → refreshToken(userId, provider)
  → re-fetch from Vault (internally uses stored refresh_token)
  ← fresh { access_token, new expires_at }
```

### (c) Async Authorization
**File:** `src/vault/async-auth.ts`

When `executor.ts` gets `null` from `getTokenForProvider()` (provider not linked), it calls `initiateAsyncAuth()`. This:
1. Generates a Token Vault authorization URL (Auth0 `/authorize` with offline_access scope)
2. Stores a `pendingAuthRequest` keyed by `requestId`
3. Updates the job to `suspended_async_auth` status
4. Returns `authUrl` to the UI

When the user completes OAuth, `completeAsyncAuth()` stores the new token in Vault and signals the job to resume via `resumeJobAfterAsyncAuth()`.

```
executor → getTokenForProvider() → null
        → initiateAsyncAuth(jobId, userId, 'notion')
        ← { requestId, authUrl: 'https://tenant.auth0.com/authorize?...' }
        → job.status = 'suspended_async_auth'
        → UI shows auth banner with authUrl
[user completes OAuth]
        → completeAsyncAuth(requestId, accessToken, scope, expiresIn)
        → vaultClient.storeToken(userId, 'notion', token)
        → resumeJobAfterAsyncAuth(jobId)
        → executor resumes, getTokenForProvider() now returns valid token
```

### (d) Step-Up Authentication
**File:** `src/vault/stepup.ts`

Before executing any action with `riskLevel === 'HIGH'` (send, delete, publish, merge), `executor.ts` calls `issueStepUpChallenge()`. This:
1. Creates a challenge with a 5-minute TTL
2. Generates a step-up Auth0 URL (uses `acr_values=multi-factor`)
3. Updates the job to `suspended_stepup`
4. Returns `stepUpUrl` to the UI for the consent modal

The executor only proceeds after `approveStepUpChallenge()` is confirmed.

```
policy.doesRequireStepUp('send_email') → true
executor → issueStepUpChallenge(jobId, userId, 'send_email', 'gmail')
         ← { challengeId, stepUpUrl, status: 'pending' }
         → job.status = 'suspended_stepup'
         → UI shows consent modal
[user approves]
         → approveStepUpChallenge(challengeId)
         → resumeJobAfterStepUp(jobId)
         → executor continues with send_email
```

---

## Security Model

### Principle of Least Privilege
- Every provider call uses the **minimum required OAuth scope** for that action
- Scopes are hardcoded in `vault/async-auth.ts` `scopeForProvider()` — cannot be escalated by the agent
- The local agent has zero visibility into Token Vault — it only sends goals to `/api/plan`

### Token Hygiene
- Tokens are **never** stored in process memory between requests
- Tokens are **never** logged (audit events log provider+action, not tokens)
- Tokens are fetched fresh from Vault before every provider API call
- Token Vault handles all refresh_token lifecycle — the bridge never sees a refresh token

### Defense in Depth
```
Request flow with all guards:

User goal
  → Zod schema validation (router.ts)
  → Intent decomposition — no credential access (planner.ts)
  → Policy evaluation — risk level check (policy.ts)
  → Step-up gate — HIGH-risk actions require re-consent (stepup.ts)
  → Vault token retrieval — async-auth if provider not linked (delegated.ts)
  → BEFORE audit event (audit.ts)
  → Provider API call (providers/*.ts)
  → AFTER audit event (audit.ts)
```

### Risk Posture Matrix

| Risk Level | Action Examples | LOW Posture | MEDIUM Posture | HIGH Posture |
|---|---|---|---|---|
| LOW | read_emails, list_events, list_repos | ✅ Allowed | ✅ Allowed | ✅ Allowed |
| MEDIUM | create_event, create_issue, create_page | ❌ Blocked | ✅ Allowed | ✅ Allowed |
| HIGH | send_email, send_message, delete | ❌ Blocked | ✅ + Step-up | ✅ + Step-up |
| CRITICAL | delete_repo, admin | ❌ Blocked | ❌ Blocked | ✅ + Step-up |

> Step-up is **always required** for HIGH/CRITICAL actions regardless of posture.

---

## Sequence Diagram: Full Capability Execution

```
Browser        Bridge         Policy        Vault         Provider
  │              │              │              │              │
  │─ POST /api/execute ────────►│              │              │
  │              │─ decomposePlan() ──────────►│              │
  │              │◄─ CapabilityPlan[] ─────────│              │
  │              │─ evaluateCapability() ──────►│              │
  │              │◄─ { allowed, requiresStepUp }│              │
  │              │                             │              │
  │◄─ 202 { jobId } ────────────│              │              │
  │              │              │              │              │
  │              │ [HIGH risk action]           │              │
  │              │─ issueStepUpChallenge() ─────────────────► │
  │              │◄─ { challengeId, stepUpUrl } ──────────────│
  │              │─ job.status='suspended_stepup'              │
  │              │              │              │              │
  │─ GET /api/jobs/:id ─────────►              │              │
  │◄─ { requiresStepUp: true, stepUpUrl } ─────│              │
  │ [shows consent modal]        │              │              │
  │─ POST /api/stepup/approve ──►│              │              │
  │              │─ approveStepUpChallenge()   │              │
  │              │              │              │              │
  │              │─ getTokenForProvider() ──────────────────► │
  │              │◄─ { accessToken } ──────────────────────── │
  │              │─ auditProviderBefore()      │              │
  │              │─────────────────────────────────────────── ► provider API
  │              │◄────────────────────────────────────────── result
  │              │─ auditProviderAfter()       │              │
  │              │─ job.status='completed'     │              │
  │─ GET /api/jobs/:id ─────────►              │              │
  │◄─ { status: 'completed', results } ────────│              │
```

---

## Audit Event Schema

Every event is emitted to stdout as structured JSON (pino) and stored in a 100-event ring buffer for the UI:

```json
{
  "id": "evt_42_1711234567890",
  "timestamp": "2026-03-26T17:30:00.000Z",
  "type": "provider.call.after",
  "jobId": "550e8400-e29b-41d4-a716-446655440000",
  "userId": "demo-user",
  "provider": "gmail",
  "action": "read_emails",
  "riskLevel": "LOW",
  "outcome": "success",
  "durationMs": 312,
  "message": "gmail.read_emails completed in 312ms"
}
```

Event types follow a `domain.subdomain.action` convention covering all vault, provider, job, and capability lifecycle events.
