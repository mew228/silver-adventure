/* ════════════════════════════════════════════════════════════════════════════
   Bridgekeeper — public/app.js
   Neo-Brutalist interactive frontend.
   All API calls to the same origin (server.ts on port 3000).
   ════════════════════════════════════════════════════════════════════════════ */

'use strict';

// ── Theme toggle ──────────────────────────────────────────────────────────────
const THEME_KEY = 'bk-theme';

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem(THEME_KEY, theme);
}

function initTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  if (saved) {
    applyTheme(saved);
    return;
  }
  // Default to dark on first visit
  applyTheme('dark');
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  applyTheme(current === 'dark' ? 'light' : 'dark');
}

// Init immediately to stay in sync with the inline script
initTheme();

// ── State ─────────────────────────────────────────────────────────────────────
const state = {
  selectedProviders:          new Set(['gmail', 'github']),
  selectedPosture:            'MEDIUM',
  currentJobId:               null,
  pollTimer:                  null,
  auditPollTimer:             null,
  currentStepUpChallengeId:   null,
  currentAsyncJobId:          null,
  spinnerInterval:            null,
};

// ── ASCII Spinner ─────────────────────────────────────────────────────────────
const SPINNER_FRAMES = ['[ | ]', '[ / ]', '[ - ]', '[ \\ ]'];
let spinFrame = 0;

function startSpinner(el) {
  spinFrame = 0;
  el.textContent = SPINNER_FRAMES[0];
  state.spinnerInterval = setInterval(() => {
    spinFrame = (spinFrame + 1) % SPINNER_FRAMES.length;
    el.textContent = SPINNER_FRAMES[spinFrame];
  }, 150);
}

function stopSpinner() {
  if (state.spinnerInterval) {
    clearInterval(state.spinnerInterval);
    state.spinnerInterval = null;
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// BOOT
// ══════════════════════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  initIntegrationTags();
  initPostureButtons();
  initSmoothScroll();
  initMockBadge();
  startAuditPolling();

  // Theme toggle
  const themeBtn = document.getElementById('theme-toggle');
  if (themeBtn) themeBtn.addEventListener('click', toggleTheme);

  // Follow OS preference changes at runtime (only if no saved pref)
  window.matchMedia('(prefers-color-scheme: dark)')
    .addEventListener('change', e => {
      if (!localStorage.getItem(THEME_KEY)) {
        applyTheme(e.matches ? 'dark' : 'light');
      }
    });

  // Mark default selected tags
  document.querySelectorAll('.nb-tag').forEach(tag => {
    if (state.selectedProviders.has(tag.dataset.provider)) {
      tag.classList.add('nb-tag--active');
    }
  });
});

// ── Mock badge ────────────────────────────────────────────────────────────────
async function initMockBadge() {
  try {
    const r = await fetch('/health');
    const d = await r.json();
    const el = document.getElementById('mock-indicator');
    if (el) {
      if (d.mockMode) {
        el.textContent = 'MOCK MODE';
        el.className = 'nb-badge nb-badge--lime';
        el.style.cssText = 'font-size:9px; padding: 2px 8px; border-width: 1px;';
      } else {
        el.textContent = 'LIVE';
        el.className = 'nb-badge nb-badge--green';
        el.style.cssText = 'font-size:9px; padding: 2px 8px; border-width: 1px;';
      }
    }
  } catch (_) {}
}

// ── Smooth scroll ─────────────────────────────────────────────────────────────
function initSmoothScroll() {
  document.querySelectorAll('[data-scroll]').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = document.querySelector(btn.dataset.scroll);
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });
}

// ── Integration tags ──────────────────────────────────────────────────────────
function initIntegrationTags() {
  document.querySelectorAll('.nb-tag').forEach(tag => {
    tag.addEventListener('click', () => {
      const p = tag.dataset.provider;
      if (state.selectedProviders.has(p)) {
        state.selectedProviders.delete(p);
        tag.classList.remove('nb-tag--active');
      } else {
        state.selectedProviders.add(p);
        tag.classList.add('nb-tag--active');
      }
    });
  });
}

// ── Posture buttons ───────────────────────────────────────────────────────────
function initPostureButtons() {
  document.querySelectorAll('.posture-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.posture-btn').forEach(b => b.classList.remove('posture-btn--active'));
      btn.classList.add('posture-btn--active');
      state.selectedPosture = btn.dataset.risk;
    });
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// JSON SYNTAX HIGHLIGHTER
// ══════════════════════════════════════════════════════════════════════════════
function highlightJSON(obj) {
  const str = typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2);
  return str
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(
      /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
      match => {
        if (/^"/.test(match)) {
          if (/:$/.test(match)) return `<span class="jk">${match}</span>`;
          return `<span class="js">${match}</span>`;
        }
        if (/true|false|null/.test(match)) return `<span class="jb">${match}</span>`;
        return `<span class="jn">${match}</span>`;
      }
    );
}

// ── Relative time ─────────────────────────────────────────────────────────────
function timeAgo(isoString) {
  if (!isoString) return '—';
  const diff = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
  if (diff < 5)    return 'just now';
  if (diff < 60)   return diff + 's ago';
  if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
  return Math.floor(diff / 3600) + 'h ago';
}

function fmtTime(isoString) {
  if (!isoString) return '—';
  return new Date(isoString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

// ══════════════════════════════════════════════════════════════════════════════
// EXECUTE FLOW
// ══════════════════════════════════════════════════════════════════════════════
async function planAndExecute() {
  const goal = document.getElementById('goal-input').value.trim();
  if (!goal) {
    document.getElementById('goal-input').focus();
    return;
  }

  const providers = state.selectedProviders.size > 0
    ? [...state.selectedProviders]
    : ['gmail', 'github', 'calendar', 'slack'];

  setExecLoading(true);
  showOutputContent();
  hidePanels();

  try {
    const res = await fetch('/api/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        goal,
        providers,
        posture: state.selectedPosture,
        userId: 'demo-user',
      }),
    });
    const data = await res.json();

    if (!res.ok) throw new Error(data.error || 'Request failed');

    const { jobId, plan } = data;
    state.currentJobId = jobId;

    // Show plan panel immediately
    showPlanPanel(plan, jobId);

    // Show exec status panel with delay
    setTimeout(() => {
      showExecPanel('running', null);
      startJobPolling(jobId);
    }, 600);

  } catch (err) {
    showErrorState(err.message || 'Unknown error');
  } finally {
    setExecLoading(false);
  }
}

function setExecLoading(loading) {
  const btn = document.getElementById('exec-btn');
  const label = document.getElementById('exec-label');
  if (loading) {
    btn.disabled = true;
    startSpinner(label);
  } else {
    stopSpinner();
    btn.disabled = false;
    label.textContent = 'PLAN & EXECUTE →';
  }
}

function showOutputContent() {
  document.getElementById('output-placeholder').style.display = 'none';
  document.getElementById('output-content').style.display = 'block';
}

function hidePanels() {
  ['panel-plan', 'panel-exec', 'panel-audit-event'].forEach(id => {
    document.getElementById(id).style.display = 'none';
  });
}

function showPlanPanel(plan, jobId) {
  const panel = document.getElementById('panel-plan');
  document.getElementById('plan-job-id').textContent = jobId ? jobId.slice(0, 8) : '—';
  document.getElementById('plan-json-block').innerHTML = highlightJSON(plan ?? []);
  panel.style.display = '';
}

function showErrorState(msg) {
  showOutputContent();
  const panel = document.getElementById('panel-exec');
  panel.style.display = '';
  document.getElementById('exec-header-title').textContent = 'ERROR';
  const container = document.getElementById('exec-status-container');
  container.innerHTML = `
    <div class="exec-status-block exec-status-block--error">
      <div class="exec-status-title">✗ ${escapeHTML(msg)}</div>
    </div>
  `;
}

function escapeHTML(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ── Job polling ───────────────────────────────────────────────────────────────
function startJobPolling(jobId) {
  clearInterval(state.pollTimer);
  state.pollTimer = setInterval(() => pollJob(jobId), 2000);
}

async function pollJob(jobId) {
  try {
    const res = await fetch(`/api/jobs/${jobId}`);
    if (!res.ok) { clearInterval(state.pollTimer); return; }
    const job = await res.json();
    updateExecPanel(job);
    if (['completed', 'failed', 'cancelled'].includes(job.status)) {
      clearInterval(state.pollTimer);
      if (job.status === 'completed') fetchLatestAuditEvent();
    }
  } catch (_) {}
}

function showExecPanel(status, job) {
  const panel = document.getElementById('panel-exec');
  panel.style.display = '';
  const header = document.getElementById('exec-header-title');
  const meta = document.getElementById('exec-status-meta');
  const container = document.getElementById('exec-status-container');

  if (job) {
    meta.textContent = job.id ? job.id.slice(0, 8) : '';
  }

  if (status === 'pending' || status === 'running') {
    header.textContent = 'EXECUTION STATUS';
    container.innerHTML = `
      <div class="exec-status-block exec-status-block--running">
        <div class="exec-status-title exec-status-mono">[ EXECUTING... ]</div>
        <div class="exec-status-sub" id="exec-running-spinner"></div>
      </div>
    `;
    const spinEl = document.getElementById('exec-running-spinner');
    if (spinEl) {
      let frame = 0;
      spinEl._interval = setInterval(() => {
        frame = (frame + 1) % SPINNER_FRAMES.length;
        spinEl.textContent = SPINNER_FRAMES[frame];
      }, 150);
    }
    return;
  }

  // Clear any running spinner
  const oldSpinEl = document.getElementById('exec-running-spinner');
  if (oldSpinEl && oldSpinEl._interval) clearInterval(oldSpinEl._interval);

  if (status === 'suspended_stepup') {
    header.textContent = 'STEP-UP AUTH REQUIRED';
    state.currentStepUpChallengeId = job.pendingStepUpChallengeId;
    state.currentAsyncJobId = job.id;
    container.innerHTML = `
      <div class="exec-status-block exec-status-block--stepup">
        <div class="exec-status-title">⚠ STEP-UP AUTH REQUIRED</div>
        <div class="exec-status-sub">Action: ${escapeHTML(job.pendingProvider || 'unknown')} requires explicit consent</div>
        <div class="exec-actions">
          <button class="exec-btn-sm exec-btn-approve" onclick="approveStepUp()">APPROVE ✓</button>
          <button class="exec-btn-sm exec-btn-deny" onclick="denyJob()">DENY ✗</button>
        </div>
      </div>
    `;
    return;
  }

  if (status === 'suspended_async_auth') {
    header.textContent = 'ASYNC AUTH REQUIRED';
    state.currentAsyncJobId = job.id;
    const authUrl = job.authUrl || '#';
    container.innerHTML = `
      <div class="exec-status-block exec-status-block--async">
        <div class="exec-status-title">⏸ ASYNC AUTH REQUIRED</div>
        <div class="exec-status-sub">${escapeHTML(job.pendingProvider || 'Service')} is not connected. Auth link generated.</div>
        <div class="exec-actions">
          <button class="exec-btn-sm exec-btn-auth" onclick="window.open('${authUrl}','_blank')">CONNECT ${escapeHTML((job.pendingProvider || 'SERVICE').toUpperCase())} →</button>
          <button class="exec-btn-sm exec-btn-approve" onclick="resumeAsyncAuth()">SIMULATE AUTH (MOCK)</button>
        </div>
      </div>
    `;
    return;
  }

  if (status === 'completed') {
    header.textContent = 'EXECUTION STATUS';
    container.innerHTML = `
      <div class="exec-status-block exec-status-block--done">
        <div class="exec-status-title">✓ EXECUTION COMPLETE</div>
        <div class="exec-status-sub">All capabilities executed. Audit event written.</div>
      </div>
    `;
    return;
  }

  if (status === 'failed') {
    header.textContent = 'EXECUTION STATUS';
    container.innerHTML = `
      <div class="exec-status-block exec-status-block--error">
        <div class="exec-status-title">✗ EXECUTION FAILED</div>
        <div class="exec-status-sub">${job && job.error ? escapeHTML(job.error) : 'Unknown error'}</div>
      </div>
    `;
    return;
  }

  if (status === 'cancelled') {
    header.textContent = 'EXECUTION STATUS';
    container.innerHTML = `
      <div class="exec-status-block exec-status-block--denied">
        <div class="exec-status-title">✗ EXECUTION DENIED</div>
        <div class="exec-status-sub">Job was cancelled by user.</div>
      </div>
    `;
    return;
  }

  // Fallback
  header.textContent = 'EXECUTION STATUS';
  container.innerHTML = `
    <div class="exec-status-block exec-status-block--running">
      <div class="exec-status-title exec-status-mono">[ EXECUTING... ]</div>
    </div>
  `;
}

function updateExecPanel(job) {
  showExecPanel(job.status, job);
}

// ── Step-up actions ───────────────────────────────────────────────────────────
async function approveStepUp() {
  if (!state.currentAsyncJobId) return;
  try {
    await fetch(`/api/jobs/${state.currentAsyncJobId}/stepup/approve`, { method: 'POST' });
    startJobPolling(state.currentAsyncJobId);
  } catch (e) { console.error(e); }
}

async function denyJob() {
  if (!state.currentAsyncJobId) return;
  try {
    await fetch(`/api/jobs/${state.currentAsyncJobId}/cancel`, { method: 'POST' });
    clearInterval(state.pollTimer);
    pollJob(state.currentAsyncJobId);
  } catch (e) { console.error(e); }
}

async function resumeAsyncAuth() {
  if (!state.currentAsyncJobId) return;
  try {
    await fetch(`/api/jobs/${state.currentAsyncJobId}/auth/complete`, { method: 'POST' });
    startJobPolling(state.currentAsyncJobId);
  } catch (e) { console.error(e); }
}

// ── Audit event (sub-panel C) ─────────────────────────────────────────────────
async function fetchLatestAuditEvent() {
  try {
    const res = await fetch('/api/audit');
    const data = await res.json();
    if (!data.length) return;
    const latest = data[0];
    const panel = document.getElementById('panel-audit-event');
    panel.style.display = '';
    document.getElementById('audit-event-ts').textContent = fmtTime(latest.timestamp);
    document.getElementById('audit-event-json').innerHTML = highlightJSON(latest);
  } catch (_) {}
}

// ══════════════════════════════════════════════════════════════════════════════
// AUDIT LOG TABLE
// ══════════════════════════════════════════════════════════════════════════════
function startAuditPolling() {
  refreshAuditLog();
  state.auditPollTimer = setInterval(refreshAuditLog, 5000);
}

async function refreshAuditLog() {
  try {
    const res = await fetch('/api/audit');
    const data = await res.json();
    renderAuditRows(data);
  } catch (_) {}
}

const EVENT_BADGE = {
  'job.created':                  { cls: 'eb-blue',   label: 'PLAN_CREATED' },
  'job.completed':                { cls: 'eb-green',  label: 'CAPABILITY_EXECUTED' },
  'job.failed':                   { cls: 'eb-coral',  label: 'EXECUTION_DENIED' },
  'job.resumed':                  { cls: 'eb-blue',   label: 'JOB_RESUMED' },
  'provider.call':                { cls: 'eb-green',  label: 'CAPABILITY_EXECUTED' },
  'provider.call.before':         { cls: 'eb-blue',   label: 'TOKEN_REQUESTED' },
  'provider.call.after':          { cls: 'eb-green',  label: 'CAPABILITY_EXECUTED' },
  'capability.blocked':           { cls: 'eb-coral',  label: 'EXECUTION_DENIED' },
  'capability.stepup_required':   { cls: 'eb-orange', label: 'STEPUP_REQUIRED' },
  'capability.async_auth_required': { cls: 'eb-purple', label: 'TOKEN_REQUESTED' },
  'vault.token_fetch':            { cls: 'eb-purple', label: 'TOKEN_REQUESTED' },
};

function renderAuditRows(events) {
  const tbody = document.getElementById('audit-rows');

  if (!events || !events.length) {
    tbody.innerHTML = '<tr class="audit-empty-row"><td colspan="6">NO EVENTS YET // RUN A WORKFLOW ABOVE</td></tr>';
    return;
  }

  tbody.innerHTML = events.map((ev, idx) => {
    const badge   = EVENT_BADGE[ev.type] || { cls: 'eb-gray', label: ev.type?.toUpperCase() || 'EVENT' };
    const provider = ev.provider || '—';
    const riskTxt = ev.riskLevel || ev.risk || '';
    const riskCls = riskTxt === 'HIGH' ? 'risk-high' : riskTxt === 'MEDIUM' ? 'risk-medium' : riskTxt ? 'risk-low' : '';
    const action  = (ev.action || ev.message || '').slice(0, 40) || '—';
    const outcome = ev.outcome;

    let statusHTML;
    if (outcome === 'success' || outcome === 'SUCCESS') {
      statusHTML = '<span class="status-ok">✓ OK</span>';
    } else if (outcome === 'failure' || outcome === 'FAILURE') {
      statusHTML = '<span class="status-err">✗ ERR</span>';
    } else {
      statusHTML = '<span class="status-pending status-spin">⟳</span>';
    }

    return `
      <tr onclick="toggleAuditExpand(this, ${idx})" data-idx="${idx}">
        <td data-label="Time"><span class="audit-ts">${timeAgo(ev.timestamp)}</span></td>
        <td data-label="Event"><span class="event-badge ${badge.cls}">${badge.label}</span></td>
        <td data-label="Provider"><span class="provider-cell">${escapeHTML(provider)}</span></td>
        <td data-label="Action"><span class="audit-action">${escapeHTML(action)}</span></td>
        <td data-label="Risk"><span class="audit-risk ${riskCls}">${riskTxt || '—'}</span></td>
        <td data-label="Status" class="audit-status-cell">${statusHTML}</td>
      </tr>
    `;
  }).join('');

  // Store events for expand
  tbody._events = events;
}

function toggleAuditExpand(row, idx) {
  const existing = row.nextElementSibling;
  if (existing && existing.classList.contains('audit-expand-row')) {
    existing.remove();
    row.classList.remove('expanded');
    return;
  }

  // Close any open expands
  document.querySelectorAll('.audit-expand-row').forEach(el => el.remove());
  document.querySelectorAll('tr.expanded').forEach(el => el.classList.remove('expanded'));

  row.classList.add('expanded');
  const events = row.closest('tbody')._events;
  if (!events) return;
  const ev = events[idx];
  const tr = document.createElement('tr');
  tr.className = 'audit-expand-row';
  tr.innerHTML = `<td colspan="6" style="padding:0"><div class="nb-code-block max-h-160 audit-expand-inner">${highlightJSON(ev)}</div></td>`;
  row.insertAdjacentElement('afterend', tr);
}
