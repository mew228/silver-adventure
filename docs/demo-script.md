# Bridgekeeper — 3-Minute Demo Script

**Total runtime: 3:00 | Format: Screen recording with narration**

---

## [0:00–0:20] Hook

*[Show the Bridgekeeper homepage — dark UI, hero section]*

> "AI agents are powerful. They can read your emails, create tickets, post to Slack — all from a single sentence. But right now, they're either locked in a sandbox with no real capabilities, or they're holding your OAuth tokens. An agent with your Gmail refresh token is a security incident waiting to happen. **Bridgekeeper fixes that.**"

*[Click 'Try Live Demo' button — page scrolls to the planner]*

---

## [0:20–0:50] Architecture Walkthrough

*[Open docs/architecture.md in a split pane, or show the How It Works section]*

> "Bridgekeeper runs in two layers. **Layer 1** is a sandboxed AI agent — it takes your natural-language goal and produces a structured capability plan. It never touches a token. **Layer 2** is the Governed Execution Bridge — it validates the plan against a risk policy, then requests short-lived, scoped tokens from **Auth0 Token Vault** before calling any provider API. The agent plans. Auth0 authorizes. Bridgekeeper executes."

*[Point to the ASCII architecture diagram in the README or the How It Works section]*

> "Vault is the trust boundary between intent and execution. No token ever lives outside Vault."

---

## [0:50–1:30] Live Demo — Plan & Execute

*[Focus on the Capability Planner section]*

> "Let me show you this live. I'll type a real goal."

*[Type in the goal input:]*
```
Check my unread emails, summarize any action items, create GitHub issues for each, and post a summary to the #engineering Slack channel.
```

*[Select Gmail, GitHub, Slack pills — they highlight with green connected indicators]*

> "I'll select Gmail, GitHub, and Slack — all three are pre-connected in Token Vault."

*[Click MEDIUM posture button]*

> "Risk posture: MEDIUM. This allows read and write but will flag the Slack send."

*[Click 'Plan & Execute']*

> "Watch the capability plan appear as structured JSON..."

*[Plan JSON fades in with syntax highlighting — show capabilities array]*

> "The agent decomposed my goal into four typed capabilities: read_emails, list_repos, create_issue, and send_message. Each one has a risk level. The bridge is now fetching tokens from Vault and executing each one."

*[Job status bar animates to 'RUNNING', then shows step-up suspension]*

---

## [1:30–2:00] Step-Up Consent

*[Step-up modal appears on screen]*

> "See that? The bridge hit the Slack send_message action — risk level HIGH. **Auth0 Token Vault policy requires explicit re-consent before executing a send action**, no matter what posture you set. The step-up modal is showing me exactly what's about to happen."

*[Read the modal text aloud: "Action: send_message on slack | Risk: HIGH"]*

> "I'm approving this. In production, this would trigger an Auth0 MFA re-authentication flow."

*[Click Approve & Execute]*

*[Audit log updates — show provider.call.after event for slack:send_message with outcome: success]*

> "And there it is in the audit log — before and after events confirming the execution. Every vault token retrieval, every provider call — immutably logged."

---

## [2:00–2:30] Async Authorization Flow

*[Clear the goal input, type a new goal:]*
```
Create a summary page in Notion for today's engineering standup
```

*[Select Notion pill — note it shows as not-connected]*

> "Now let me add Notion to the mix. Notion isn't connected yet — I've never authorized it."

*[Click Plan & Execute]*

*[Async-auth banner appears in the UI]*

> "The bridge detected that Notion has no token in Vault. Instead of failing, it **suspended the job** and generated an Auth0 Token Vault authorization URL. In a real app, the user clicks this and completes OAuth. For the demo, I'll simulate completion."

*[Click 'Simulate Auth Completion']*

*[Job status changes from suspended_async_auth back to running, then completed]*
*[Connections section updates — Notion now shows as connected]*

> "Token Vault stored the new refresh token. The job automatically resumed and created the Notion page. **The agent never saw the token — Vault handled everything.**"

---

## [2:30–3:00] Audit Log & Close

*[Scroll to Audit Log section — show last 10 events]*

> "Everything is in the audit log. vault.token.retrieved — delegated.ts fetched a scoped Gmail token. provider.call.before — bridge about to call GitHub. vault.stepup.approved — user consented to the Slack send. vault.async_auth.completed — Notion was connected mid-flow. provider.call.after — every action confirmed with timing."

*[Zoom into a vault.token.retrieved event]*

> "These are structured JSON events — perfect for SIEM integration, compliance audits, or anomaly detection."

*[Return to hero section]*

> "Bridgekeeper proves you can build powerful, multi-service AI agents without token sprawl. The agent planned. **Auth0 authorized.** Bridgekeeper executed. Securely, auditably, at scale."

*[Show URL: bridgekeeper.vercel.app and GitHub link]*

> "Full source at the link below. Clone it, `npm install && npm start`, and it runs in mock mode immediately — no credentials required."

---

*[END — 3:00]*

---

## Scene Checklist for Recording

- [ ] Terminal: `npm start` visible, server running on :3000
- [ ] Browser: http://localhost:3000 in full screen
- [ ] Microphone: test levels before recording
- [ ] Mock mode indicator visible (green ● MOCK MODE badge in nav)
- [ ] Audit log section visible in second half of recording
- [ ] Show JSON syntax-highlighted plan output clearly
- [ ] Step-up modal must be clearly visible and legible
- [ ] Async-auth banner must be clearly visible with the auth URL
