/**
 * providers/gmail.ts
 * Gmail provider — read threads, send emails via Google Gmail API.
 * Uses short-lived tokens from Auth0 Token Vault; never stores credentials.
 */

const USE_MOCK = process.env.MOCK_PROVIDERS === 'true';

// ─────────────────────────────────────────────────────────────────────────────
// Mock Data
// ─────────────────────────────────────────────────────────────────────────────

const MOCK_GMAIL_THREADS = [
  {
    id: 'thread_001',
    subject: 'Q2 Planning — Action Items',
    from: 'alice@example.com',
    snippet: 'Following up on the roadmap — could you review the attached doc?',
    date: '2026-03-25T09:14:00Z',
    unread: true,
  },
  {
    id: 'thread_002',
    subject: 'Invoice #4821 — Due Tomorrow',
    from: 'billing@vendor.io',
    snippet: 'Your invoice for $2,450 is due on March 26th.',
    date: '2026-03-24T15:30:00Z',
    unread: true,
  },
  {
    id: 'thread_003',
    subject: 'Re: Auth0 Hackathon Submission',
    from: 'devrel@auth0.com',
    snippet: "We'd love to feature your project — can you send a quick walk through?",
    date: '2026-03-23T11:00:00Z',
    unread: false,
  },
];

const MOCK_SEND_RESULT = {
  messageId: `mock_${Date.now()}`,
  status: 'sent',
  timestamp: new Date().toISOString(),
};

// ─────────────────────────────────────────────────────────────────────────────
// Provider Functions
// ─────────────────────────────────────────────────────────────────────────────

export interface GmailThread {
  id: string;
  subject: string;
  from: string;
  snippet: string;
  date: string;
  unread: boolean;
}

export interface SendEmailParams {
  to: string;
  subject: string;
  body: string;
  cc?: string;
}

/**
 * List Gmail threads matching a search query.
 * Minimum required scope: gmail.readonly
 */
export async function readGmailThreads(
  token: string,
  query = 'is:unread'
): Promise<GmailThread[]> {
  if (USE_MOCK) {
    await simulateLatency();
    return MOCK_GMAIL_THREADS;
  }

  // Real Gmail API call
  const listRes = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/threads?q=${encodeURIComponent(query)}&maxResults=10`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!listRes.ok) throw new Error(`Gmail API error: ${listRes.status}`);
  const listData = (await listRes.json()) as { threads?: Array<{ id: string }> };

  // Fetch thread metadata
  const threads = await Promise.all(
    (listData.threads ?? []).slice(0, 10).map(async (t) => {
      const res = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/threads/${t.id}?format=metadata&metadataHeaders=Subject,From,Date`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const data = (await res.json()) as {
        id: string;
        messages: Array<{
          payload: { headers: Array<{ name: string; value: string }> };
          snippet: string;
          labelIds: string[];
        }>;
      };
      const h = data.messages[0]?.payload.headers ?? [];
      const getH = (name: string) => h.find((x) => x.name === name)?.value ?? '';
      return {
        id: data.id,
        subject: getH('Subject'),
        from: getH('From'),
        snippet: data.messages[0]?.snippet ?? '',
        date: getH('Date'),
        unread: data.messages[0]?.labelIds.includes('UNREAD') ?? false,
      };
    })
  );

  return threads;
}

/**
 * Send an email via Gmail.
 * Minimum required scope: gmail.send
 * ⚠️ HIGH-RISK: Always requires step-up authentication.
 */
export async function sendGmailEmail(
  token: string,
  params: SendEmailParams
): Promise<{ messageId: string; status: string; timestamp: string }> {
  if (USE_MOCK) {
    await simulateLatency(800);
    return MOCK_SEND_RESULT;
  }

  const email = [
    `To: ${params.to}`,
    params.cc ? `Cc: ${params.cc}` : '',
    `Subject: ${params.subject}`,
    `Content-Type: text/plain; charset=utf-8`,
    '',
    params.body,
  ]
    .filter(Boolean)
    .join('\r\n');

  const encoded = Buffer.from(email).toString('base64url');

  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ raw: encoded }),
  });

  if (!res.ok) throw new Error(`Gmail send error: ${res.status}`);
  const data = (await res.json()) as { id: string };

  return {
    messageId: data.id,
    status: 'sent',
    timestamp: new Date().toISOString(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function simulateLatency(ms = 300): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
