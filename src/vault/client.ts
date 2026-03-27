/**
 * vault/client.ts
 * Auth0 Token Vault SDK wrapper.
 *
 * Token Vault is the central identity layer for Bridgekeeper.
 * All OAuth token acquisition, storage, rotation, and revocation
 * go through this module. The local agent and providers NEVER
 * hold raw refresh tokens or provider secrets.
 */

import * as dotenv from 'dotenv';
import { logger } from '../bridge/audit';

dotenv.config();

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface VaultToken {
  accessToken: string;
  tokenType: string;
  scope: string;
  expiresAt: number; // unix ms
  provider: string;
  userId: string;
}

export interface VaultConnectionStatus {
  provider: string;
  connected: boolean;
  expiresAt?: number;
  scope?: string;
}

export type Provider =
  | 'gmail'
  | 'calendar'
  | 'github'
  | 'jira'
  | 'notion'
  | 'slack';

// ─────────────────────────────────────────────────────────────────────────────
// Vault Configuration
// ─────────────────────────────────────────────────────────────────────────────

const VAULT_CONFIG = {
  domain: process.env.AUTH0_DOMAIN ?? 'demo.us.auth0.com',
  clientId: process.env.AUTH0_CLIENT_ID ?? 'demo_client_id',
  clientSecret: process.env.AUTH0_CLIENT_SECRET ?? 'demo_client_secret',
  audience: process.env.AUTH0_AUDIENCE ?? 'https://demo.us.auth0.com/api/v2/',
  managementToken: process.env.AUTH0_MANAGEMENT_TOKEN ?? 'demo_mgmt_token',
};

// ─────────────────────────────────────────────────────────────────────────────
// VaultClient class — wraps the Auth0 Token Vault API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * VaultClient provides the core interface to Auth0 Token Vault.
 *
 * In production this integrates with the Auth0 management API's
 * token vault endpoints. In mock mode (MOCK_PROVIDERS=true) it
 * returns simulated in-memory tokens so the demo runs without
 * real credentials.
 */
export class VaultClient {
  private readonly domain: string;
  private readonly clientId: string;
  private readonly managementToken: string;

  // In-memory mock token store (production uses Auth0 Vault storage)
  private mockTokenStore: Map<string, VaultToken> = new Map();

  constructor() {
    this.domain = VAULT_CONFIG.domain;
    this.clientId = VAULT_CONFIG.clientId;
    this.managementToken = VAULT_CONFIG.managementToken;

    // Pre-populate mock tokens for demo purposes
    if (process.env.MOCK_PROVIDERS === 'true') {
      this.seedMockTokens();
    }
  }

  /**
   * Retrieve a token from Vault for a given user+provider combination.
   * Token Vault handles storage, rotation, and expiry transparently.
   */
  async getToken(userId: string, provider: Provider): Promise<VaultToken | null> {
    const key = `${userId}:${provider}`;

    if (process.env.MOCK_PROVIDERS === 'true') {
      const token = this.mockTokenStore.get(key);
      if (token) {
        logger.info({ userId, provider, event: 'vault.token.retrieved' });
        return token;
      }
      return null;
    }

    // ── Production: call Auth0 Token Vault API ──────────────────────────────
    try {
      const response = await fetch(
        `https://${this.domain}/api/v2/users/${encodeURIComponent(userId)}/token-vault/${provider}`,
        {
          headers: {
            Authorization: `Bearer ${this.managementToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        if (response.status === 404) return null;
        throw new Error(`Token Vault returned ${response.status}`);
      }

      const data = (await response.json()) as {
        access_token: string;
        token_type: string;
        scope: string;
        expires_at: number;
      };

      return {
        accessToken: data.access_token,
        tokenType: data.token_type ?? 'Bearer',
        scope: data.scope ?? '',
        expiresAt: data.expires_at,
        provider,
        userId,
      };
    } catch (err) {
      logger.error({ userId, provider, err, event: 'vault.token.error' });
      throw err;
    }
  }

  /**
   * Store or update a token in Vault after OAuth callback.
   */
  async storeToken(userId: string, provider: Provider, token: VaultToken): Promise<void> {
    const key = `${userId}:${provider}`;

    if (process.env.MOCK_PROVIDERS === 'true') {
      this.mockTokenStore.set(key, token);
      logger.info({ userId, provider, event: 'vault.token.stored' });
      return;
    }

    // Production: persist to Auth0 Token Vault
    await fetch(
      `https://${this.domain}/api/v2/users/${encodeURIComponent(userId)}/token-vault/${provider}`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${this.managementToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          access_token: token.accessToken,
          token_type: token.tokenType,
          scope: token.scope,
          expires_at: token.expiresAt,
        }),
      }
    );

    logger.info({ userId, provider, event: 'vault.token.stored' });
  }

  /**
   * List all connected providers for a user.
   */
  async listConnections(userId: string): Promise<VaultConnectionStatus[]> {
    const providers: Provider[] = ['gmail', 'calendar', 'github', 'jira', 'notion', 'slack'];

    if (process.env.MOCK_PROVIDERS === 'true') {
      return providers.map((p) => {
        const token = this.mockTokenStore.get(`${userId}:${p}`);
        return {
          provider: p,
          connected: !!token,
          expiresAt: token?.expiresAt,
          scope: token?.scope,
        };
      });
    }

    // Production: query Vault for each provider
    const statuses = await Promise.allSettled(
      providers.map(async (p) => {
        const token = await this.getToken(userId, p);
        return {
          provider: p,
          connected: !!token,
          expiresAt: token?.expiresAt,
          scope: token?.scope,
        } as VaultConnectionStatus;
      })
    );

    return statuses
      .filter((r) => r.status === 'fulfilled')
      .map((r) => (r as PromiseFulfilledResult<VaultConnectionStatus>).value);
  }

  /**
   * Revoke a token from Vault (used by kill-switch / step-up revocation).
   */
  async revokeToken(userId: string, provider: Provider): Promise<void> {
    const key = `${userId}:${provider}`;

    if (process.env.MOCK_PROVIDERS === 'true') {
      this.mockTokenStore.delete(key);
      logger.info({ userId, provider, event: 'vault.token.revoked' });
      return;
    }

    await fetch(
      `https://${this.domain}/api/v2/users/${encodeURIComponent(userId)}/token-vault/${provider}`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${this.managementToken}` },
      }
    );
    logger.info({ userId, provider, event: 'vault.token.revoked' });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Mock helpers
  // ─────────────────────────────────────────────────────────────────────────

  private seedMockTokens(): void {
    const base: Omit<VaultToken, 'provider' | 'userId'> = {
      accessToken: 'mock_access_token_' + Math.random().toString(36).slice(2),
      tokenType: 'Bearer',
      scope: 'read write',
      expiresAt: Date.now() + 3600 * 1000, // 1 hour from now
    };
    const userId = 'demo-user';
    const connected: Provider[] = ['gmail', 'calendar', 'github', 'slack'];
    for (const provider of connected) {
      this.mockTokenStore.set(`${userId}:${provider}`, {
        ...base,
        accessToken: `mock_${provider}_token_${Math.random().toString(36).slice(2)}`,
        provider,
        userId,
      });
    }
    // jira and notion are intentionally NOT seeded to demo async-auth flow
  }
}

// Singleton export
export const vaultClient = new VaultClient();
