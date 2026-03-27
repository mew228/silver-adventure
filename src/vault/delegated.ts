/**
 * vault/delegated.ts
 * Normal delegated OAuth token retrieval via Auth0 Token Vault.
 *
 * When a user has previously connected a provider, Vault holds the
 * refresh token and silently returns a fresh access token on demand.
 * The bridge (executor) calls getTokenForProvider() before every
 * provider API call — tokens are NEVER cached in process memory.
 */

import { vaultClient, VaultToken, Provider } from './client';
import { logger } from '../bridge/audit';

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Retrieve a valid access token for the given user+provider.
 *
 * Auth0 Token Vault silently refreshes expiring tokens, so the
 * bridge always gets a fresh, valid token without user re-auth.
 *
 * @returns VaultToken if connected, null if the provider is not linked.
 * @throws  if Vault is unreachable or returns a server error.
 */
export async function getTokenForProvider(
  userId: string,
  provider: Provider
): Promise<VaultToken | null> {
  const token = await vaultClient.getToken(userId, provider);

  if (!token) {
    logger.warn({
      userId,
      provider,
      event: 'vault.delegated.not_connected',
      message: `No token found for ${provider}. Provider not yet linked.`,
    });
    return null;
  }

  // Check if the token is near expiry (within 5 minutes)
  const EXPIRY_BUFFER_MS = 5 * 60 * 1000;
  const isNearExpiry = token.expiresAt - Date.now() < EXPIRY_BUFFER_MS;

  if (isNearExpiry) {
    logger.info({
      userId,
      provider,
      event: 'vault.delegated.refresh_triggered',
      message: 'Token near expiry; Vault will silently refresh.',
    });
    // In production, re-fetching from Vault triggers silent refresh automatically.
    // The Token Vault SDK handles pushing a new access token via the refresh token
    // without any user interaction.
    return await refreshToken(userId, provider);
  }

  logger.info({
    userId,
    provider,
    event: 'vault.delegated.token_retrieved',
  });

  return token;
}

/**
 * Trigger a silent refresh for a near-expiry token.
 * Vault uses the stored refresh token to obtain a new access token.
 */
async function refreshToken(userId: string, provider: Provider): Promise<VaultToken | null> {
  if (process.env.MOCK_PROVIDERS === 'true') {
    // In mock mode, simulate refresh by returning a new token with extended expiry
    const mockRefreshed: VaultToken = {
      accessToken: `mock_${provider}_refreshed_${Date.now()}`,
      tokenType: 'Bearer',
      scope: 'read write',
      expiresAt: Date.now() + 3600 * 1000,
      provider,
      userId,
    };
    await vaultClient.storeToken(userId, provider, mockRefreshed);
    logger.info({ userId, provider, event: 'vault.delegated.token_refreshed_mock' });
    return mockRefreshed;
  }

  // Production: Token Vault handles refresh automatically when getToken is called.
  // The Auth0 management API's token vault endpoint returns a fresh token by
  // internally using the stored refresh token.
  try {
    const refreshed = await vaultClient.getToken(userId, provider);
    if (refreshed) {
      logger.info({ userId, provider, event: 'vault.delegated.token_refreshed' });
    }
    return refreshed;
  } catch (err) {
    logger.error({ userId, provider, err, event: 'vault.delegated.refresh_failed' });
    throw err;
  }
}

/**
 * Check if a user has a token connected for a given provider.
 */
export async function isProviderConnected(
  userId: string,
  provider: Provider
): Promise<boolean> {
  const token = await vaultClient.getToken(userId, provider);
  return token !== null;
}

/**
 * Store a newly obtained token in Vault after OAuth callback completion.
 */
export async function storeOAuthToken(
  userId: string,
  provider: Provider,
  accessToken: string,
  scope: string,
  expiresInSeconds: number
): Promise<void> {
  const token: VaultToken = {
    accessToken,
    tokenType: 'Bearer',
    scope,
    expiresAt: Date.now() + expiresInSeconds * 1000,
    provider,
    userId,
  };

  await vaultClient.storeToken(userId, provider, token);
  logger.info({
    userId,
    provider,
    scope,
    event: 'vault.delegated.token_stored_post_oauth',
  });
}
