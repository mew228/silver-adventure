# Bridgekeeper Submission Kit

This document is designed to help package Bridgekeeper for the Authorized to Act Hackathon submission form.

## Short Project Description

Bridgekeeper is a hackathon prototype that lets a restricted local AI agent act across external apps without directly holding raw third-party credentials. Instead of embedding OAuth tokens inside a local OpenClaw-style runtime, Bridgekeeper splits the system into a local intent agent and a governed execution bridge. The local agent plans work in restricted mode and requests capabilities such as reading Gmail, creating Jira issues, or publishing a Notion update. The bridge then enforces policy, requests approval when needed, and uses Auth0 for AI Agents Token Vault to handle delegated authorization, token storage, token refresh, and step-up authentication.

The current prototype includes a runnable web app with an interactive Capability Planner, generated capability JSON, demo-ready narration, and a sample audit event payload. It is designed to demonstrate a safer model for sovereign AI: keep the planning agent local, keep the token boundary outside the model, and preserve user control through scoped access and visible auditability. Bridgekeeper aims to show how local agents can become more useful in real digital environments without becoming high-risk token containers.

## Feature And Functionality Bullets

- Keeps a local AI agent in restricted mode while still enabling useful actions across outside services.
- Uses capability-based access requests instead of broad, long-lived provider credentials.
- Positions Auth0 Token Vault as the delegated identity and token layer.
- Models approval-aware workflows for low, medium, and high risk postures.
- Generates a capability plan, demo narration, and audit payload for hackathon presentation.
- Explains how async auth and step-up auth fit into multi-app agent execution.

## Demo Video Checklist

- Show the project running on the target device.
- Show the local agent staying outside the raw token boundary.
- Show Bridgekeeper requesting scoped capabilities.
- Call out Auth0 Token Vault as the system handling OAuth, token lifecycle, and consent delegation.
- Show a risk posture that requires approval or step-up authentication.
- End with the audit event and the user-value outcome.

## Published Link Notes

If you publish the prototype as a static site, the easiest options are GitHub Pages, Netlify, Vercel, or Cloudflare Pages.

If your final submission is a dev tool, browser extension, or an internal demo environment, explain in the submission form why a standard published application link is not available and point judges to the runnable repo plus video demonstration.

## Bonus Blog Post Draft

## Bonus Blog Post: Why Token Vault Is The Missing Piece For Local Agents

Local AI agents are getting good enough to be genuinely useful, but there is still a huge gap between what users want them to do and what we should trust them to hold. People increasingly want sovereign AI that runs on their own machines, in their browsers, or in other restricted environments. At the same time, the most valuable agent workflows usually depend on access to Gmail, Notion, Jira, Slack, GitHub, calendars, and other third-party services. That creates a problem: the closer an agent gets to a user's real digital life, the more dangerous it becomes to let that agent directly hold raw tokens with broad scope.

Bridgekeeper is built around the idea that we should separate planning from privileged execution. The local agent remains useful, personal, and restricted. It can understand intent, break work into tasks, and request capabilities. But it does not become the place where refresh tokens live. Instead, Bridgekeeper adds an intermediary action layer that uses Auth0 for AI Agents Token Vault as the identity and token boundary. That means OAuth flows, token refresh, delegated access, async authorization, and step-up authentication are handled in the right place instead of being pushed into the model runtime.

This changes the shape of the agent system. Rather than saying, "the agent has Gmail access," we can say, "the agent requested a specific approved capability, and the bridge executed it under policy." That is a much healthier abstraction for user trust. It also makes auditing clearer, because every external action can be tied to a capability request, a user, a service, a scope, and an approval state.

What excites me most is that this approach does not weaken local AI. It strengthens it. A restricted local model becomes more deployable when it can safely reach the outside world through a governed bridge. Token Vault makes that bridge credible. It gives developers a way to build agents that are both more useful and more respectful of user control. That is the direction I want AI systems to go: not just more autonomous, but more accountable.

## Submission Checklist

- Include a concise project description using the text above as a base.
- Include the public repository URL.
- Include a published application link if available.
- Include a public video link that stays close to three minutes.
- Make sure the video shows the project functioning.
- Avoid copyrighted music and unlicensed trademarks.
- If submitting for the bonus prize, keep the blog section materially different from the short description.
