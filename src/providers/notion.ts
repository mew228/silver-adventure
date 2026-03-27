/**
 * providers/notion.ts
 * Notion provider — list and create pages via Notion API.
 * Uses short-lived tokens from Auth0 Token Vault.
 *
 * Note: intentionally NOT pre-seeded in mock mode to demonstrate async-auth flow.
 */

const USE_MOCK = process.env.MOCK_PROVIDERS === 'true';

// ─────────────────────────────────────────────────────────────────────────────
// Mock Data
// ─────────────────────────────────────────────────────────────────────────────

const MOCK_NOTION_PAGES = [
  { id: 'page_001', title: 'Bridgekeeper Architecture Notes', url: 'https://notion.so/mock/arch', lastEdited: '2026-03-25T10:00:00Z' },
  { id: 'page_002', title: 'Hackathon Submission Checklist', url: 'https://notion.so/mock/checklist', lastEdited: '2026-03-24T09:00:00Z' },
  { id: 'page_003', title: 'Auth0 Token Vault Research', url: 'https://notion.so/mock/vault', lastEdited: '2026-03-23T08:00:00Z' },
];

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface NotionPage {
  id: string;
  title: string;
  url: string;
  lastEdited: string;
}

export interface CreateNotionPageParams {
  parentPageId?: string;
  databaseId?: string;
  title: string;
  content?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Provider Functions
// ─────────────────────────────────────────────────────────────────────────────

export async function listNotionPages(token: string): Promise<NotionPage[]> {
  if (USE_MOCK) { await simulateLatency(); return MOCK_NOTION_PAGES; }

  const res = await fetch('https://api.notion.com/v1/search', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' },
    body: JSON.stringify({ filter: { value: 'page', property: 'object' }, sort: { direction: 'descending', timestamp: 'last_edited_time' }, page_size: 20 }),
  });
  if (!res.ok) throw new Error(`Notion API error: ${res.status}`);
  const data = (await res.json()) as { results: Array<{ id: string; url: string; last_edited_time: string; properties?: Record<string, { title?: Array<{ plain_text: string }> }>; title?: Array<{ plain_text: string }> }> };
  return data.results.map((p) => {
    const titleArr = p.properties?.title?.title ?? p.title ?? [];
    const title = titleArr.map((t) => t.plain_text).join('') || '(Untitled)';
    return { id: p.id, title, url: p.url, lastEdited: p.last_edited_time };
  });
}

export async function createNotionPage(token: string, params: CreateNotionPageParams): Promise<NotionPage> {
  if (USE_MOCK) {
    await simulateLatency(600);
    return { id: `mock_${Date.now()}`, title: params.title, url: `https://notion.so/mock/${Date.now()}`, lastEdited: new Date().toISOString() };
  }

  const parent = params.databaseId
    ? { database_id: params.databaseId }
    : { page_id: params.parentPageId ?? '' };

  const body = {
    parent,
    properties: { title: { title: [{ text: { content: params.title } }] } },
    children: params.content
      ? [{ object: 'block', type: 'paragraph', paragraph: { rich_text: [{ type: 'text', text: { content: params.content } }] } }]
      : [],
  };

  const res = await fetch('https://api.notion.com/v1/pages', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Notion create error: ${res.status}`);
  const data = (await res.json()) as { id: string; url: string; last_edited_time: string };
  return { id: data.id, title: params.title, url: data.url, lastEdited: data.last_edited_time };
}

function simulateLatency(ms = 300): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
