/**
 * providers/slack.ts
 * Slack provider — read channels, send messages via Slack Web API.
 * Uses short-lived tokens from Auth0 Token Vault.
 */

const USE_MOCK = process.env.MOCK_PROVIDERS === 'true';

// ─────────────────────────────────────────────────────────────────────────────
// Mock Data
// ─────────────────────────────────────────────────────────────────────────────

const MOCK_CHANNELS = [
  { id: 'C001', name: 'general', memberCount: 42, isPrivate: false },
  { id: 'C002', name: 'engineering', memberCount: 15, isPrivate: false },
  { id: 'C003', name: 'auth0-hackathon', memberCount: 8, isPrivate: false },
];

const MOCK_MESSAGES = [
  { id: 'msg_001', user: 'alice', text: 'Has anyone reviewed the Token Vault integration?', timestamp: '2026-03-25T10:14:00Z' },
  { id: 'msg_002', user: 'bob', text: 'Yes! The async-auth suspend/resume is really elegant.', timestamp: '2026-03-25T10:16:00Z' },
  { id: 'msg_003', user: 'carol', text: 'Demo is set for tomorrow — bridgekeeper.vercel.app 🚀', timestamp: '2026-03-25T10:18:00Z' },
];

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface SlackChannel {
  id: string;
  name: string;
  memberCount: number;
  isPrivate: boolean;
}

export interface SlackMessage {
  id: string;
  user: string;
  text: string;
  timestamp: string;
}

export interface SendSlackMessageParams {
  channel: string;
  text: string;
  threadTs?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Provider Functions
// ─────────────────────────────────────────────────────────────────────────────

export async function listSlackChannels(token: string): Promise<SlackChannel[]> {
  if (USE_MOCK) { await simulateLatency(); return MOCK_CHANNELS; }

  const res = await fetch('https://slack.com/api/conversations.list?exclude_archived=true&limit=100', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Slack API error: ${res.status}`);
  const data = (await res.json()) as { ok: boolean; channels: Array<{ id: string; name: string; num_members: number; is_private: boolean }>; error?: string };
  if (!data.ok) throw new Error(`Slack error: ${data.error}`);
  return data.channels.map((c) => ({ id: c.id, name: c.name, memberCount: c.num_members, isPrivate: c.is_private }));
}

export async function listSlackMessages(token: string, channelId: string, limit = 20): Promise<SlackMessage[]> {
  if (USE_MOCK) { await simulateLatency(); return MOCK_MESSAGES; }

  const res = await fetch(`https://slack.com/api/conversations.history?channel=${channelId}&limit=${limit}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Slack history error: ${res.status}`);
  const data = (await res.json()) as { ok: boolean; messages: Array<{ client_msg_id: string; user: string; text: string; ts: string }>; error?: string };
  if (!data.ok) throw new Error(`Slack error: ${data.error}`);
  return data.messages.map((m) => ({ id: m.client_msg_id ?? m.ts, user: m.user, text: m.text, timestamp: new Date(parseFloat(m.ts) * 1000).toISOString() }));
}

/**
 * Send a message to a Slack channel.
 * ⚠️ HIGH-RISK: Always requires step-up authentication.
 */
export async function sendSlackMessage(token: string, params: SendSlackMessageParams): Promise<{ ts: string; channel: string }> {
  if (USE_MOCK) {
    await simulateLatency(400);
    return { ts: String(Date.now() / 1000), channel: params.channel };
  }

  const body: Record<string, string> = { channel: params.channel, text: params.text };
  if (params.threadTs) body.thread_ts = params.threadTs;

  const res = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Slack send error: ${res.status}`);
  const data = (await res.json()) as { ok: boolean; ts: string; channel: string; error?: string };
  if (!data.ok) throw new Error(`Slack error: ${data.error}`);
  return { ts: data.ts, channel: data.channel };
}

function simulateLatency(ms = 300): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
