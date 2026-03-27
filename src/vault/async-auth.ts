/**
 * vault/async-auth.ts
 * Async authorization: suspend/resume pattern for unlinked providers.
 *
 * When the bridge encounters a provider that the user hasn't connected,
 * it suspends the job, generates an auth URL via Token Vault, and waits
 * for the user to complete the OAuth flow. The job then resumes automatically.
 *
 * This is Integration Point (c) from the Token Vault spec:
 *   "if a workflow hits an unconnected service, Bridgekeeper suspends the job,
 *    sends an auth link, and resumes when Vault confirms"
 */

import { v4 as uuidv4 } from 'uuid';
import { vaultClient, Provider } from './client';
import { logger } from '../bridge/audit';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface AsyncAuthRequest {
  requestId: string;
  jobId: string;
  userId: string;
  provider: Provider;
  authUrl: string;
  createdAt: number;
  expiresAt: number;
  status: 'pending' | 'completed' | 'expired';
}

// ─────────────────────────────────────────────────────────────────────────────
// In-memory store (Redis-replaceable)
// ─────────────────────────────────────────────────────────────────────────────

const pendingAuthRequests: Map<string, AsyncAuthRequest> = new Map();

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Initiate async authorization for an unlinked provider.
 *
 * The bridge calls this when a job requires a provider that the user
 * hasn't connected yet. This function:
 *   1. Generates an Auth0 Token Vault authorization URL
 *   2. Suspends the job (job store updated by executor)
 *   3. Returns the authUrl for the UI to display
 *
 * @returns An AsyncAuthRequest containing the authUrl and requestId.
 */
export async function initiateAsyncAuth(
  jobId: string,
  userId: string,
  provider: Provider
): Promise<AsyncAuthRequest> {
  const requestId = uuidv4();
  const authUrl = buildAuthUrl(userId, provider, requestId);
  const now = Date.now();

  const authRequest: AsyncAuthRequest = {
    requestId,
    jobId,
    userId,
    provider,
    authUrl,
    createdAt: now,
    expiresAt: now + 15 * 60 * 1000, // 15-minute window
    status: 'pending',
  };

  pendingAuthRequests.set(requestId, authRequest);

  logger.info({
    requestId,
    jobId,
    userId,
    provider,
    event: 'vault.async_auth.initiated',
    message: `Job suspended — awaiting ${provider} authorization`,
  });

  return authRequest;
}

/**
 * Handle completion of an async auth flow (called from OAuth callback).
 *
 * When the user completes the OAuth flow for the provider, Auth0 calls
 * back to our server. This function marks the async-auth request as
 * completed and signals the job to resume.
 *
 * @returns The completed AsyncAuthRequest (or null if not found / expired).
 */
export async function completeAsyncAuth(
  requestId: string,
  accessToken: string,
  scope: string,
  expiresInSeconds: number
): Promise<AsyncAuthRequest | null> {
  const authRequest = pendingAuthRequests.get(requestId);

  if (!authRequest) {
    logger.warn({ requestId, event: 'vault.async_auth.not_found' });
    return null;
  }

  if (Date.now() > authRequest.expiresAt) {
    authRequest.status = 'expired';
    pendingAuthRequests.set(requestId, authRequest);
    logger.warn({ requestId, event: 'vault.async_auth.expired' });
    return authRequest;
  }

  // Store the newly obtained token in Vault
  await vaultClient.storeToken(authRequest.userId, authRequest.provider, {
    accessToken,
    tokenType: 'Bearer',
    scope,
    expiresAt: Date.now() + expiresInSeconds * 1000,
    provider: authRequest.provider,
    userId: authRequest.userId,
  });

  authRequest.status = 'completed';
  pendingAuthRequests.set(requestId, authRequest);

  logger.info({
    requestId,
    jobId: authRequest.jobId,
    userId: authRequest.userId,
    provider: authRequest.provider,
    event: 'vault.async_auth.completed',
    message: 'Provider connected — job will resume',
  });

  return authRequest;
}

/**
 * Check whether an async-auth request has been fulfilled.
 * The executor polls this to know when to resume a suspended job.
 */
export function checkAsyncAuthStatus(
  requestId: string
): 'pending' | 'completed' | 'expired' | 'not_found' {
  const authRequest = pendingAuthRequests.get(requestId);

  if (!authRequest) return 'not_found';

  // Auto-expire if past expiry
  if (authRequest.status === 'pending' && Date.now() > authRequest.expiresAt) {
    authRequest.status = 'expired';
    pendingAuthRequests.set(requestId, authRequest);
  }

  return authRequest.status;
}

/**
 * Simulate completing an async-auth request in mock mode.
 * Used by the demo UI's "Complete Auth" action.
 */
export async function mockCompleteAsyncAuth(requestId: string): Promise<AsyncAuthRequest | null> {
  if (process.env.MOCK_PROVIDERS !== 'true') {
    throw new Error('mockCompleteAsyncAuth only available in mock mode');
  }

  return completeAsyncAuth(
    requestId,
    `mock_token_${Math.random().toString(36).slice(2)}`,
    'read write',
    3600
  );
}

/**
 * Get the auth request by ID.
 */
export function getAsyncAuthRequest(requestId: string): AsyncAuthRequest | undefined {
  return pendingAuthRequests.get(requestId);
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

function buildAuthUrl(userId: string, provider: Provider, requestId: string): string {
  if (process.env.MOCK_PROVIDERS === 'true') {
    // In mock mode, point to our own simulated callback endpoint
    const base = `http://localhost:${process.env.PORT ?? 3000}`;
    const params = new URLSearchParams({
      provider,
      userId,
      requestId,
      mock: 'true',
    });
    return `${base}/auth/connect?${params.toString()}`;
  }

  // Production: build Token Vault authorization URL
  const domain = process.env.AUTH0_DOMAIN ?? '';
  const clientId = process.env.AUTH0_CLIENT_ID ?? '';
  const callbackUrl = process.env.AUTH0_CALLBACK_URL ?? 'http://localhost:3000/callback';

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: callbackUrl,
    scope: scopeForProvider(provider),
    connection: providerConnection(provider),
    state: Buffer.from(JSON.stringify({ requestId, userId, provider })).toString('base64'),
    access_type: 'offline', // request refresh token
  });

  return `https://${domain}/authorize?${params.toString()}`;
}

function scopeForProvider(provider: Provider): string {
  const scopeMap: Record<Provider, string> = {
    gmail: 'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send',
    calendar: 'https://www.googleapis.com/auth/calendar.events',
    github: 'repo read:user notifications',
    jira: 'read:jira-work write:jira-work',
    notion: 'read_content insert_content update_content',
    slack: 'channels:history channels:read chat:write users:read',
  };
  return scopeMap[provider] ?? 'openid profile email';
}

function providerConnection(provider: Provider): string {
  const connMap: Record<Provider, string> = {
    gmail: 'google-oauth2',
    calendar: 'google-oauth2',
    github: 'github',
    jira: 'atlassian',
    notion: 'notion',
    slack: 'slack',
  };
  return connMap[provider] ?? provider;
}
