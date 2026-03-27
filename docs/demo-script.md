# Bridgekeeper — 3-Minute Demo Script

**Total runtime: 2:50 | Format: Screen recording with voiceover narration**

Record in **dark mode** — it looks dramatically better on camera.

---

## Script

| Timestamp | Screen | Script |
|-----------|--------|--------|
| **0:00** | Face or title card — no UI yet | *"AI agents are finally powerful enough to run your life."* |
| **0:04** | Same | *"But there's one problem: to connect them to your apps, someone has to hold your OAuth tokens. Right now, that someone is usually the model itself."* |
| **0:12** | Same | *"Bridgekeeper fixes that — zero tokens exposed to the agent. Ever."* |
| **0:18** | Hero section — animated flow diagram visible. Point to the top box. | *"Bridgekeeper splits agent work into two layers. The local AI — your OpenClaw-style model — stays in restricted mode. It never touches credentials. It only sends a capability request to the bridge."* |
| **0:28** | Point to the middle box (Token Vault) | *"Auth0 Token Vault sits in the middle. It owns the OAuth flows, stores the refresh tokens, handles consent, and issues scoped access to your real services."* |
| **0:36** | Point to the bottom box (Your Services) | *"The agent gets results, not tokens."* |
| **0:40** | Scroll to the How It Works section — four colored cards visible | *"Token Vault handles four flows for us."* |
| **0:43** | Point to Card 01 (yellow — Delegated OAuth) | *"Delegated OAuth — connect Gmail once, Vault manages the token lifecycle."* |
| **0:48** | Point to Card 02 (lime — Token Refresh) | *"Silent refresh — tokens expire, Vault renews them mid-workflow, zero interruption."* |
| **0:53** | Point to Card 03 (purple — Async Authorization) | *"Async authorization — if a service isn't connected yet, Bridgekeeper suspends the job, sends an auth link, and resumes on consent."* |
| **1:00** | Point to Card 04 (coral — Step-up Auth) | *"And step-up authentication — send an email, delete a record, publish to Notion — any high-risk write requires explicit re-consent before the bridge will execute. The model can't bypass this. Ever."* |
| **1:10** | Scroll to Capability Planner section. Click into the goal textarea. | *"Let's run a real workflow."* |
| **1:13** | Type live: `Summarize urgent Gmail threads, create Jira follow-ups, and post a Notion status update` | *"I'm asking the agent to summarize Gmail, create Jira tickets, and update Notion."* |
| **1:20** | Click Gmail, Jira, Notion tags — they highlight | *"Medium risk posture — that means write actions need approval."* |
| **1:25** | Click MEDIUM posture button, then click PLAN & EXECUTE | *"I'll hit Plan and Execute now."* |
| **1:28** | Plan JSON fades in with syntax highlighting | *(pause 3 seconds while JSON appears)* |
| **1:31** | Point to the JSON output | *"The local agent has decomposed the goal into typed capability requests. Notice it never got a token — it got a plan. Auth0 Token Vault is now being asked for delegated access to each service."* |
| **1:42** | Execution status updates — step-up consent appears | *"Because sending to Notion is a write action under medium risk, Bridgekeeper is pausing and asking me to confirm."* |
| **1:50** | Point to step-up UI | *"This is step-up authentication via Token Vault — the bridge will not execute until I explicitly approve."* |
| **1:57** | Click Approve | *"I'll approve it now."* |
| **2:00** | Execution completes — status shows success | *"Done. The capability executed with a scoped token. The model never saw the token. Auth0 handled everything."* |
| **2:10** | Scroll to Audit Log section — table visible with events | *"Every single action is written to an immutable audit log."* |
| **2:15** | Point to rows in the audit table | *"Token requested. Step-up required. Consent given. Capability executed. You can see exactly what the agent did, what Auth0 authorized, and what hit your real APIs."* |
| **2:28** | Gesture over the full audit table | *"This is what enterprise-grade AI agent authorization looks like."* |
| **2:33** | Scroll back to hero section or show face | *"Bridgekeeper is live at bridgekeeper.vercel.app. Full source on GitHub."* |
| **2:40** | Same | *"Built on Auth0 Token Vault — because the future of AI agents isn't agents that hold your keys."* |
| **2:47** | Same — smile, confident close | *"It's agents that earn their access, action by action."* |
| **2:50** | End card / freeze frame | *(end)* |

---

## Recording Notes

### Recommended Setup
- **Tool:** Loom (free, instant YouTube upload) or OBS Studio
- **Resolution:** 1920×1080, browser in fullscreen (F11)
- **Theme:** Dark mode — toggle it ON before you start recording
- **Microphone:** Test levels. Speak at a steady conversational pace — you have room but not much

### Pre-load Checklist (avoid fumbling)

| Section | What to have ready |
|---------|-------------------|
| **0:00 Hook** | Browser closed or on a title slide. No UI distractions. |
| **0:18 Architecture** | Page loaded at `localhost:3000`, scrolled to top so hero flow card is visible |
| **0:40 How It Works** | Know exactly where the 4 cards are — one smooth scroll down |
| **1:10 Live Demo** | Goal textarea should be empty and cursor-ready. Pre-clear any old output. |
| **1:25 Execute** | Gmail, Jira, Notion tags and MEDIUM posture should be clickable without hesitation |
| **1:42 Step-up** | Wait for the step-up UI naturally — dont click ahead |
| **2:10 Audit Log** | Audit section should have populated from the execution above — just scroll down |
| **2:33 Close** | Scroll back to hero for a clean ending frame |

### Tips
- Practice the full script at least twice before recording — you should be at 2:45–2:50 naturally
- If you stumble, just pause and re-say the line — you can trim in Loom
- The dark mode UI is more visually impressive on camera than light mode
- Auth0 Token Vault is named **6 times** in the script — judges will hear it
- The phrase "zero tokens exposed" lands in the first 12 seconds
