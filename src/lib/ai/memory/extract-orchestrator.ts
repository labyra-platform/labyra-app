/**
 * Fact extraction orchestrator (ADR-035 M2) — the entry point called from the
 * chat route via Next.js `after()` (runs after the response is sent, but is
 * guaranteed to complete; NOT bare fire-and-forget which Vercel would kill).
 *
 * Flow:
 *  1. Honor opt-in: load prefs; if enableMemory !== true, do nothing.
 *  2. Load existing facts (brief) for dedupe context.
 *  3. Extract candidates (Gemini Flash-Lite).
 *  4. Upsert with supersede + cap (fact-store).
 *  5. Record extraction cost (telemetry, feature 'fact_extraction').
 *
 * Entirely best-effort: every step is guarded; failures log and return.
 *
 * @phase R193-mem-m2
 */
import 'server-only';
import { loadProceduralMemory } from './loader';
import { extractFacts } from './fact-extractor';
import { loadCurrentFacts, upsertFacts } from './fact-store';
import { recordCost } from '@/lib/ai/cost/telemetry';
import { getCapabilityForTier } from '@/lib/ai/config/capabilities';

export async function extractFactsAsync(opts: {
  tenantId: string;
  userId: string;
  conversationId: string;
  sourceMessageId: string;
  userTurn: string;
  assistantTurn: string;
}): Promise<void> {
  try {
    // 1. Opt-in gate (ADR-035: memory OFF by default).
    const prefs = await loadProceduralMemory(opts.userId);
    if (prefs?.enableMemory !== true) return;

    // Skip trivially short turns — nothing durable to extract.
    if (opts.userTurn.trim().length < 8) return;

    // 2. Existing facts for dedupe.
    const existing = await loadCurrentFacts(opts.tenantId, opts.userId, 50);
    const existingBrief = existing.map((f) => ({ subject: f.subject, object: f.object }));

    // 3. Extract.
    const { facts, costUsd } = await extractFacts({
      userTurn: opts.userTurn,
      assistantTurn: opts.assistantTurn,
      existingFacts: existingBrief
    });

    // 4. Persist (supersede + cap + audit).
    if (facts.length > 0) {
      await upsertFacts({
        tenantId: opts.tenantId,
        uid: opts.userId,
        conversationId: opts.conversationId,
        sourceMessageId: opts.sourceMessageId,
        facts
      });
    }

    // 5. Telemetry (best-effort; recordCost skips when costUsd <= 0).
    if (costUsd > 0) {
      await recordCost({
        tenantId: opts.tenantId,
        tier: 0,
        capability: getCapabilityForTier(0),
        feature: 'fact_extraction',
        costUsd,
        latencyMs: 0
      });
    }
  } catch (err) {
    console.warn('extractFactsAsync failed (non-fatal)', err);
  }
}
