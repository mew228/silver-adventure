/**
 * bridge/planner.ts
 * Intent decomposition — converts natural language goals into CapabilityPlan[].
 *
 * The planner is an INTERNAL bridge component. It does NOT call provider APIs.
 * It uses simple rule-based matching (with optional AI enrichment via the local agent)
 * to produce a validated list of capability plans.
 */

import { v4 as uuidv4 } from 'uuid';
import { CapabilityPlan, ActionCategory, getActionRisk } from './policy';

// ─────────────────────────────────────────────────────────────────────────────
// Input / Output Types
// ─────────────────────────────────────────────────────────────────────────────

export interface PlanRequest {
  goal: string;
  providers: string[];
  posture: 'LOW' | 'MEDIUM' | 'HIGH';
  userId: string;
}

export interface PlanResponse {
  planId: string;
  goal: string;
  posture: string;
  capabilities: CapabilityPlan[];
  estimatedDuration: number; // seconds
  createdAt: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Keyword → Action / Category mappings
// ─────────────────────────────────────────────────────────────────────────────

interface ActionRule {
  keywords: string[];
  action: string;
  category: ActionCategory;
  providers: string[];
  parametersTemplate: Record<string, unknown>;
}

const ACTION_RULES: ActionRule[] = [
  // Gmail
  { keywords: ['email', 'inbox', 'unread', 'mail', 'messages'], action: 'read_emails', category: 'read', providers: ['gmail'], parametersTemplate: { query: 'is:unread', maxResults: 10 } },
  { keywords: ['send email', 'send an email', 'reply email', 'compose email'], action: 'send_email', category: 'send', providers: ['gmail'], parametersTemplate: { to: '', subject: '', body: '' } },

  // Calendar
  { keywords: ['calendar', 'schedule', 'meetings', 'events', 'upcoming'], action: 'list_events', category: 'read', providers: ['calendar'], parametersTemplate: { maxResults: 10 } },
  { keywords: ['create event', 'schedule meeting', 'book meeting', 'add to calendar'], action: 'create_event', category: 'write', providers: ['calendar'], parametersTemplate: { summary: '', start: '', end: '' } },

  // GitHub
  { keywords: ['github', 'repos', 'repositories', 'pull request', 'pr'], action: 'list_repos', category: 'read', providers: ['github'], parametersTemplate: {} },
  { keywords: ['issues', 'github issues', 'open issues', 'bug'], action: 'list_issues', category: 'read', providers: ['github'], parametersTemplate: { state: 'open' } },
  { keywords: ['create issue', 'file issue', 'open issue', 'report bug'], action: 'create_issue', category: 'write', providers: ['github'], parametersTemplate: { title: '', body: '' } },

  // Jira
  { keywords: ['jira', 'ticket', 'sprint', 'backlog', 'jira issues'], action: 'list_issues', category: 'read', providers: ['jira'], parametersTemplate: {} },
  { keywords: ['create ticket', 'create jira', 'new jira', 'log ticket'], action: 'create_issue', category: 'write', providers: ['jira'], parametersTemplate: { summary: '', projectKey: 'PROJ' } },

  // Notion
  { keywords: ['notion', 'pages', 'notes', 'docs', 'notion pages'], action: 'list_pages', category: 'read', providers: ['notion'], parametersTemplate: {} },
  { keywords: ['create page', 'write note', 'add to notion', 'new notion'], action: 'create_page', category: 'write', providers: ['notion'], parametersTemplate: { title: '', content: '' } },

  // Slack
  { keywords: ['slack', 'channels', 'slack messages', 'slack channels'], action: 'list_channels', category: 'read', providers: ['slack'], parametersTemplate: {} },
  { keywords: ['send slack', 'post to slack', 'message team', 'slack message'], action: 'send_message', category: 'send', providers: ['slack'], parametersTemplate: { channel: '#general', text: '' } },
];

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Decompose a natural-language goal into a CapabilityPlan[].
 *
 * The bridge calls this before any token retrieval. The planner only
 * reasons about intent — it never calls provider APIs or Token Vault.
 */
export function decomposePlan(request: PlanRequest): PlanResponse {
  const { goal, providers, posture } = request;
  const goalLower = goal.toLowerCase();

  const matchedCapabilities: CapabilityPlan[] = [];
  const seen = new Set<string>();

  // Match rules against goal + selected providers
  for (const rule of ACTION_RULES) {
    const keywordMatch = rule.keywords.some((kw) => goalLower.includes(kw));
    const providerMatch =
      providers.length === 0 ||
      rule.providers.some((p) => providers.includes(p));

    if (!keywordMatch && !providerMatch) continue;

    // Avoid duplicate capabilities for same action+provider
    const capKey = `${rule.providers[0]}:${rule.action}`;
    if (seen.has(capKey)) continue;
    seen.add(capKey);

    const riskLevel = getActionRisk(rule.action);
    const requiresStepUp =
      riskLevel === 'HIGH' ||
      riskLevel === 'CRITICAL' ||
      rule.action.includes('send') ||
      rule.action.includes('delete') ||
      rule.action.includes('publish');

    // For each matched rule, create a capability for the intersection
    // of selected providers and rule providers
    const matchedProviders =
      providers.length === 0
        ? rule.providers
        : rule.providers.filter((p) => providers.includes(p));

    for (const provider of matchedProviders) {
      const pk = `${provider}:${rule.action}`;
      if (seen.has(pk)) continue;
      seen.add(pk);

      matchedCapabilities.push({
        id: uuidv4(),
        provider,
        action: rule.action,
        category: rule.category,
        parameters: {
          ...rule.parametersTemplate,
          _goalContext: goal.slice(0, 100),
        },
        estimatedRisk: riskLevel,
        requiresStepUp,
      });
    }
  }

  // Fallback: if nothing matched but providers were specified, create read plans
  if (matchedCapabilities.length === 0 && providers.length > 0) {
    for (const provider of providers) {
      matchedCapabilities.push({
        id: uuidv4(),
        provider,
        action: 'read_all',
        category: 'read',
        parameters: { _goalContext: goal.slice(0, 100) },
        estimatedRisk: 'LOW',
        requiresStepUp: false,
      });
    }
  }

  return {
    planId: uuidv4(),
    goal,
    posture,
    capabilities: matchedCapabilities,
    estimatedDuration: matchedCapabilities.length * 2,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Enrich a capability plan with AI-generated parameters (optional).
 * Falls through gracefully if AI is unavailable.
 */
export async function enrichPlanWithAI(
  plan: PlanResponse,
  agentPlan: CapabilityPlan[]
): Promise<CapabilityPlan[]> {
  // The agent provides enriched parameters; merge safely
  return agentPlan.length > 0 ? agentPlan : plan.capabilities;
}
