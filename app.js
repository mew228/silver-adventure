import { animate, spring, inView, stagger } from "https://cdn.jsdelivr.net/npm/motion@11.11.13/+esm";

const integrationCatalog = {
  gmail: {
    capability: "gmail.read_recent_threads",
    scope: "gmail.readonly",
    effect: "Read prioritized email threads for summarization."
  },
  jira: {
    capability: "jira.create_issue",
    scope: "write:jira-work",
    effect: "Draft or create follow-up engineering tasks."
  },
  notion: {
    capability: "notion.create_page",
    scope: "insert:content",
    effect: "Publish summaries or status reports to a workspace."
  },
  slack: {
    capability: "slack.post_message",
    scope: "chat:write",
    effect: "Send notifications or approval updates to a channel."
  },
  github: {
    capability: "github.create_issue",
    scope: "repo",
    effect: "Open issues or sync planning artifacts with code work."
  },
  calendar: {
    capability: "calendar.schedule_event",
    scope: "calendar.events",
    effect: "Schedule follow-up meetings or reminders."
  }
};

const useCaseInput = document.querySelector("#use-case");
const form = document.querySelector("#capability-form");
const planOutput = document.querySelector("#plan-output");
const narrationOutput = document.querySelector("#narration-output");
const copyButtons = document.querySelectorAll("[data-copy-target]");

// GLOBAL AUDIT LOGGER
function logAudit(source, message, type = '') {
  const terminal = document.getElementById("audit-lines");
  if (!terminal) return;
  const line = document.createElement("div");
  line.className = `log-line ${type}`;
  const timestamp = new Date().toISOString().split("T")[1].slice(0, 12) + "Z";
  line.innerHTML = `<span class="timestamp">[${timestamp}]</span><span class="source log-source-${source.toLowerCase()}">[${source}]</span> ${message}`;
  terminal.appendChild(line);
  terminal.scrollTop = terminal.scrollHeight;
}
logAudit('System', 'Bridgekeeper Execution Engine Initialized.', 'system');
logAudit('Auth0', 'Token Vault secure connection active.', 'auth0');

// FEATURE 1: Dynamic NLP Use-Case Parsing
useCaseInput.addEventListener("input", (e) => {
  const text = e.target.value.toLowerCase();
  
  const intents = {
    gmail: ["email", "gmail", "message", "inbox", "thread"],
    jira: ["jira", "ticket", "issue", "bug", "epic"],
    notion: ["notion", "doc", "page", "wiki", "workspace", "status"],
    slack: ["slack", "notify", "ping", "channel"],
    github: ["github", "pr", "repo", "commit", "pull request"],
    calendar: ["calendar", "meeting", "schedule", "book", "invite"]
  };

  const mutatingWords = ["create", "make", "draft", "book", "schedule", "post", "send", "publish", "update"];
  
  document.querySelectorAll('input[name="integration"]').forEach(cb => {
    const isMatch = intents[cb.value].some(keyword => text.includes(keyword));
    if (isMatch && !cb.checked) {
      cb.checked = true;
      animate(cb.parentElement, { scale: [1, 1.05, 1], color: ["var(--muted)", "var(--text)", "var(--muted)"] }, { duration: 0.3 });
    }
  });

  const riskSelect = document.querySelector("#risk-level");
  const isMutating = mutatingWords.some(word => text.includes(word));
  
  if (isMutating && riskSelect.value !== "high") {
    riskSelect.value = "high";
    logAudit('NLP', 'Detected mutating intent: Risk escalated to HIGH', 'warn');
    animate(riskSelect, { borderColor: ["var(--border)", "var(--accent)", "var(--border)"] }, { duration: 0.5 });
  } else if (!isMutating && riskSelect.value !== "low" && text.length > 5 && !riskSelect.dataset.manualOverride) {
    riskSelect.value = "low";
    logAudit('NLP', 'Detected read-only intent: Risk lowered to LOW', 'system');
  }
});

document.querySelector("#risk-level").addEventListener("change", (e) => {
  e.target.dataset.manualOverride = "true";
});

function approvalPolicy(riskLevel, integrations) {
  if (riskLevel === "high") {
    return "Require step-up authentication for every mutating action and explicit approval for external writes.";
  }

  if (riskLevel === "medium") {
    return integrations.length > 1
      ? "Require approval for create/update actions; allow read-only calls after existing consent."
      : "Require approval only for mutating calls; reads may proceed with existing consent.";
  }

  return "Allow read-heavy workflows automatically after consent; prompt only for destructive or external-send actions.";
}

async function buildOutputs() {
  const selectedIntegrations = Array.from(
    form.querySelectorAll('input[name="integration"]:checked')
  ).map((input) => input.value);

  const useCase = document.querySelector("#use-case").value.trim();
  const riskLevel = document.querySelector("#risk-level").value;
  const userId = document.querySelector("#user-id").value.trim() || "demo-user-01";

  const capabilities = selectedIntegrations.map((integration) => ({
    target_service: integration,
    capability_name: integrationCatalog[integration].capability,
    requested_scope: integrationCatalog[integration].scope,
    justification: integrationCatalog[integration].effect,
    requires_approval: riskLevel !== "low" && integration !== "gmail"
  }));

  const plan = {
    user_id: userId,
    agent_id: "bridgekeeper-local-agent",
    execution_model: "restricted_local_agent_via_governed_bridge",
    identity_layer: "auth0_token_vault",
    risk_level: riskLevel,
    objective: useCase,
    approval_policy: approvalPolicy(riskLevel, selectedIntegrations),
    auth0_features: {
      delegated_authorization: true,
      async_authorization_supported: true,
      step_up_authentication: riskLevel === "high"
    },
    capabilities
  };

  const narration = [
    `Start with the user goal: ${useCase}`,
    "Show the local restricted agent planning the work without holding raw third-party credentials or refresh tokens.",
    `Bridgekeeper requests ${capabilities.length} delegated capabilities through Auth0 Token Vault instead of giving the model direct OAuth access.`,
    `Selected services: ${selectedIntegrations.join(", ") || "none selected"}.`,
    `Risk posture: ${riskLevel}. ${plan.approval_policy}`,
    "Call out that Token Vault handles consent delegation, token lifecycle, and async authorization outside the local runtime.",
    "Then demonstrate the bridge returning minimized results and a visible audit trail."
  ].join("\n\n");

  planOutput.textContent = JSON.stringify(plan, null, 2);
  narrationOutput.textContent = narration;

  // FEATURE 2: Autonomous Sub-Agent Spawning Animations
  let spawner = document.getElementById("sub-agent-spawner");
  if (!spawner) {
    spawner = document.createElement("div");
    spawner.id = "sub-agent-spawner";
    spawner.style.cssText = "display: flex; gap: 0.8rem; flex-wrap: wrap; margin-bottom: 2rem; padding-top: 1rem;";
    document.querySelector(".outputs").prepend(spawner);
  }
  spawner.innerHTML = "";
  
  plan.capabilities.forEach((cap, index) => {
    const serviceName = cap.split('.')[0];
    const pill = document.createElement("div");
    pill.className = "flow-step";
    pill.style.background = "rgba(41, 151, 255, 0.1)";
    pill.style.borderColor = "rgba(41, 151, 255, 0.3)";
    pill.style.color = "var(--text)";
    pill.style.padding = "0.5rem 1rem";
    pill.innerHTML = `<span style="font-size:0.65rem; font-weight:700; color:var(--accent); text-transform:uppercase; letter-spacing:0.05em; opacity:0.8;">⟳ SPAWNING</span><br/>${serviceName}-worker`;
    spawner.appendChild(pill);
    
    animate(pill, 
      { opacity: [0, 1], scale: [0.8, 1], x: [-15, 0] }, 
      { duration: 0.5, delay: index * 0.15, easing: "spring" }
    );
  });

  // Re-trigger output animation
  animate(".output-card", { opacity: [0, 1], scale: [0.98, 1] }, { duration: 0.5, easing: "ease-out" });

  try {
    const res = await fetch('/api/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan })
    });
    
    // Attempt to parse JSON; if the backend crashes or isn't restarted, it will drop to catch block
    const data = await res.json();
    
    if (res.status === 403 && data.error === 'consent_required') {
      addPendingAction(plan, data.authorization_url);
    } else if (!res.ok) {
      console.warn("Backend execution warning:", data);
    }
  } catch (e) {
    console.warn("Execution bridge not reachable or returned HTML. Did you restart the server? Error:", e.message);
  }
}

// FEATURE 3: Human-in-the-Loop Async Dashboard
function addPendingAction(plan, url) {
  logAudit('Auth0', 'Risk Posture HIGH -> Requesting Async Step-Up Authentication', 'warn');
  const dashboard = document.getElementById("async-dashboard");
  const list = document.getElementById("pending-actions-list");
  dashboard.style.display = "block";
  
  const card = document.createElement("article");
  card.className = "card output-card";
  card.style.border = "1px solid rgba(255, 107, 107, 0.3)";
  card.style.boxShadow = "0 8px 32px rgba(255, 107, 107, 0.1)";
  
  card.innerHTML = `
    <div class="output-header" style="background: rgba(255, 107, 107, 0.1); border-bottom: 1px solid rgba(255,107,107,0.2);">
      <h4 style="color: #ff6b6b; display:flex; gap:0.5rem; align-items:center;">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
        Action Pending Approval
      </h4>
    </div>
    <div style="padding: 1.5rem;">
      <p style="margin-bottom: 1rem; font-size: 1.05rem;"><strong>Objective:</strong> ${plan.objective}</p>
      <p style="margin-bottom: 1.5rem; color: var(--muted); font-size: 0.95rem; line-height: 1.5;">
        The agent has securely spawned <strong>${plan.capabilities.length} sub-agents</strong> to handle capabilities safely.
        Because this was flagged as High Risk, it requires human step-up authentication to mint the final Token Vault keys.
      </p>
      <div style="display: flex; gap: 1rem;">
        <button class="button primary approve-btn" style="flex: 1; justify-content:center; background:#ff6b6b; color:#111;">Approve via Auth0</button>
        <button class="button secondary deny-btn" style="flex: 1; justify-content:center;">Deny</button>
      </div>
    </div>
  `;
  
  card.querySelector('.approve-btn').addEventListener('click', () => {
    logAudit('System', 'Human consent delegated. Redirecting to Auth0 Step-up...', 'auth0');
    card.remove();
    if (list.children.length === 0) dashboard.style.display = "none";
    showStepUpChallenge(url);
  });
  
  card.querySelector('.deny-btn').addEventListener('click', () => {
    logAudit('System', 'Consent denied. Bridgekeeper terminated execution.', 'error');
    card.style.transition = 'all 0.3s';
    card.style.opacity = '0.5';
    card.style.transform = 'scale(0.98)';
    card.innerHTML = `<div style="padding: 3rem; text-align:center; font-weight:600; color: var(--muted);">Action Denied & Terminated.</div>`;
    setTimeout(() => {
      animate(card, { height: 0, opacity: 0, margin: 0 }, { duration: 0.4 }).finished.then(() => {
        card.remove();
        if (list.children.length === 0) dashboard.style.display = "none";
      });
    }, 1500);
  });

  list.prepend(card);
  animate(card, { opacity: [0, 1], y: [20, 0] }, { duration: 0.4, easing: "ease-out" });
  
  setTimeout(() => {
    dashboard.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, 100);
}

function showStepUpChallenge(url) {
  let modal = document.getElementById("stepup-modal");
  if (!modal) {
    const overlay = document.createElement("div");
    overlay.id = "stepup-modal";
    overlay.innerHTML = `
      <div class="modal-content card blur glass">
        <h3 style="margin-top:0; color:#fff;">Step-Up Authentication Required</h3>
        <p style="color:var(--muted); font-size:0.95rem; line-height:1.5;">The execution bridge detected a high-risk capability that requires explicit user consent via Auth0 Token Vault.</p>
        <div style="margin:1.5rem 0;" class="code-font" style="font-size:0.8rem; background:rgba(0,0,0,0.5); padding:1rem; border-radius:8px; overflow-wrap:break-word;">
          ${url}
        </div>
        <div style="display:flex; justify-content:flex-end; gap:1rem;">
          <button class="button secondary" onclick="document.getElementById('stepup-modal').style.display='none'">Cancel</button>
          <a class="button primary" href="${url}" target="_blank" onclick="document.getElementById('stepup-modal').style.display='none'">Grant Consent</a>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    
    const style = document.createElement("style");
    style.textContent = `
      #stepup-modal { position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.6); backdrop-filter:blur(10px); display:flex; z-index:9999; align-items:center; justify-content:center; }
      #stepup-modal .modal-content { max-width:460px; padding:2rem; width:calc(100% - 2rem); outline:1px solid rgba(255,255,255,0.1); border-radius:1rem; }
    `;
    document.head.appendChild(style);
  } else {
    modal.querySelector('.code-font').textContent = url;
    modal.querySelector('.primary').href = url;
    modal.style.display = "flex";
  }
}

copyButtons.forEach((button) => {
  button.addEventListener("click", async () => {
    const target = document.getElementById(button.dataset.copyTarget);

    try {
      await navigator.clipboard.writeText(target.textContent);
      const previous = button.textContent;
      button.textContent = "Copied";
      window.setTimeout(() => {
        button.textContent = previous;
      }, 1200);
    } catch (error) {
      button.textContent = "Copy failed";
      window.setTimeout(() => {
        button.textContent = "Copy";
      }, 1200);
    }
  });
});

let currentUser = null;

async function checkAuth() {
  try {
    const response = await fetch('/api/user');
    const data = await response.json();
    
    const authSection = document.getElementById("auth-section");
    const userIdInput = document.querySelector("#user-id");
    
    if (data.authenticated) {
      currentUser = data.user;
      authSection.innerHTML = `
        <span class="user-greeting">Hi, ${currentUser.name}</span>
        <a class="button secondary" href="/logout">Log out</a>
      `;
      // Update the user ID field with real email
      if (currentUser.email) {
        userIdInput.value = currentUser.email;
      } else {
        userIdInput.value = currentUser.sub;
      }
    } else {
      currentUser = null;
      authSection.innerHTML = `
        <a class="button secondary" href="/login">Log in</a>
      `;
      userIdInput.value = "demo-user-01";
    }
  } catch (err) {
    console.error("Failed to check auth state", err);
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  
  logAudit('Bridge', 'Intercepting execution request...', 'bridge');
  
  const btn = document.getElementById("generate-btn");
  const btnText = btn.querySelector(".btn-text");
  const btnLoader = btn.querySelector(".btn-loader");
  
  // Disable button
  btn.classList.add("loading");
  btn.disabled = true;
  
  // Animate button state
  btnText.style.display = "none";
  btnLoader.style.display = "inline";
  btnLoader.classList.remove("motion-hide");
  animate(btnLoader, { opacity: [0, 1] }, { duration: 0.3 });
  
  // Fade out old outputs
  animate(".output-card", { opacity: 0.4 }, { duration: 0.3 });
  
  // Simulate Agent Processing Delay
  await new Promise(resolve => setTimeout(resolve, 1200));
  
  buildOutputs();
  
  // Restore button
  btn.classList.remove("loading");
  btn.disabled = false;
  btnLoader.style.display = "none";
  btnLoader.classList.add("motion-hide");
  btnText.style.display = "inline";
});

checkAuth().then(() => {
  buildOutputs();
});

// Framer-style Motion Animations
animate("#hero-content", { y: [40, 0], opacity: [0, 1] }, { duration: 0.9, easing: [0.16, 1, 0.3, 1] });

// Animate the aside panel
animate(".hero-panel", { y: [30, 0], opacity: [0, 1] }, { duration: 1, delay: 0.2, easing: [0.16, 1, 0.3, 1] });

inView(".architecture-grid", () => {
  animate(".architecture-grid .card", 
    { y: [40, 0], opacity: [0, 1] }, 
    { delay: stagger(0.12), duration: 0.8, easing: spring({ stiffness: 80, damping: 15 }) }
  );
});

inView(".flow-shell", () => {
  animate(".flow-shell > *", 
    { scale: [0.8, 1], opacity: [0, 1] }, 
    { delay: stagger(0.1), duration: 0.7, easing: spring({ stiffness: 120, damping: 15 }) }
  );
});

inView(".value-grid", () => {
  animate(".value-grid .card", 
    { y: [30, 0], opacity: [0, 1] }, 
    { delay: stagger(0.1), duration: 0.8, easing: [0.16, 1, 0.3, 1] }
  );
});

inView(".planner-layout", () => {
  animate(".planner", { x: [-30, 0], opacity: [0, 1] }, { duration: 0.8, easing: [0.16, 1, 0.3, 1] });
  animate(".output-card", 
    { x: [30, 0], opacity: [0, 1] }, 
    { delay: stagger(0.15), duration: 0.8, easing: [0.16, 1, 0.3, 1] }
  );
});
