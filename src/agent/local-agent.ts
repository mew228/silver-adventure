/**
 * agent/local-agent.ts
 * Local Intent Agent — uses Claude claude-sonnet-4-20250514 for rich intent decomposition.
 *
 * This is Layer 1 of Bridgekeeper: a SANDBOXED AI that only produces
 * structured capability plans. It NEVER holds tokens, NEVER calls
 * provider APIs, and communicates ONLY via JSON with the bridge.
 */

import Anthropic from '@anthropic-ai/sdk';
import { v4 as uuidv4 } from 'uuid';
import { SYSTEM_PROMPT, PLAN_USER_TEMPLATE } from './prompts';
import { CapabilityPlan, getActionRisk } from '../bridge/policy';
import { decomposePlan, PlanRequest, PlanResponse } from '../bridge/planner';

// ─────────────────────────────────────────────────────────────────────────────
// Local Agent Class
// ─────────────────────────────────────────────────────────────────────────────

class LocalAgent {
  private client: Anthropic | null = null;

  private getClient(): Anthropic {
    if (!this.client) {
      if (!process.env.ANTHROPIC_API_KEY) {
        throw new Error('ANTHROPIC_API_KEY not set — using keyword planner fallback');
      }
      this.client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    }
    return this.client;
  }

  /**
   * Decompose a user goal into a CapabilityPlan[] using Claude.
   *
   * Falls back to the keyword planner if AI is unavailable.
   * The local agent is SANDBOXED — it cannot call APIs, only produces plans.
   */
  async planFromGoal(request: PlanRequest): Promise<PlanResponse> {
    try {
      const client = this.getClient();

      const message = await client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: PLAN_USER_TEMPLATE(request.goal, request.providers, request.posture),
          },
        ],
      });

      const content = message.content[0];
      if (content.type !== 'text') {
        throw new Error('Unexpected response type from Claude');
      }

      // Parse and validate the JSON response
      const parsed = this.parseAgentResponse(content.text, request);
      return parsed;
    } catch (err) {
      // Graceful fallback to keyword planner
      console.warn('[LocalAgent] AI unavailable, using keyword planner:', err instanceof Error ? err.message : err);
      return decomposePlan(request);
    }
  }

  /**
   * Parse and validate the agent's JSON response into a PlanResponse.
   */
  private parseAgentResponse(text: string, request: PlanRequest): PlanResponse {
    // Extract JSON from potential markdown code blocks
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/) ?? [null, text];
    const jsonText = jsonMatch[1]?.trim() ?? text.trim();

    let parsed: { capabilities?: unknown[] };
    try {
      parsed = JSON.parse(jsonText) as { capabilities?: unknown[] };
    } catch {
      throw new Error('Agent returned invalid JSON');
    }

    if (!Array.isArray(parsed.capabilities)) {
      throw new Error('Agent response missing capabilities array');
    }

    // Validate and sanitize each capability
    const capabilities: CapabilityPlan[] = (parsed.capabilities as Array<Record<string, unknown>>).map((cap) => {
      const action = String(cap.action ?? 'read_all');
      const riskLevel = getActionRisk(action);
      const requiresStepUp =
        riskLevel === 'HIGH' ||
        riskLevel === 'CRITICAL' ||
        action.includes('send') ||
        action.includes('delete') ||
        action.includes('publish');

      return {
        id: uuidv4(),
        provider: String(cap.provider ?? 'gmail'),
        action,
        category: (cap.category as 'read' | 'write' | 'send' | 'delete' | 'publish' | 'admin') ?? 'read',
        parameters: (cap.parameters as Record<string, unknown>) ?? {},
        estimatedRisk: riskLevel,
        requiresStepUp,
      };
    });

    return {
      planId: uuidv4(),
      goal: request.goal,
      posture: request.posture,
      capabilities,
      estimatedDuration: capabilities.length * 2,
      createdAt: new Date().toISOString(),
    };
  }
}

export const localAgent = new LocalAgent();
