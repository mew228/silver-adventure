# Demo Script

## Goal

Record a video of about three minutes that makes one thing unmistakable: Bridgekeeper is useful because Auth0 for AI Agents Token Vault lets a restricted local agent reach external apps without directly holding raw third-party credentials.

## Suggested Timeline

### 0:00-0:20 - Problem statement

Open with the real tension behind local agents:

"Users want sovereign AI that runs locally, but they still want it to act across Gmail, Notion, Jira, Slack, GitHub, and calendars. The problem is that local agents should not become token vaults. Bridgekeeper solves that with a governed execution bridge powered by Auth0 for AI Agents Token Vault."

### 0:20-0:45 - Show the local agent in restricted mode

- Show OpenClaw or another local runtime.
- Point out that it can plan and reason, but does not hold refresh tokens.
- State clearly that OAuth flows and token lifecycle do not happen inside the local model boundary.

### 0:45-1:10 - Show the task request

Use a realistic prompt such as:

"Summarize urgent Gmail threads, create Jira follow-ups, and publish a Notion status update."

Then show the Capability Planner in Bridgekeeper and select the matching services plus an appropriate risk posture.

### 1:10-1:40 - Show Auth0 Token Vault in the loop

- Explain that Bridgekeeper requests delegated capabilities instead of raw provider access.
- Call out that Token Vault handles consent, token storage, token refresh, and async authorization.
- If using a higher-risk path, mention that step-up authentication can be triggered before mutating actions.

### 1:40-2:20 - Show execution and scoped outputs

- Show the generated capability plan.
- Show that the selected integrations are limited and explicit.
- Show the demo narration or resulting workflow summary.
- Emphasize that the local agent only receives the minimum result set it needs.

### 2:20-2:45 - Show safety and governance

- Display the sample audit event.
- Explain how approvals, risk posture, and auditability keep the user in control.
- Tie that back to why this architecture is safer than putting broad OAuth credentials into the model runtime.

### 2:45-3:00 - Close

Close on the project vision:

"Bridgekeeper pushes local AI further by separating intent from privileged execution. Auth0 Token Vault makes that boundary practical, so users get real-world usefulness without giving up control."

## Recording Tips

- Keep the story centered on the security boundary, not just the UI.
- Make sure the video shows the project functioning on the target device.
- Avoid background music or assets you do not have permission to use.
- Keep the pace tight so judges get the full system story before the three-minute mark.
