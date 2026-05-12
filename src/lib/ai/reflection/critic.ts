/**
 * Reflection critic — Opus self-critique with sufficiency check.
 * @phase R160-ai-4
 */
import { selectProvider } from '@/lib/ai/providers';
import type { ReflectionCritique } from './types';

const CRITIC_SYSTEM = `You are a rigorous scientific reviewer evaluating an AI assistant's
response to a user query in materials science / electrochemistry research.

Your job: identify substantive flaws in the response that would mislead the user.

Check for:
- Factual errors or imprecise claims
- Missing important caveats or limitations
- Overconfidence on contested or unsettled topics
- Hallucinated citations or fabricated specific numbers
- Inappropriate generalization (e.g. WO₃ thin film result applied to nanoparticle)
- Logic gaps in multi-step reasoning
- Outdated information presented as current

DO NOT flag:
- Style preferences (formatting, length)
- Minor wording choices
- Reasonable simplifications appropriate for the question's scope
- Pedagogical decisions that aid understanding

Output ONLY valid JSON, no markdown fences, no preamble:
{
  "sufficient": boolean,
  "issues": ["specific issue 1", "specific issue 2"],
  "summary": "one-sentence overall assessment"
}

If response is good and accurate, set sufficient=true, issues=[].
If issues exist, sufficient=false, list them concretely.`;

interface CritiqueJson {
  sufficient: boolean;
  issues: string[];
  summary: string;
}

function parseCritiqueJson(text: string): CritiqueJson | null {
  const cleaned = text.replace(/```json|```/g, '').trim();
  try {
    const obj = JSON.parse(cleaned);
    if (
      typeof obj.sufficient === 'boolean' &&
      Array.isArray(obj.issues) &&
      typeof obj.summary === 'string'
    ) {
      return obj as CritiqueJson;
    }
    return null;
  } catch {
    // Try extracting first JSON object via regex
    const match = cleaned.match(/\{[\s\S]*?\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]) as CritiqueJson;
    } catch {
      return null;
    }
  }
}

/**
 * Critique a response. Uses Opus (Tier 3) for rigor.
 * Returns sufficient=true to short-circuit reflection loop.
 */
export async function critiqueResponse(
  userMessage: string,
  response: string
): Promise<ReflectionCritique> {
  const startedAt = Date.now();
  const { provider, config } = selectProvider(3); // Opus

  try {
    const { text, usage } = await provider.complete({
      model: config.model,
      maxTokens: 500,
      system: [{ text: CRITIC_SYSTEM, cache: true, cacheTtl: '1h' }],
      messages: [
        {
          role: 'user',
          content: `User query:\n${userMessage}\n\nAssistant response to evaluate:\n${response}`
        }
      ]
    });

    const latencyMs = Date.now() - startedAt;
    const parsed = parseCritiqueJson(text);

    if (!parsed) {
      // Parse failure → assume sufficient (avoid infinite loop)
      return {
        sufficient: true,
        issues: [],
        summary: 'critic_parse_failed_assume_sufficient',
        cost: usage,
        latencyMs
      };
    }

    return {
      sufficient: parsed.sufficient,
      issues: parsed.issues,
      summary: parsed.summary,
      cost: usage,
      latencyMs
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown';
    return {
      sufficient: true,
      issues: [],
      summary: `critic_error_assume_sufficient: ${msg}`,
      cost: {
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        usd: 0
      },
      latencyMs: Date.now() - startedAt
    };
  }
}
