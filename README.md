# Bridgekeeper

Bridgekeeper is an Authorized to Act hackathon prototype that shows how a restricted local AI agent can work across real user apps without ever becoming a raw token container.

The core idea is simple:

- keep the local OpenClaw-style agent in restricted mode,
- route external actions through an intermediary execution bridge,
- let Auth0 for AI Agents Token Vault handle OAuth, token lifecycle, delegated consent, async auth, and step-up authentication.

Bridgekeeper is built for the moment we are in right now: users want sovereign AI that runs locally, in browsers, or on edge devices, but they still want those agents to interact with Gmail, Notion, Jira, Slack, GitHub, and calendars without exposing long-lived credentials to the local runtime.

## What Bridgekeeper Does

Bridgekeeper splits agent work into two layers:

### 1. Local intent agent

The local agent interprets user goals, decomposes tasks, and asks for narrowly scoped capabilities. It does not store refresh tokens or implement provider-specific OAuth logic.

### 2. Governed execution bridge

The bridge receives the plan, checks policy, requests approvals when needed, uses delegated access through Token Vault, and returns only the minimum structured result the local agent needs.

## Why Token Vault Matters

Auth0 for AI Agents Token Vault is not just an add-on here. It is the security and identity foundation of the entire project.

Bridgekeeper uses Token Vault to:

- avoid storing third-party refresh tokens in the local runtime,
- support delegated authorization and consent flows,
- handle token refresh and provider complexity outside the model boundary,
- support asynchronous authorization when a workflow cannot complete immediately,
- require step-up authentication for higher-risk actions.

That makes the project a much better fit for real-world local agents than a design where the model itself directly owns broad API credentials.

## Current Prototype Features

The runnable prototype includes:

- a single-page landing experience that explains the system and the security boundary,
- an interactive Capability Planner for Gmail, Jira, Notion, Slack, GitHub, and Calendar,
- generated capability JSON for a selected workflow,
- generated narration for a three-minute demo video,
- a sample audit event payload,
- supporting architecture and demo documentation for submission prep.

## Why This Is A Strong Hackathon Submission

This repository is not just a concept note. A reviewer can:

- run the project immediately,
- understand exactly where Token Vault fits in the architecture,
- interact with a capability-based workflow,
- see how approvals and risk posture affect execution,
- reuse the included demo and submission materials.

## Repo Contents

- `index.html` - landing page and interactive prototype UI
- `styles.css` - responsive visual design for the prototype
- `app.js` - client-side capability planner and demo content generator
- `server.js` - dependency-free local static server
- `package.json` - runnable scripts
- `docs/architecture.md` - system design and security model
- `docs/demo-script.md` - three-minute demo outline
- `docs/submission-kit.md` - ready-to-adapt submission text, checklist, and bonus blog post draft

## Run Locally

### Option 1: Node.js

```bash
npm start
```

Then open `http://localhost:3000`.

### Option 2: Static hosting

Because the frontend is plain HTML, CSS, and JavaScript, you can publish it on:

- GitHub Pages
- Netlify
- Vercel
- Cloudflare Pages

The included `server.js` is only for local testing.

## Demo Walkthrough

1. Open the app.
2. Scroll to the Capability Planner.
3. Enter a realistic task such as summarizing Gmail, updating Notion, and creating Jira follow-ups.
4. Select integrations and a risk posture.
5. Generate the workflow.
6. Use the generated plan, narration, and audit event in the demo video or submission text.

## Example Capability Flow

A user asks:

> "Summarize urgent Gmail threads, create Jira follow-ups, and publish a Notion status update."

Bridgekeeper handles that as:

1. the local agent decomposes the task,
2. the gateway requests delegated capabilities,
3. Auth0 Token Vault handles consent, token storage, and token refresh,
4. Bridgekeeper executes scoped calls with policy checks,
5. the local agent receives minimized outputs instead of raw upstream data.

## Submission Assets

Use these docs when preparing the final hackathon package:

- [docs/architecture.md](docs/architecture.md)
- [docs/demo-script.md](docs/demo-script.md)
- [docs/submission-kit.md](docs/submission-kit.md)

## Next Steps

If you want to evolve Bridgekeeper beyond the current prototype, the highest-value additions are:

- a real Bridgekeeper API backend,
- direct Auth0 for AI Agents integration code,
- provider connectors for Gmail, Jira, Notion, Slack, GitHub, and Calendar,
- approval and audit review screens,
- a published deployment for the judging link.
