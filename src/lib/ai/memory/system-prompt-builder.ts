/**
 * System-prompt assembler with memory injection (ADR-035 M1).
 *
 * Produces an LLMSystemBlock[] in a CACHE-SAFE order:
 *
 *   [0] base Labyra prompt        (cache 1h)  — most static
 *   [1] tenant context (L4)       (cache 1h)  — stable within a tenant
 *   [2] procedural prefs (L3)     (cache 1h)  — stable within a user
 *   [3] dynamic scope (papers)    (cache off) — appended by caller
 *
 * WHY ORDER MATTERS:
 *  - Anthropic: each cache:true block is an explicit cache_control breakpoint
 *    (we stay within the 4-breakpoint limit: base + tenant + prefs = 3).
 *  - Gemini: `cache` is ignored; the provider concatenates system text and the
 *    API implicit-caches the longest shared PREFIX. Putting the most static
 *    text first keeps the base prompt cacheable across users; injecting a
 *    user-varying block before the base would break the shared prefix and
 *    cost MORE, not less. Hence base → tenant → prefs → dynamic, never the
 *    reverse.
 *
 * OPT-IN (ADR-035): preferences are injected whenever the user has saved them
 * (style is a stated preference, harmless to honor). The `enableMemory` flag
 * gates L1/L2 EXTRACTION (M2), not L3/L4 injection — L3/L4 hold no
 * auto-extracted personal facts, so injecting them is not a memory-consent
 * concern. The flag is surfaced here for callers that want to short-circuit.
 *
 * @phase R192-mem-m1a
 */
import 'server-only';
import { loadProceduralMemory, loadTenantContext } from './loader';
import { loadCurrentFacts } from './fact-store';
import type { AiPreferences, TenantAiContext } from '@/types/memory';
import type { LLMSystemBlock } from '@/lib/ai/providers/types';

const LANGUAGE_LABEL: Record<AiPreferences['language'], string> = {
  vi: 'Vietnamese (Tiếng Việt)',
  en: 'English',
  auto: 'match the language of the user message'
};
const MATH_LABEL: Record<AiPreferences['mathNotation'], string> = {
  latex: 'LaTeX ($...$ inline, $$...$$ display)',
  unicode: 'Unicode symbols (no LaTeX delimiters)',
  plaintext: 'plain text (no special math formatting)'
};
const VERBOSITY_LABEL: Record<AiPreferences['verbosity'], string> = {
  concise: 'concise — short, direct answers',
  normal: 'normal — balanced detail',
  detailed: 'detailed — thorough explanations'
};

/** Render L3 preferences as a compact system segment (~150 tokens). */
export function renderProceduralMemory(p: AiPreferences): string {
  const lines = [
    '# User preferences',
    'Follow these preferences for this user unless the user overrides them in-message:',
    `- Response language: ${LANGUAGE_LABEL[p.language]}`,
    `- Math notation: ${MATH_LABEL[p.mathNotation]}`,
    `- Verbosity: ${VERBOSITY_LABEL[p.verbosity]}`,
    `- Tone: ${p.tone}`,
    `- Literature references: ${p.includeReferences ? 'include citations when relevant' : 'do not add citations unless asked'}`
  ];
  return lines.join('\n');
}

/** Render L4 tenant context as a system segment (~300-500 tokens). */
export function renderTenantContext(c: TenantAiContext): string {
  const lines = ['# Lab context'];
  if (c.labName) lines.push(`Lab: ${c.labName}`);
  if (c.labDescription) lines.push(c.labDescription);
  if (c.commonTechniques?.length) {
    lines.push(`Common techniques: ${c.commonTechniques.join(', ')}`);
  }
  if (c.commonMaterials?.length) {
    lines.push(`Common materials: ${c.commonMaterials.join(', ')}`);
  }
  if (c.commonEquipment?.length) {
    lines.push(`Equipment: ${c.commonEquipment.join(', ')}`);
  }
  const glossaryEntries = c.glossary ? Object.entries(c.glossary) : [];
  if (glossaryEntries.length) {
    lines.push('Glossary:');
    for (const [term, def] of glossaryEntries) lines.push(`- ${term}: ${def}`);
  }
  if (c.houseStyle) {
    lines.push('House style:');
    lines.push(c.houseStyle);
  }
  return lines.join('\n');
}

/** Render L2 semantic facts as a system segment (~300 tokens). NOT cached. */
export function renderSemanticMemory(facts: Array<{ subject: string; object: unknown }>): string {
  if (facts.length === 0) return '';
  const lines = ['# About this user (remembered facts)'];
  for (const f of facts) {
    const lbl = f.subject.replace(/^user\./, '').replace(/_/g, ' ');
    const val = typeof f.object === 'string' ? f.object : JSON.stringify(f.object);
    lines.push(`- ${lbl}: ${val}`);
  }
  lines.push(
    'Use these only if relevant; the user may correct them. Do not state them back unprompted.'
  );
  return lines.join('\n');
}

interface BuildOpts {
  userId: string;
  tenantId: string;
  /**
   * Tool-capability block (LABYRA_TOOLS_BLOCK). Pass ONLY on paths that wire
   * tools (the chat tool-loop). Omit on tool-less paths (reflection) so the
   * model is never told to call a tool it doesn't have. Static → cached.
   */
  toolsBlock?: string | null;
  /** Dynamic, per-conversation segment (e.g. scoped paper list). Not cached. */
  dynamicBlock?: string | null;
  /** L2 fact injection only when the user opted in (M2). */
  enableMemory?: boolean;
}

/**
 * Assemble the full system block array for a chat turn.
 * Loads L3 + L4 in parallel; both are best-effort (null on miss/error).
 */
export async function buildSystemPromptWithMemory(
  base: string,
  opts: BuildOpts
): Promise<LLMSystemBlock[]> {
  const [prefs, tenantCtx] = await Promise.all([
    loadProceduralMemory(opts.userId),
    loadTenantContext(opts.tenantId)
  ]);

  const blocks: LLMSystemBlock[] = [{ text: base, cache: true, cacheTtl: '1h' }];

  // R239: tool-capability block — only present on paths that actually wire
  // tools. Static (same for every user) → cached; placed right after the base
  // so the base remains the longest shared prefix for Gemini implicit caching.
  if (opts.toolsBlock) {
    blocks.push({ text: opts.toolsBlock, cache: true, cacheTtl: '1h' });
  }

  if (tenantCtx) {
    const text = renderTenantContext(tenantCtx).trim();
    if (text) blocks.push({ text, cache: true, cacheTtl: '1h' });
  }

  if (prefs) {
    const text = renderProceduralMemory(prefs).trim();
    if (text) blocks.push({ text, cache: true, cacheTtl: '1h' });
  }

  // L2 semantic facts — dynamic per user (change each turn) -> NOT cached.
  // Placed after static prefs/tenant, before per-conversation dynamic scope.
  if (opts.enableMemory) {
    try {
      const facts = await loadCurrentFacts(opts.tenantId, opts.userId, 10);
      const text = renderSemanticMemory(
        facts.map((f) => ({ subject: f.subject, object: f.object }))
      ).trim();
      if (text) blocks.push({ text, cache: false });
    } catch {
      // non-fatal: memory must never break the chat path
    }
  }

  if (opts.dynamicBlock) {
    blocks.push({ text: opts.dynamicBlock, cache: false });
  }

  return blocks;
}
