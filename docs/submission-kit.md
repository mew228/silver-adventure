# Bridgekeeper — Submission Kit

## Project Description

**Bridgekeeper** is a two-layer personal productivity agent that demonstrates the full power of Auth0 Token Vault for AI agent authorization. Built for the Auth0 "Authorized to Act" hackathon.

### What it does

Bridgekeeper lets you type a natural-language goal — "Check my emails, create GitHub issues for action items, and post a summary to Slack" — and executes it across multiple SaaS platforms using short-lived, scoped OAuth tokens managed entirely by Auth0 Token Vault. No raw credentials leave the vault. No token is ever cached in process memory.

### Core Features

- **Two-layer sandboxed architecture** — A Claude-powered Local Intent Agent decomposes goals into structured capability plans without ever touching OAuth tokens. A Governed Execution Bridge then validates each plan against a configurable risk policy and executes using Token Vault tokens.

- **Auth0 Token Vault integration (all 4 patterns):**
  1. *Delegated OAuth* — Vault stores and manages tokens for Gmail, Calendar, GitHub, Jira, Notion, and Slack
  2. *Silent token refresh* — Vault rotates near-expiry tokens automatically, with no user interruption
  3. *Async authorization* — If a workflow hits an unlinked provider, the job suspends, generates a Token Vault auth URL, and auto-resumes after consent
  4. *Step-up authentication* — HIGH-risk actions (send, delete, publish) require explicit user re-consent via Auth0 MFA before proceeding

- **Risk Posture Engine** — Configurable LOW / MEDIUM / HIGH posture controls which action categories are allowed. Step-up is always required for HIGH-risk actions regardless of posture.

- **Full audit trail** — Every Token Vault access and every provider API call emits structured JSON audit events BEFORE and AFTER execution.

- **6 provider integrations** — Gmail, Google Calendar, GitHub, Jira, Notion, and Slack — all with mock mode for judge-friendly demo without real credentials.

- **Premium demo UI** — Single-page app with live capability planner, real-time job status polling, step-up consent modal, async-auth banner, and live audit log stream.

### Technical Stack

TypeScript (strict) · Express 4 · Auth0 Token Vault · Anthropic Claude claude-sonnet-4-20250514 · Zod · Pino · Vanilla HTML/CSS/JS frontend

---

## Blog Post

### The Hardest Unsolved Problem for Local AI Agents: Token Management

If you've spent any time thinking seriously about autonomous AI agents — the kind that can actually do things for you across Gmail, Jira, GitHub, and Slack — you've likely hit a wall that rarely gets discussed openly: **who holds the tokens?**

An AI agent needs OAuth access tokens to call provider APIs. But giving an agent a long-lived refresh token is essentially handing it a master key. If the agent is compromised, misconfigured, or simply misbehaves, that refresh token can be used to exfiltrate data, send emails on your behalf, or modify your code repositories. Silently. Indefinitely.

The naive approach — embedding credentials in environment variables or config files — works for prototypes. It fails catastrophically in production. The more sophisticated approach — having the agent manage its own OAuth lifecycle — just moves the problem inside the agent. You have an autonomous system that can refresh its own credentials. That's not a security model. That's a time bomb.

**Auth0 Token Vault solves this at the architecture level.** And building Bridgekeeper showed me exactly why that matters.

#### What Token Vault Actually Solves

Token Vault is not just credential storage. It's a governance layer. When you integrate with Token Vault, four things change fundamentally:

First, **the agent never sees a refresh token**. Access tokens are fetched per-request from Vault and returned to the caller. The refresh token stays inside Vault's encrypted storage. Even if the agent is fully compromised, there's nothing to steal that persists beyond the current request.

Second, **silent token refresh is automatic**. When I implemented `vault/delegated.ts`, I was initially planning to build a refresh scheduler. Then I realized: with Token Vault, you just re-fetch. Vault internally checks the expiry, uses the stored refresh token if needed, and returns a fresh access token. The agent code stays clean. The user's workflow never interrupts.

Third, **async authorization unlocks mid-flow provider connections**. This was the integration that genuinely surprised me. The pattern is elegant: the executor hits a provider with no token in Vault, suspends the job, generates a proper Auth0 authorization URL, and waits. When the user completes OAuth in a popup, Vault stores the new token and signals the job to resume. The gap between "I need access" and "I have access" is handled entirely by the authorization system — the agent code has zero special logic for this case.

Fourth, **step-up authentication enforces intent on high-risk actions**. You can configure posture all you like, but at a certain risk threshold — send email, delete, publish — the system requires the user to physically re-consent. This is the kind of defense-in-depth that enterprise security teams ask for but rarely get in agent systems.

#### The Two-Layer Architecture in Production

Bridgekeeper's architecture directly maps to production concerns I've seen in real enterprise automation:

The **Local Intent Agent** corresponds to the untrusted planner role — it understands natural language, decomposes goals, and produces structured intent. You want this running with minimal privilege. In Bridgekeeper, the agent literally cannot call a provider API. It talks to a single HTTP endpoint.

The **Governed Execution Bridge** is the policy enforcement point. Every capability plan passes through a risk evaluation before a token is ever requested from Vault. This is where compliance rules live. This is where audit events are emitted. This is where you put the logic you'd want a security auditor to review.

The result is a system where the "smart" part (the AI) is structurally isolated from the "powerful" part (the token-authenticated API calls). You can upgrade the AI model without changing the security surface. You can tighten the risk policy without touching the agent.

#### What Surprised Me

The `async-auth` suspend-resume pattern was the moment this clicked. I expected to build a complex state machine. Instead, the pattern is just: generate a URL, store the `requestId`, wait for the OAuth callback, resume. Token Vault handles the credential side completely. The job store handles the workflow side completely. They're loosely coupled through a simple `requestId`.

This is the kind of design that scales. It works whether the job is suspended for 30 seconds or 30 minutes. It works whether you run one job or ten thousand. And it gives users a coherent mental model: "The agent needs access to Notion. Click here to authorize it. Done."

#### Call to Action

If you're building AI agents that interact with external services, I strongly encourage you to read through the Token Vault documentation and think carefully about your token lifecycle. The question isn't "does my prototype work?" — it's "what happens when the agent misbehaves, gets hacked, or makes a mistake with a long-lived credential?"

Auth0 Token Vault gives you a concrete, production-grade answer to that question. And as Bridgekeeper demonstrates, you can build on top of it with clean, readable, auditable code.

The agent planned. Auth0 authorized. Bridgekeeper executed.

**Clone and run: [github.com/mew228/silver-adventure](https://github.com/mew228/silver-adventure)**

---

## Submission Checklist

- [x] Text description included (150+ words above)
- [x] Blog post included (`## Blog Post` header visible, 300+ words)
- [x] Live URL: https://bridgekeeper.vercel.app
- [x] GitHub repo URL: https://github.com/mew228/silver-adventure
- [ ] Demo video URL: [PASTE AFTER UPLOAD]
- [x] Token Vault used: `src/vault/` (4 files — client.ts, delegated.ts, async-auth.ts, stepup.ts)
- [x] MOCK_PROVIDERS=true confirmed working
- [x] `npm install && npm start` works on macOS, Linux, Windows
- [x] All 4 Token Vault integration patterns implemented and documented

