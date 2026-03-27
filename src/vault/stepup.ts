/**
 * vault/stepup.ts
 * Step-up authentication — Token Vault integration point (d).
 *
 * High-risk actions (send email, delete, publish) require explicit
 * user re-consent before the bridge executes them. This module issues
 * a step-up challenge via Auth0 MFA/step-up and verifies completion.
 *
 * Step-up is required regardless of configured risk posture for:
 *   - send (any provider)
 *   - delete (any provider)
 *   - publish (any provider)
 */

import { v4 as uuidv4 } from 'uuid';
import { logger } from '../bridge/audit';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface StepUpChallenge {
  challengeId: string;
  jobId: string;
  userId: string;
  action: string;          // e.g. "send_email", "delete_issue"
  provider: string;
  riskLevel: 'HIGH';
  createdAt: number;
  expiresAt: number;
  status: 'pending' | 'approved' | 'denied' | 'expired';
  stepUpUrl: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// In-memory store (Redis-replaceable)
// ─────────────────────────────────────────────────────────────────────────────

const challenges: Map<string, StepUpChallenge> = new Map();

// Actions that always require step-up
export const STEP_UP_ACTIONS = new Set([
  'send_email',
  'send_message',
  'reply_email',
  'delete',
  'delete_issue',
  'delete_file',
  'publish',
  'publish_page',
  'merge_pr',
  'close_issue',
  'send',
]);

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Determine if an action requires step-up authentication.
 */
export function requiresStepUp(action: string): boolean {
  const normalized = action.toLowerCase().replace(/[- ]/g, '_');
  return STEP_UP_ACTIONS.has(normalized) ||
    normalized.includes('send') ||
    normalized.includes('delete') ||
    normalized.includes('publish') ||
    normalized.includes('merge');
}

/**
 * Issue a step-up challenge for a high-risk action.
 *
 * The bridge calls this when the executor detects a STEP_UP_REQUIRED action.
 * The job is suspended and the UI shows a consent modal with the challenge URL.
 *
 * @returns A StepUpChallenge containing the stepUpUrl and challengeId.
 */
export async function issueStepUpChallenge(
  jobId: string,
  userId: string,
  action: string,
  provider: string
): Promise<StepUpChallenge> {
  const challengeId = uuidv4();
  const now = Date.now();

  const challenge: StepUpChallenge = {
    challengeId,
    jobId,
    userId,
    action,
    provider,
    riskLevel: 'HIGH',
    createdAt: now,
    expiresAt: now + 5 * 60 * 1000, // 5-minute step-up window
    status: 'pending',
    stepUpUrl: buildStepUpUrl(challengeId, userId, action, provider),
  };

  challenges.set(challengeId, challenge);

  logger.info({
    challengeId,
    jobId,
    userId,
    action,
    provider,
    event: 'vault.stepup.challenge_issued',
    message: `Step-up required for high-risk action: ${action}`,
  });

  return challenge;
}

/**
 * Approve a step-up challenge (called after user re-consents).
 *
 * In production this is called from the OAuth callback after Auth0
 * confirms the step-up MFA/re-auth. In mock mode the UI calls
 * POST /api/stepup/approve directly.
 */
export async function approveStepUpChallenge(challengeId: string): Promise<StepUpChallenge | null> {
  const challenge = challenges.get(challengeId);

  if (!challenge) {
    logger.warn({ challengeId, event: 'vault.stepup.not_found' });
    return null;
  }

  if (Date.now() > challenge.expiresAt) {
    challenge.status = 'expired';
    challenges.set(challengeId, challenge);
    logger.warn({ challengeId, event: 'vault.stepup.expired' });
    return challenge;
  }

  challenge.status = 'approved';
  challenges.set(challengeId, challenge);

  logger.info({
    challengeId,
    jobId: challenge.jobId,
    userId: challenge.userId,
    action: challenge.action,
    event: 'vault.stepup.approved',
    message: `Step-up approved — job will proceed with ${challenge.action}`,
  });

  return challenge;
}

/**
 * Deny a step-up challenge (user declined).
 */
export async function denyStepUpChallenge(challengeId: string): Promise<StepUpChallenge | null> {
  const challenge = challenges.get(challengeId);
  if (!challenge) return null;

  challenge.status = 'denied';
  challenges.set(challengeId, challenge);

  logger.info({
    challengeId,
    jobId: challenge.jobId,
    event: 'vault.stepup.denied',
  });

  return challenge;
}

/**
 * Check the status of a step-up challenge.
 */
export function checkStepUpStatus(
  challengeId: string
): 'pending' | 'approved' | 'denied' | 'expired' | 'not_found' {
  const challenge = challenges.get(challengeId);
  if (!challenge) return 'not_found';

  if (challenge.status === 'pending' && Date.now() > challenge.expiresAt) {
    challenge.status = 'expired';
    challenges.set(challengeId, challenge);
  }

  return challenge.status;
}

/**
 * Get a challenge by ID.
 */
export function getChallenge(challengeId: string): StepUpChallenge | undefined {
  return challenges.get(challengeId);
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

function buildStepUpUrl(
  challengeId: string,
  userId: string,
  action: string,
  provider: string
): string {
  if (process.env.MOCK_PROVIDERS === 'true') {
    const base = `http://localhost:${process.env.PORT ?? 3000}`;
    const params = new URLSearchParams({ challengeId, userId, action, provider });
    return `${base}/auth/stepup?${params.toString()}`;
  }

  // Production: Auth0 step-up / MFA challenge URL
  const domain = process.env.AUTH0_DOMAIN ?? '';
  const clientId = process.env.AUTH0_CLIENT_ID ?? '';
  const callbackUrl = process.env.AUTH0_CALLBACK_URL ?? 'http://localhost:3000/callback';

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: callbackUrl,
    scope: 'openid profile',
    acr_values: 'http://schemas.openid.net/pape/policies/2007/06/multi-factor',
    state: Buffer.from(JSON.stringify({ challengeId, type: 'stepup' })).toString('base64'),
    prompt: 'login',
  });

  return `https://${domain}/authorize?${params.toString()}`;
}
