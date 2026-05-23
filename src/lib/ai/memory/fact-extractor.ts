/**
 * Fact extractor (ADR-035 M2, L2) — extracts user facts from a chat turn.
 *
 * Calls Gemini 3.1 Flash-Lite (T0 dispatcher) with a strict JSON contract,
 * mirroring the intent-classifier pattern. Each fact MUST carry a verbatim
 * sourceQuote (anti-hallucination) and a confidence >= threshold.
 *
 * This module ONLY produces candidate facts. Persistence + dedupe + cap live
 * in fact-store.ts. Extraction is best-effort: any failure returns [].
 *
 * @phase R193-mem-m2
 */
import 'server-only';
import { getHaikuDispatcher } from '@/lib/ai/providers';
import { FACT_SUBJECTS, isValidSubject, type FactSubject } from './fact-taxonomy';

/** Minimum confidence to keep an extracted fact (proposal: >= 0.7). */
export const FACT_CONFIDENCE_THRESHOLD = 0.7;

export interface ExtractedFact {
  subject: FactSubject;
  object: unknown;
  confidence: number;
  sourceQuote: string;
}

export interface ExtractResult {
  facts: ExtractedFact[];
  costUsd: number;
}

interface ExistingFactBrief {
  subject: string;
  object: unknown;
}

function buildSystemPrompt(existing: ExistingFactBrief[]): string {
  const existingList =
    existing.length > 0
      ? existing.map((f) => `- ${f.subject}: ${JSON.stringify(f.object)}`).join('\n')
      : '(none yet)';
  return `You are a fact extractor for a materials science lab AI assistant.

Given one chat turn (user message + assistant reply), extract durable facts ABOUT
THE USER that are worth remembering across conversations.

Only extract a fact if ALL hold:
1. It is about the user's identity, research, lab setup, or working preferences.
2. Confidence >= 0.7 (do NOT guess; transient/one-off context is not a fact).
3. It is NOT already in the existing facts below (avoid duplicates; only output a
   fact if it is NEW or a CORRECTION/UPDATE to an existing one).
4. It is backed by a VERBATIM quote from the USER's message (not the assistant's).

NEVER extract: emails, phone numbers, addresses, financial data, health data, or
anything sensitive/personal beyond research context.

Subject MUST be one of:
${FACT_SUBJECTS.map((s) => `- ${s}`).join('\n')}

Existing facts (do not duplicate):
${existingList}

Output ONLY a JSON array, no prose, no markdown fences:
[
  { "subject": "user.research_focus", "object": "WO3 supercapacitors", "confidence": 0.95, "sourceQuote": "tôi nghiên cứu WO3 cho siêu tụ" }
]

Output [] if nothing qualifies.`;
}

function parseFactsJson(text: string): ExtractedFact[] {
  const cleaned = text.replace(/```json|```/g, '').trim();
  let arr: unknown;
  try {
    arr = JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\[[\s\S]*\]/);
    if (!match) return [];
    try {
      arr = JSON.parse(match[0]);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(arr)) return [];

  const out: ExtractedFact[] = [];
  for (const item of arr) {
    if (typeof item !== 'object' || item === null) continue;
    const o = item as Record<string, unknown>;
    if (!isValidSubject(o.subject)) continue;
    if (typeof o.confidence !== 'number' || o.confidence < FACT_CONFIDENCE_THRESHOLD) continue;
    if (typeof o.sourceQuote !== 'string' || o.sourceQuote.trim().length === 0) continue;
    if (o.object === undefined || o.object === null) continue;
    out.push({
      subject: o.subject,
      object: o.object,
      confidence: Math.min(1, Math.max(0, o.confidence)),
      sourceQuote: o.sourceQuote.slice(0, 500)
    });
  }
  return out;
}

/**
 * Extract candidate facts from a single turn. Best-effort: returns
 * { facts: [], costUsd: 0 } on any error.
 */
export async function extractFacts(opts: {
  userTurn: string;
  assistantTurn: string;
  existingFacts: ExistingFactBrief[];
}): Promise<ExtractResult> {
  try {
    const { provider, config } = getHaikuDispatcher();
    const turn = `USER: ${opts.userTurn}\n\nASSISTANT: ${opts.assistantTurn}`;
    const { text, usage } = await provider.complete({
      model: config.model,
      maxTokens: 512,
      system: [{ text: buildSystemPrompt(opts.existingFacts), cache: false }],
      messages: [{ role: 'user', content: turn }]
    });
    return { facts: parseFactsJson(text), costUsd: usage.usd };
  } catch (err) {
    console.warn('extractFacts failed (non-fatal)', err);
    return { facts: [], costUsd: 0 };
  }
}
