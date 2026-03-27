/**
 * bridge/policy.ts
 * Risk policy engine for Bridgekeeper.
 *
 * Every capability request is evaluated against the configured risk posture
 * before any token is retrieved or provider API is called. This ensures that
 * the bridge enforces governance rules regardless of what the local agent requests.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type RiskPosture = 'LOW' | 'MEDIUM' | 'HIGH';

export type ActionCategory =
  | 'read'
  | 'write'
  | 'send'
  | 'delete'
  | 'publish'
  | 'admin';

export interface CapabilityPlan {
  id: string;
  provider: string;
  action: string;
  category: ActionCategory;
  parameters: Record<string, unknown>;
  estimatedRisk: RiskLevel;
  requiresStepUp: boolean;
}

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface PolicyDecision {
  allowed: boolean;
  reason?: string;
  requiresStepUp: boolean;
  riskLevel: RiskLevel;
}

// ─────────────────────────────────────────────────────────────────────────────
// Risk Matrix
// ─────────────────────────────────────────────────────────────────────────────

const ACTION_RISK_MAP: Record<string, RiskLevel> = {
  // Read operations — LOW
  read_emails: 'LOW',
  list_threads: 'LOW',
  get_thread: 'LOW',
  list_events: 'LOW',
  get_event: 'LOW',
  list_issues: 'LOW',
  get_issue: 'LOW',
  list_repos: 'LOW',
  get_repo: 'LOW',
  list_pages: 'LOW',
  get_page: 'LOW',
  list_channels: 'LOW',
  list_messages: 'LOW',
  get_user: 'LOW',

  // Write operations — MEDIUM
  create_event: 'MEDIUM',
  update_event: 'MEDIUM',
  create_issue: 'MEDIUM',
  update_issue: 'MEDIUM',
  create_page: 'MEDIUM',
  update_page: 'MEDIUM',
  create_pr: 'MEDIUM',
  comment_issue: 'MEDIUM',
  reply_thread: 'MEDIUM',

  // Send/Delete/Publish — HIGH (always step-up)
  send_email: 'HIGH',
  send_message: 'HIGH',
  reply_email: 'HIGH',
  delete: 'HIGH',
  delete_issue: 'HIGH',
  delete_file: 'HIGH',
  publish: 'HIGH',
  publish_page: 'HIGH',
  merge_pr: 'HIGH',
  close_issue: 'HIGH',

  // Admin — CRITICAL (blocked in MEDIUM/LOW posture)
  delete_repo: 'CRITICAL',
  admin: 'CRITICAL',
};

// ─────────────────────────────────────────────────────────────────────────────
// Posture thresholds
// ─────────────────────────────────────────────────────────────────────────────

const POSTURE_ALLOWED_LEVELS: Record<RiskPosture, RiskLevel[]> = {
  LOW: ['LOW'],
  MEDIUM: ['LOW', 'MEDIUM', 'HIGH'],
  HIGH: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
};

const RISK_ORDER: Record<RiskLevel, number> = {
  LOW: 0,
  MEDIUM: 1,
  HIGH: 2,
  CRITICAL: 3,
};

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Evaluate a capability plan against the current risk posture.
 *
 * @returns PolicyDecision — allowed, requiresStepUp, and riskLevel.
 */
export function evaluateCapability(
  plan: CapabilityPlan,
  posture: RiskPosture
): PolicyDecision {
  const riskLevel = getActionRisk(plan.action);
  const allowed = isAllowed(riskLevel, posture);
  const requiresStepUp = doesRequireStepUp(plan.action, riskLevel);

  return {
    allowed,
    riskLevel,
    requiresStepUp,
    reason: !allowed
      ? `Action "${plan.action}" has risk level ${riskLevel}, which exceeds posture ${posture}`
      : undefined,
  };
}

/**
 * Get the risk level for a given action string.
 * Normalizes the action to lowercase with underscores before lookup.
 */
export function getActionRisk(action: string): RiskLevel {
  const normalized = action.toLowerCase().replace(/[- ]/g, '_');

  // Direct match
  if (ACTION_RISK_MAP[normalized]) return ACTION_RISK_MAP[normalized];

  // Prefix matching for compound actions
  if (normalized.includes('delete') || normalized.includes('remove')) return 'HIGH';
  if (normalized.includes('send') || normalized.includes('publish')) return 'HIGH';
  if (normalized.includes('merge') || normalized.includes('close')) return 'HIGH';
  if (normalized.includes('admin')) return 'CRITICAL';
  if (normalized.includes('create') || normalized.includes('update')) return 'MEDIUM';
  if (normalized.includes('write') || normalized.includes('post')) return 'MEDIUM';

  // Default to MEDIUM for unknown actions (safer than assuming LOW)
  return 'MEDIUM';
}

/**
 * Check if a risk level is permitted under the given posture.
 */
export function isAllowed(riskLevel: RiskLevel, posture: RiskPosture): boolean {
  return POSTURE_ALLOWED_LEVELS[posture].includes(riskLevel);
}

/**
 * Determine if the action always requires step-up (regardless of posture).
 */
export function doesRequireStepUp(action: string, riskLevel: RiskLevel): boolean {
  if (RISK_ORDER[riskLevel] >= RISK_ORDER['HIGH']) return true;

  const normalized = action.toLowerCase().replace(/[- ]/g, '_');
  return (
    normalized.includes('send') ||
    normalized.includes('delete') ||
    normalized.includes('publish') ||
    normalized.includes('merge')
  );
}

/**
 * Get a human-readable explanation of the policy decision.
 */
export function explainDecision(decision: PolicyDecision, posture: RiskPosture): string {
  if (!decision.allowed) {
    return `🚫 Blocked — Action risk (${decision.riskLevel}) exceeds posture (${posture}). ` +
           `Upgrade posture to HIGH to allow this action.`;
  }
  if (decision.requiresStepUp) {
    return `⚠️ Step-up required — High-risk action requires explicit user re-consent ` +
           `before execution.`;
  }
  return `✅ Allowed under ${posture} posture — risk level: ${decision.riskLevel}`;
}
