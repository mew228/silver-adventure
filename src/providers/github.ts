/**
 * providers/github.ts
 * GitHub provider — list repos, issues, PRs via GitHub REST API.
 * Uses short-lived tokens from Auth0 Token Vault.
 */

const USE_MOCK = process.env.MOCK_PROVIDERS === 'true';

// ─────────────────────────────────────────────────────────────────────────────
// Mock Data
// ─────────────────────────────────────────────────────────────────────────────

const MOCK_REPOS: GitHubRepo[] = [
  { id: 'repo_001', name: 'bridgekeeper', fullName: 'demo/bridgekeeper', isPrivate: false, stars: 42, openIssues: 3 },
  { id: 'repo_002', name: 'auth0-token-vault-demo', fullName: 'demo/auth0-token-vault-demo', isPrivate: false, stars: 18, openIssues: 1 },
];

const MOCK_ISSUES: GitHubIssue[] = [
  { id: 'iss_001', number: 12, title: 'Implement async-auth suspend/resume', state: 'open', labels: ['enhancement', 'vault'], assignee: 'demo-user', createdAt: '2026-03-20T10:00:00Z' },
  { id: 'iss_002', number: 11, title: 'Add step-up consent modal to UI', state: 'open', labels: ['ui', 'security'], assignee: 'demo-user', createdAt: '2026-03-19T09:00:00Z' },
  { id: 'iss_003', number: 10, title: 'Write architecture.md', state: 'closed', labels: ['docs'], assignee: 'demo-user', createdAt: '2026-03-18T08:00:00Z' },
];

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface GitHubRepo {
  id: string;
  name: string;
  fullName: string;
  isPrivate: boolean;
  stars: number;
  openIssues: number;
}

export interface GitHubIssue {
  id: string;
  number: number;
  title: string;
  state: 'open' | 'closed';
  labels: string[];
  assignee: string;
  createdAt: string;
}

export interface CreateIssueParams {
  repo: string;
  title: string;
  body?: string;
  labels?: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Provider Functions
// ─────────────────────────────────────────────────────────────────────────────

export async function listGitHubRepos(token: string): Promise<GitHubRepo[]> {
  if (USE_MOCK) { await simulateLatency(); return MOCK_REPOS; }

  const res = await fetch('https://api.github.com/user/repos?sort=updated&per_page=20', {
    headers: { Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28' },
  });
  if (!res.ok) throw new Error(`GitHub API error: ${res.status}`);
  const data = (await res.json()) as Array<{ id: number; name: string; full_name: string; private: boolean; stargazers_count: number; open_issues_count: number }>;
  return data.map((r) => ({ id: String(r.id), name: r.name, fullName: r.full_name, isPrivate: r.private, stars: r.stargazers_count, openIssues: r.open_issues_count }));
}

export async function listGitHubIssues(token: string, repo: string): Promise<GitHubIssue[]> {
  if (USE_MOCK) { await simulateLatency(); return MOCK_ISSUES; }

  const res = await fetch(`https://api.github.com/repos/${repo}/issues?state=open&per_page=20`, {
    headers: { Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28' },
  });
  if (!res.ok) throw new Error(`GitHub issues error: ${res.status}`);
  const data = (await res.json()) as Array<{ id: number; number: number; title: string; state: string; labels: Array<{ name: string }>; assignee: { login: string } | null; created_at: string }>;
  return data.map((i) => ({ id: String(i.id), number: i.number, title: i.title, state: i.state as 'open' | 'closed', labels: i.labels.map((l) => l.name), assignee: i.assignee?.login ?? '', createdAt: i.created_at }));
}

export async function createGitHubIssue(token: string, params: CreateIssueParams): Promise<GitHubIssue> {
  if (USE_MOCK) {
    await simulateLatency(600);
    return { id: `mock_${Date.now()}`, number: Math.floor(Math.random() * 100) + 50, title: params.title, state: 'open', labels: params.labels ?? [], assignee: 'demo-user', createdAt: new Date().toISOString() };
  }

  const res = await fetch(`https://api.github.com/repos/${params.repo}/issues`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-GitHub-Api-Version': '2022-11-28' },
    body: JSON.stringify({ title: params.title, body: params.body, labels: params.labels }),
  });
  if (!res.ok) throw new Error(`GitHub create issue error: ${res.status}`);
  const data = (await res.json()) as { id: number; number: number; title: string; state: string; labels: Array<{ name: string }>; assignee: { login: string } | null; created_at: string };
  return { id: String(data.id), number: data.number, title: data.title, state: data.state as 'open' | 'closed', labels: data.labels.map((l) => l.name), assignee: data.assignee?.login ?? '', createdAt: data.created_at };
}

function simulateLatency(ms = 300): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
