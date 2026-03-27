/**
 * bridge/audit.ts
 * Structured audit event logger.
 *
 * Every provider API call emits a structured audit event BEFORE and AFTER
 * execution. Events are streamed as JSON to stdout (pino) and also stored
 * in an in-memory ring buffer for the UI's Audit Log Viewer.
 */

import pino from 'pino';

// ─────────────────────────────────────────────────────────────────────────────
// Logger setup (pino)
// ─────────────────────────────────────────────────────────────────────────────

export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  transport:
    process.env.NODE_ENV !== 'production'
      ? { target: 'pino-pretty', options: { colorize: true } }
      : undefined,
});

// ─────────────────────────────────────────────────────────────────────────────
// Audit Event Types
// ─────────────────────────────────────────────────────────────────────────────

export type AuditEventType =
  | 'plan.created'
  | 'plan.validated'
  | 'capability.blocked'
  | 'capability.stepup_required'
  | 'capability.async_auth_required'
  | 'capability.executing'
  | 'capability.completed'
  | 'capability.failed'
  | 'vault.token.retrieved'
  | 'vault.token.refreshed'
  | 'vault.token.stored'
  | 'vault.token.revoked'
  | 'vault.token.error'
  | 'vault.delegated.not_connected'
  | 'vault.delegated.token_retrieved'
  | 'vault.delegated.token_refreshed'
  | 'vault.delegated.token_refreshed_mock'
  | 'vault.delegated.refresh_triggered'
  | 'vault.delegated.refresh_failed'
  | 'vault.delegated.token_stored_post_oauth'
  | 'vault.async_auth.initiated'
  | 'vault.async_auth.completed'
  | 'vault.async_auth.not_found'
  | 'vault.async_auth.expired'
  | 'vault.stepup.challenge_issued'
  | 'vault.stepup.approved'
  | 'vault.stepup.denied'
  | 'vault.stepup.expired'
  | 'vault.stepup.not_found'
  | 'provider.call.before'
  | 'provider.call.after'
  | 'provider.call.error'
  | 'job.created'
  | 'job.suspended'
  | 'job.resumed'
  | 'job.completed'
  | 'job.failed';

export interface AuditEvent {
  id: string;
  timestamp: string;
  type: AuditEventType;
  jobId?: string;
  userId?: string;
  provider?: string;
  action?: string;
  riskLevel?: string;
  outcome?: 'success' | 'failure' | 'blocked' | 'pending';
  message?: string;
  data?: Record<string, unknown>;
  durationMs?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// In-memory audit ring buffer (last 100 events)
// ─────────────────────────────────────────────────────────────────────────────

const MAX_AUDIT_EVENTS = 100;
const auditBuffer: AuditEvent[] = [];
let eventCounter = 0;

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Emit a structured audit event.
 * Written to pino logger AND stored in the ring buffer for the UI.
 */
export function emitAudit(
  type: AuditEventType,
  fields: Omit<AuditEvent, 'id' | 'timestamp' | 'type'>
): AuditEvent {
  const event: AuditEvent = {
    id: `evt_${++eventCounter}_${Date.now()}`,
    timestamp: new Date().toISOString(),
    type,
    ...fields,
  };

  // Write to structured log (stdout, JSON in prod / pretty in dev)
  logger.info({ audit: event }, `[AUDIT] ${type}`);

  // Store in ring buffer
  auditBuffer.push(event);
  if (auditBuffer.length > MAX_AUDIT_EVENTS) {
    auditBuffer.shift();
  }

  return event;
}

/**
 * Get the last N audit events for the UI viewer.
 */
export function getRecentAuditEvents(limit = 10): AuditEvent[] {
  return auditBuffer.slice(-limit).reverse();
}

/**
 * Get all audit events for a specific job.
 */
export function getJobAuditEvents(jobId: string): AuditEvent[] {
  return auditBuffer.filter((e) => e.jobId === jobId);
}

// ─────────────────────────────────────────────────────────────────────────────
// Convenience wrappers for common audit patterns
// ─────────────────────────────────────────────────────────────────────────────

export function auditProviderBefore(
  jobId: string,
  userId: string,
  provider: string,
  action: string,
  riskLevel: string
): void {
  emitAudit('provider.call.before', {
    jobId,
    userId,
    provider,
    action,
    riskLevel,
    outcome: 'pending',
    message: `About to call ${provider}.${action}`,
  });
}

export function auditProviderAfter(
  jobId: string,
  userId: string,
  provider: string,
  action: string,
  durationMs: number,
  success: boolean
): void {
  emitAudit('provider.call.after', {
    jobId,
    userId,
    provider,
    action,
    outcome: success ? 'success' : 'failure',
    durationMs,
    message: success
      ? `${provider}.${action} completed in ${durationMs}ms`
      : `${provider}.${action} failed after ${durationMs}ms`,
  });
}

export function auditCapabilityBlocked(
  jobId: string,
  userId: string,
  provider: string,
  action: string,
  reason: string
): void {
  emitAudit('capability.blocked', {
    jobId,
    userId,
    provider,
    action,
    outcome: 'blocked',
    message: `Blocked: ${reason}`,
  });
}
