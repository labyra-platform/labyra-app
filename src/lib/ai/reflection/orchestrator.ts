/**
 * Reflection orchestrator — runs T3 self-critic loop up to max iterations.
 * @phase R160-ai-4
 */
import { selectProvider } from '@/lib/ai/providers';
import { LABYRA_SYSTEM_PROMPT } from '@/lib/ai/system-prompt';
import { critiqueResponse } from './critic';
import type { ReflectionResult, ReflectionRound } from './types';
import type { AiCostBreakdown, AiMessage } from '@/types/ai';

const MAX_REFLECTION_ROUNDS = 3;

function emptyCost(): AiCostBreakdown {
  return {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    usd: 0
  };
}

function addCost(a: AiCostBreakdown, b: AiCostBreakdown): AiCostBreakdown {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    cacheReadTokens: a.cacheReadTokens + b.cacheReadTokens,
    cacheWriteTokens: a.cacheWriteTokens + b.cacheWriteTokens,
    usd: Number((a.usd + b.usd).toFixed(6))
  };
}

const REVISION_INSTRUCTION = `Above is your previous response and a critique of it.
Revise your response to address the specific issues raised. Keep what was correct,
fix what was flawed. Output ONLY the revised response, no meta-commentary about
the revision process.`;

interface ProviderEvent {
  type: 'text_delta' | 'message_complete' | 'error' | string;
  delta?: string;
  usage?: AiCostBreakdown;
  message?: string;
}

type StreamCallback = (event: ProviderEvent) => void;

interface RunOptions {
  userMessage: string;
  /** Called with text_delta events from the FINAL round only (live streaming UX) */
  onFinalDelta?: (delta: string) => void;
  /** Called when reflection moves to next round */
  onRoundStart?: (round: number) => void;
  /** Called after each round completes */
  onRoundComplete?: (round: ReflectionRound) => void;
}

/**
 * Run reflection loop for Tier 3 (Opus) queries.
 * Stops early if critic finds response sufficient.
 */
export async function runReflection(opts: RunOptions): Promise<ReflectionResult> {
  const { userMessage, onFinalDelta, onRoundStart, onRoundComplete } = opts;
  const { provider, config } = selectProvider(3);
  const startedAt = Date.now();

  const rounds: ReflectionRound[] = [];
  let conversationContext: AiMessage[] = [
    { id: 'initial-user', role: 'user', content: userMessage, createdAt: Date.now() }
  ];

  let stoppedReason: ReflectionResult['stoppedReason'] = 'max_iterations';
  let totalCost = emptyCost();

  for (let i = 1; i <= MAX_REFLECTION_ROUNDS; i++) {
    onRoundStart?.(i);

    // ─── Generate response ──────────────────────────────────────
    let responseText = '';
    let responseCost = emptyCost();
    const responseStarted = Date.now();
    const isFinalRound = i === MAX_REFLECTION_ROUNDS;

    try {
      for await (const event of provider.streamChat({
        model: config.model,
        maxTokens: 4096,
        system: [{ text: LABYRA_SYSTEM_PROMPT, cache: true, cacheTtl: '1h' }],
        messages: conversationContext.map((m) => ({
          role: m.role === 'assistant' ? 'assistant' : 'user',
          content: m.content
        }))
      })) {
        if (event.type === 'text_delta') {
          responseText += event.delta;
          // Stream final round to UI for live UX; earlier rounds buffered silently
          if (onFinalDelta) onFinalDelta(event.delta);
        } else if (event.type === 'message_complete') {
          responseCost = event.usage;
        } else if (event.type === 'error') {
          stoppedReason = 'error';
          break;
        }
      }
    } catch {
      stoppedReason = 'error';
      break;
    }

    const responseLatencyMs = Date.now() - responseStarted;
    totalCost = addCost(totalCost, responseCost);

    if (stoppedReason === 'error') {
      // Still record partial round
      rounds.push({
        round: i,
        response: responseText,
        critique: {
          sufficient: true,
          issues: [],
          summary: 'round_errored_skipping_critique',
          cost: emptyCost(),
          latencyMs: 0
        },
        responseCost,
        responseLatencyMs
      });
      onRoundComplete?.(rounds[rounds.length - 1]);
      break;
    }

    // ─── Critique (only if not last possible round; last round always sufficient) ───
    let critique;
    if (i < MAX_REFLECTION_ROUNDS) {
      critique = await critiqueResponse(userMessage, responseText);
      totalCost = addCost(totalCost, critique.cost);
    } else {
      // Max rounds reached — no need to critique, this is final answer
      critique = {
        sufficient: true,
        issues: [],
        summary: 'max_iterations_reached',
        cost: emptyCost(),
        latencyMs: 0
      };
    }

    const round: ReflectionRound = {
      round: i,
      response: responseText,
      critique,
      responseCost,
      responseLatencyMs
    };
    rounds.push(round);
    onRoundComplete?.(round);

    if (critique.sufficient) {
      stoppedReason = i < MAX_REFLECTION_ROUNDS ? 'sufficient' : 'max_iterations';
      break;
    }

    // ─── Prepare for next iteration: append assistant response + revision instruction ───
    const issuesText = critique.issues.map((s, idx) => `${idx + 1}. ${s}`).join('\n');
    const critiqueMessage = `Critique:\n${issuesText}\n\n${REVISION_INSTRUCTION}`;

    conversationContext = [
      ...conversationContext,
      { id: `r${i}-resp`, role: 'assistant', content: responseText, createdAt: Date.now() },
      { id: `r${i}-crit`, role: 'user', content: critiqueMessage, createdAt: Date.now() }
    ];
  }

  return {
    rounds,
    iterations: rounds.length,
    stoppedReason,
    finalResponse: rounds[rounds.length - 1]?.response ?? '',
    totalCost,
    totalLatencyMs: Date.now() - startedAt
  };
}
