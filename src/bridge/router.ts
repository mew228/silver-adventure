/**
 * bridge/router.ts
 * Express routes for the Bridgekeeper API.
 *
 * Routes:
 *   POST /api/plan          — decompose user intent into capability plan
 *   POST /api/execute       — execute a capability plan (creates a job)
 *   GET  /api/jobs/:id      — poll job status
 *   GET  /api/jobs          — list recent jobs
 *   GET  /api/audit         — last 10 audit events
 *   POST /api/stepup/approve — approve a step-up challenge (demo)
 *   POST /api/stepup/deny   — deny a step-up challenge (demo)
 *   GET  /api/connections   — list provider connections for demo user
 */

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { decomposePlan, PlanRequest } from './planner';
import { createJob, executeJob, getJob, listRecentJobs, resumeJobAfterStepUp, resumeJobAfterAsyncAuth } from './executor';
import { getRecentAuditEvents } from './audit';
import { approveStepUpChallenge, denyStepUpChallenge, getChallenge } from '../vault/stepup';
import { mockCompleteAsyncAuth, getAsyncAuthRequest } from '../vault/async-auth';
import { vaultClient } from '../vault/client';
import { localAgent } from '../agent/local-agent';

export const router = Router();

// ─────────────────────────────────────────────────────────────────────────────
// Validation Schemas (Zod)
// ─────────────────────────────────────────────────────────────────────────────

const PlanRequestSchema = z.object({
  goal: z.string().min(1).max(500),
  providers: z.array(z.enum(['gmail', 'calendar', 'github', 'jira', 'notion', 'slack'])).default([]),
  posture: z.enum(['LOW', 'MEDIUM', 'HIGH']).default('MEDIUM'),
  userId: z.string().default('demo-user'),
  useAgent: z.boolean().default(false),
});

const ExecuteRequestSchema = z.object({
  planId: z.string().optional(),
  goal: z.string().min(1).max(500),
  providers: z.array(z.enum(['gmail', 'calendar', 'github', 'jira', 'notion', 'slack'])).default([]),
  posture: z.enum(['LOW', 'MEDIUM', 'HIGH']).default('MEDIUM'),
  userId: z.string().default('demo-user'),
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/plan
// ─────────────────────────────────────────────────────────────────────────────

router.post('/plan', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = PlanRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() });
      return;
    }

    const { goal, providers, posture, userId, useAgent } = parsed.data;
    const planRequest: PlanRequest = { goal, providers, posture, userId };

    let plan;
    if (useAgent && process.env.ANTHROPIC_API_KEY) {
      // Use AI agent for richer intent decomposition
      try {
        plan = await localAgent.planFromGoal(planRequest);
      } catch {
        // Fall back to keyword planner if AI fails
        plan = decomposePlan(planRequest);
      }
    } else {
      plan = decomposePlan(planRequest);
    }

    res.json(plan);
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/execute
// ─────────────────────────────────────────────────────────────────────────────

router.post('/execute', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = ExecuteRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() });
      return;
    }

    const { goal, providers, posture, userId } = parsed.data;

    // Decompose plan
    const plan = decomposePlan({ goal, providers, posture, userId });

    // Create and start job (fire-and-forget)
    const job = createJob(userId, goal, posture, plan.capabilities);
    void executeJob(job.id); // async, don't await

    res.status(202).json({
      jobId: job.id,
      status: job.status,
      plan,
      message: 'Job created and executing. Poll /api/jobs/:id for status.',
    });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/jobs/:id
// ─────────────────────────────────────────────────────────────────────────────

router.get('/jobs/:id', (req: Request, res: Response, next: NextFunction) => {
  try {
    const job = getJob(req.params.id);
    if (!job) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }

    // Enrich with pending auth details for UI
    let response: Record<string, unknown> = { ...job };

    if (job.status === 'suspended_stepup' && job.pendingStepUpChallengeId) {
      const challenge = getChallenge(job.pendingStepUpChallengeId);
      response = {
        ...response,
        requiresStepUp: true,
        stepUpDetails: challenge,
      };
    }

    if (job.status === 'suspended_async_auth' && job.pendingAsyncAuthRequestId) {
      const authReq = getAsyncAuthRequest(job.pendingAsyncAuthRequestId);
      response = {
        ...response,
        requiresAsyncAuth: true,
        asyncAuthDetails: authReq,
      };
    }

    res.json(response);
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/jobs
// ─────────────────────────────────────────────────────────────────────────────

router.get('/jobs', (_req: Request, res: Response) => {
  res.json(listRecentJobs(20));
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/audit
// ─────────────────────────────────────────────────────────────────────────────

router.get('/audit', (_req: Request, res: Response) => {
  res.json(getRecentAuditEvents(10));
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/stepup/approve
// ─────────────────────────────────────────────────────────────────────────────

router.post('/stepup/approve', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { challengeId } = z.object({ challengeId: z.string() }).parse(req.body);
    const challenge = await approveStepUpChallenge(challengeId);

    if (!challenge) {
      res.status(404).json({ error: 'Challenge not found' });
      return;
    }

    // Resume the job
    if (challenge.status === 'approved') {
      void resumeJobAfterStepUp(challenge.jobId);
    }

    res.json({ challenge, message: 'Step-up approved — job resuming' });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/stepup/deny
// ─────────────────────────────────────────────────────────────────────────────

router.post('/stepup/deny', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { challengeId } = z.object({ challengeId: z.string() }).parse(req.body);
    const challenge = await denyStepUpChallenge(challengeId);
    res.json({ challenge, message: 'Step-up denied — job cancelled' });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/async-auth/complete (mock demo)
// ─────────────────────────────────────────────────────────────────────────────

router.post('/async-auth/complete', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { requestId } = z.object({ requestId: z.string() }).parse(req.body);
    const authRequest = await mockCompleteAsyncAuth(requestId);

    if (!authRequest) {
      res.status(404).json({ error: 'Auth request not found or expired' });
      return;
    }

    // Resume the job
    if (authRequest.status === 'completed') {
      void resumeJobAfterAsyncAuth(authRequest.jobId);
    }

    res.json({ authRequest, message: 'Auth completed — job resuming' });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/connections
// ─────────────────────────────────────────────────────────────────────────────

router.get('/connections', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req.query.userId as string) ?? 'demo-user';
    const connections = await vaultClient.listConnections(userId);
    res.json(connections);
  } catch (err) {
    next(err);
  }
});
