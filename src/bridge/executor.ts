/**
 * bridge/executor.ts
 * Orchestrates capability execution with risk checks and Token Vault integration.
 *
 * The executor is the only component that calls Token Vault and provider APIs.
 * Before every provider call it:
 *   1. Evaluates the capability against policy.ts
 *   2. Retrieves a fresh token from Vault (delegated.ts)
 *   3. Issues step-up challenges for HIGH-risk actions (stepup.ts)
 *   4. Initiates async-auth for unlinked providers (async-auth.ts)
 *   5. Writes BEFORE and AFTER audit events (audit.ts)
 */

import { v4 as uuidv4 } from 'uuid';
import { CapabilityPlan, evaluateCapability, RiskPosture } from './policy';
import { emitAudit, auditProviderBefore, auditProviderAfter, auditCapabilityBlocked } from './audit';
import { getTokenForProvider } from '../vault/delegated';
import { initiateAsyncAuth } from '../vault/async-auth';
import { issueStepUpChallenge } from '../vault/stepup';
import { Provider } from '../vault/client';

// Providers
import { readGmailThreads, sendGmailEmail } from '../providers/gmail';
import { listCalendarEvents, createCalendarEvent } from '../providers/calendar';
import { listGitHubRepos, listGitHubIssues, createGitHubIssue } from '../providers/github';
import { listJiraIssues, createJiraIssue } from '../providers/jira';
import { listNotionPages, createNotionPage } from '../providers/notion';
import { listSlackChannels, listSlackMessages, sendSlackMessage } from '../providers/slack';

// ─────────────────────────────────────────────────────────────────────────────
// Job Store (in-memory, Redis-replaceable)
// ─────────────────────────────────────────────────────────────────────────────

export type JobStatus =
  | 'pending'
  | 'running'
  | 'suspended_stepup'
  | 'suspended_async_auth'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface Job {
  id: string;
  userId: string;
  goal: string;
  posture: RiskPosture;
  capabilities: CapabilityPlan[];
  status: JobStatus;
  results: Record<string, unknown>;
  pendingStepUpChallengeId?: string;
  pendingAsyncAuthRequestId?: string;
  pendingProvider?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

const jobStore: Map<string, Job> = new Map();

// ─────────────────────────────────────────────────────────────────────────────
// Job Management
// ─────────────────────────────────────────────────────────────────────────────

export function createJob(
  userId: string,
  goal: string,
  posture: RiskPosture,
  capabilities: CapabilityPlan[]
): Job {
  const job: Job = {
    id: uuidv4(),
    userId,
    goal,
    posture,
    capabilities,
    status: 'pending',
    results: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  jobStore.set(job.id, job);
  emitAudit('job.created', { jobId: job.id, userId, message: `Job created: ${goal}` });
  return job;
}

export function getJob(jobId: string): Job | undefined {
  return jobStore.get(jobId);
}

export function listRecentJobs(limit = 20): Job[] {
  return Array.from(jobStore.values())
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, limit);
}

function updateJob(jobId: string, updates: Partial<Job>): Job {
  const job = jobStore.get(jobId);
  if (!job) throw new Error(`Job not found: ${jobId}`);
  const updated = { ...job, ...updates, updatedAt: new Date().toISOString() };
  jobStore.set(jobId, updated);
  return updated;
}

// ─────────────────────────────────────────────────────────────────────────────
// Execution Engine
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Execute a job's capabilities in sequence.
 * Runs asynchronously (fire-and-forget from router).
 */
export async function executeJob(jobId: string): Promise<void> {
  const job = getJob(jobId);
  if (!job) return;

  updateJob(jobId, { status: 'running' });
  emitAudit('job.created', { jobId, userId: job.userId, message: 'Job execution started' });

  for (const capability of job.capabilities) {
    const currentJob = getJob(jobId)!;

    // Abort if job was cancelled or suspended
    if (
      currentJob.status === 'cancelled' ||
      currentJob.status === 'suspended_stepup' ||
      currentJob.status === 'suspended_async_auth'
    ) {
      return;
    }

    try {
      await executeCapability(jobId, job.userId, capability, job.posture);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Check if we suspended (not a real error)
      const updatedJob = getJob(jobId)!;
      if (
        updatedJob.status === 'suspended_stepup' ||
        updatedJob.status === 'suspended_async_auth'
      ) {
        return;
      }
      updateJob(jobId, { status: 'failed', error: msg });
      emitAudit('job.failed', { jobId, userId: job.userId, message: msg });
      return;
    }
  }

  updateJob(jobId, { status: 'completed', completedAt: new Date().toISOString() });
  emitAudit('job.completed', { jobId, userId: job.userId, message: 'All capabilities executed' });
}

/**
 * Execute a single capability within a job.
 */
async function executeCapability(
  jobId: string,
  userId: string,
  capability: CapabilityPlan,
  posture: RiskPosture
): Promise<void> {
  const { provider, action } = capability;

  // ── 1. Policy check ───────────────────────────────────────────────────────
  const decision = evaluateCapability(capability, posture);

  if (!decision.allowed) {
    auditCapabilityBlocked(jobId, userId, provider, action, decision.reason ?? 'Policy blocked');
    return; // skip, don't fail the whole job
  }

  // ── 2. Step-up check (HIGH-risk actions) ──────────────────────────────────
  if (decision.requiresStepUp) {
    const challenge = await issueStepUpChallenge(jobId, userId, action, provider);
    updateJob(jobId, {
      status: 'suspended_stepup',
      pendingStepUpChallengeId: challenge.challengeId,
    });
    emitAudit('capability.stepup_required', {
      jobId,
      userId,
      provider,
      action,
      outcome: 'pending',
      message: `Step-up required — job suspended`,
    });
    throw new Error('STEP_UP_REQUIRED');
  }

  // ── 3. Token retrieval from Vault (never cached in process) ───────────────
  const vaultToken = await getTokenForProvider(userId, provider as Provider);

  if (!vaultToken) {
    // Provider not connected → initiate async-auth
    const authRequest = await initiateAsyncAuth(jobId, userId, provider as Provider);
    updateJob(jobId, {
      status: 'suspended_async_auth',
      pendingAsyncAuthRequestId: authRequest.requestId,
      pendingProvider: provider,
    });
    emitAudit('capability.async_auth_required', {
      jobId,
      userId,
      provider,
      action,
      outcome: 'pending',
      message: `Provider not connected — async-auth initiated`,
      data: { authUrl: authRequest.authUrl, requestId: authRequest.requestId },
    });
    throw new Error('ASYNC_AUTH_REQUIRED');
  }

  // ── 4. Provider API call (BEFORE audit) ───────────────────────────────────
  auditProviderBefore(jobId, userId, provider, action, decision.riskLevel);

  const start = Date.now();
  let result: unknown;

  try {
    result = await dispatchProviderCall(provider, action, vaultToken.accessToken, capability.parameters);
  } catch (err) {
    auditProviderAfter(jobId, userId, provider, action, Date.now() - start, false);
    throw err;
  }

  // ── 5. AFTER audit ────────────────────────────────────────────────────────
  auditProviderAfter(jobId, userId, provider, action, Date.now() - start, true);

  // Store result in job
  const job = getJob(jobId)!;
  updateJob(jobId, {
    results: {
      ...job.results,
      [`${provider}:${action}`]: result,
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Provider Dispatch Table
// ─────────────────────────────────────────────────────────────────────────────

async function dispatchProviderCall(
  provider: string,
  action: string,
  token: string,
  params: Record<string, unknown>
): Promise<unknown> {
  switch (`${provider}:${action}`) {
    // Gmail
    case 'gmail:read_emails':
    case 'gmail:list_threads':
    case 'gmail:read_all':
    case 'gmail:list_emails':
      return readGmailThreads(token, (params.query as string) ?? 'is:unread');
    case 'gmail:send_email':
    case 'gmail:reply_email':
    case 'gmail:send':
      return sendGmailEmail(token, { to: (params.to as string) ?? '', subject: (params.subject as string) ?? '', body: (params.body as string) ?? '' });

    // Calendar
    case 'calendar:list_events':
    case 'calendar:read_all':
      return listCalendarEvents(token, (params.maxResults as number) ?? 10);
    case 'calendar:create_event':
      return createCalendarEvent(token, { summary: (params.summary as string) ?? 'New Event', start: (params.start as string) ?? new Date().toISOString(), end: (params.end as string) ?? new Date().toISOString() });

    // GitHub
    case 'github:list_repos':
    case 'github:read_all':
      return listGitHubRepos(token);
    case 'github:list_issues':
      return listGitHubIssues(token, (params.repo as string) ?? '');
    case 'github:create_issue':
      return createGitHubIssue(token, { repo: (params.repo as string) ?? 'demo/repo', title: (params.title as string) ?? 'New Issue', body: params.body as string });

    // Jira
    case 'jira:list_issues':
    case 'jira:read_all':
      return listJiraIssues(token, params.projectKey as string);
    case 'jira:create_issue':
      return createJiraIssue(token, { projectKey: (params.projectKey as string) ?? 'PROJ', summary: (params.summary as string) ?? 'New Ticket' });

    // Notion
    case 'notion:list_pages':
    case 'notion:read_all':
      return listNotionPages(token);
    case 'notion:create_page':
      return createNotionPage(token, { title: (params.title as string) ?? 'New Page', content: params.content as string });

    // Slack
    case 'slack:list_channels':
    case 'slack:read_all':
      return listSlackChannels(token);
    case 'slack:list_messages':
      return listSlackMessages(token, (params.channelId as string) ?? '');
    case 'slack:send_message':
    case 'slack:send':
      return sendSlackMessage(token, { channel: (params.channel as string) ?? '#general', text: (params.text as string) ?? '' });

    default:
      throw new Error(`Unknown provider action: ${provider}:${action}`);
  }
}

/**
 * Resume a job after step-up approval.
 */
export async function resumeJobAfterStepUp(jobId: string): Promise<void> {
  const job = getJob(jobId);
  if (!job || job.status !== 'suspended_stepup') return;

  updateJob(jobId, {
    status: 'running',
    pendingStepUpChallengeId: undefined,
  });
  emitAudit('job.resumed', { jobId, userId: job.userId, message: 'Job resumed after step-up approval' });

  // Re-execute remaining capabilities (skip already completed ones)
  await executeJob(jobId);
}

/**
 * Resume a job after async-auth completion.
 */
export async function resumeJobAfterAsyncAuth(jobId: string): Promise<void> {
  const job = getJob(jobId);
  if (!job || job.status !== 'suspended_async_auth') return;

  updateJob(jobId, {
    status: 'running',
    pendingAsyncAuthRequestId: undefined,
    pendingProvider: undefined,
  });
  emitAudit('job.resumed', { jobId, userId: job.userId, message: 'Job resumed after async-auth completion' });

  await executeJob(jobId);
}
