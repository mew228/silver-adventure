/**
 * providers/jira.ts
 * Jira Cloud provider — list and create issues via Atlassian REST API.
 * Uses short-lived tokens from Auth0 Token Vault.
 *
 * Note: Jira and Notion are intentionally NOT pre-seeded in mock mode
 * to demonstrate the async-auth flow when the user selects them.
 */

const USE_MOCK = process.env.MOCK_PROVIDERS === 'true';

// ─────────────────────────────────────────────────────────────────────────────
// Mock Data
// ─────────────────────────────────────────────────────────────────────────────

const MOCK_JIRA_ISSUES = [
  { id: 'jira_001', key: 'BRIDGE-42', summary: 'Integrate Auth0 Token Vault', status: 'In Progress', priority: 'High', assignee: 'demo-user', created: '2026-03-20T10:00:00Z' },
  { id: 'jira_002', key: 'BRIDGE-43', summary: 'Write hackathon submission docs', status: 'To Do', priority: 'Medium', assignee: 'demo-user', created: '2026-03-21T09:00:00Z' },
  { id: 'jira_003', key: 'BRIDGE-44', summary: 'Record demo video', status: 'To Do', priority: 'High', assignee: 'demo-user', created: '2026-03-22T08:00:00Z' },
];

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface JiraIssue {
  id: string;
  key: string;
  summary: string;
  status: string;
  priority: string;
  assignee: string;
  created: string;
}

export interface CreateJiraIssueParams {
  projectKey: string;
  summary: string;
  description?: string;
  issueType?: string;
  priority?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Provider Functions
// ─────────────────────────────────────────────────────────────────────────────

export async function listJiraIssues(token: string, projectKey?: string): Promise<JiraIssue[]> {
  if (USE_MOCK) { await simulateLatency(); return MOCK_JIRA_ISSUES; }

  const cloudId = process.env.JIRA_CLOUD_ID ?? '';
  const jql = projectKey ? `project = ${projectKey} ORDER BY created DESC` : 'assignee = currentUser() ORDER BY created DESC';
  const res = await fetch(
    `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/search?jql=${encodeURIComponent(jql)}&maxResults=20`,
    { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } }
  );
  if (!res.ok) throw new Error(`Jira API error: ${res.status}`);
  const data = (await res.json()) as { issues: Array<{ id: string; key: string; fields: { summary: string; status: { name: string }; priority: { name: string }; assignee: { displayName: string } | null; created: string } }> };
  return data.issues.map((i) => ({ id: i.id, key: i.key, summary: i.fields.summary, status: i.fields.status.name, priority: i.fields.priority.name, assignee: i.fields.assignee?.displayName ?? '', created: i.fields.created }));
}

export async function createJiraIssue(token: string, params: CreateJiraIssueParams): Promise<JiraIssue> {
  if (USE_MOCK) {
    await simulateLatency(700);
    return { id: `mock_${Date.now()}`, key: `${params.projectKey}-${Math.floor(Math.random() * 100) + 100}`, summary: params.summary, status: 'To Do', priority: params.priority ?? 'Medium', assignee: 'demo-user', created: new Date().toISOString() };
  }

  const cloudId = process.env.JIRA_CLOUD_ID ?? '';
  const body = {
    fields: {
      project: { key: params.projectKey },
      summary: params.summary,
      description: params.description ? { type: 'doc', version: 1, content: [{ type: 'paragraph', content: [{ type: 'text', text: params.description }] }] } : undefined,
      issuetype: { name: params.issueType ?? 'Task' },
      priority: { name: params.priority ?? 'Medium' },
    },
  };
  const res = await fetch(
    `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/issue`,
    { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body) }
  );
  if (!res.ok) throw new Error(`Jira create error: ${res.status}`);
  const data = (await res.json()) as { id: string; key: string };
  return { id: data.id, key: data.key, summary: params.summary, status: 'To Do', priority: params.priority ?? 'Medium', assignee: 'demo-user', created: new Date().toISOString() };
}

function simulateLatency(ms = 300): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
