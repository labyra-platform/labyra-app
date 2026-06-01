/**
 * T4 Writer orchestrator — drafts paper sections with RAG-backed citations.
 *
 * Flow:
 *   1. Detect section type (or use explicit)
 *   2. RAG search top-K papers
 *   3. Load paper metadata → assign one real [authorYear] key per paper
 *   4. Stream draft with section prompt + context (labelled with those keys)
 *   5. Ground the draft: flag citations with no source + numbers not in sources
 *
 * @phase R173-4 (R276: real citation keys + deterministic grounding)
 * @see docs/ai/AI_ARCHITECTURE.md Tier 4
 */
import 'server-only';
import { checkGrounding, type GroundingResult } from '@/lib/ai/grounding';
import { selectProvider } from '@/lib/ai/providers';
import { searchPapers } from '@/lib/ai/rag/search';
import type { AiCostBreakdown } from '@/types/ai';
import { buildCitationKey, fallbackCitationKey } from './citation-key';
import { loadPapersMetadata } from './citation-loader';
import { auditCitations } from './grounding';
import { buildWriterSystemPrompt, CONTEXT_INSTRUCTION, detectSection } from './prompts';
import type { SectionType, WriterCitation, WriterOptions, WriterResult } from './types';

const TOP_K_PAPERS = 8;
const MAX_DRAFT_TOKENS = 4096;

function emptyCost(): AiCostBreakdown {
  return {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    usd: 0
  };
}

export async function runWriter(opts: WriterOptions): Promise<WriterResult> {
  const { userMessage, tenantId, onTextDelta, onSearchComplete } = opts;
  const startedAt = Date.now();

  // 1. Determine section
  const sectionType: SectionType = opts.sectionType ?? 'auto';
  const section = sectionType === 'auto' ? detectSection(userMessage) : sectionType;

  // 2. RAG search papers
  const searchResult = await searchPapers({
    tenantId,
    query: userMessage,
    vectorTopK: TOP_K_PAPERS,
    topN: TOP_K_PAPERS
  });

  // searchPapers returns SearchResponse with .hits[] — extract for context
  const papers = (searchResult.hits ?? []) as Array<{
    paperId: string;
    chunkIdx: number;
    text: string;
    pages?: number[];
    section?: string;
  }>;
  onSearchComplete?.(papers.length);

  // 3. One stable [authorYear] citation key per unique paper (R276). The writer
  // prompt tells the model to cite [authorYear], so the context MUST label
  // papers with the same format — otherwise the model cites keys mapping to
  // nothing. Group chunks by paper first so each paper gets exactly one key.
  const orderedPaperIds: string[] = [];
  const chunksByPaper = new Map<string, { chunkId: string; text: string }[]>();
  for (const p of papers.slice(0, TOP_K_PAPERS)) {
    const paperId = String(p.paperId ?? '');
    if (!paperId) continue;
    if (!chunksByPaper.has(paperId)) {
      chunksByPaper.set(paperId, []);
      orderedPaperIds.push(paperId);
    }
    chunksByPaper.get(paperId)?.push({
      chunkId: String(p.chunkIdx ?? ''),
      text: String(p.text ?? '').slice(0, 800)
    });
  }

  const metadata = await loadPapersMetadata(tenantId, orderedPaperIds);
  const usedKeys = new Set<string>();
  const keyByPaperId = new Map<string, string>();
  const paperIdByKey = new Map<string, string>();
  for (const paperId of orderedPaperIds) {
    const meta = metadata.get(paperId);
    const key =
      meta && meta.authors.length > 0
        ? buildCitationKey(meta, usedKeys)
        : fallbackCitationKey(paperId, usedKeys);
    usedKeys.add(key);
    keyByPaperId.set(paperId, key);
    paperIdByKey.set(key, paperId);
  }

  let contextBlock = CONTEXT_INSTRUCTION;
  for (const paperId of orderedPaperIds) {
    const key = keyByPaperId.get(paperId) ?? '';
    for (const chunk of chunksByPaper.get(paperId) ?? []) {
      contextBlock += `\n### [${key}] (paper: ${paperId})\n${chunk.text}\n`;
    }
  }
  if (orderedPaperIds.length === 0) {
    contextBlock += '\n(No papers found in lab library. Draft without citations.)\n';
  }

  // 3. Stream draft with Sonnet 4.6 (T4 capability: reasoning-balanced)
  const { provider, config } = selectProvider(4);
  const systemPrompt = buildWriterSystemPrompt(section);

  let draft = '';
  let totalCost = emptyCost();

  for await (const event of provider.streamChat({
    model: config.model,
    maxTokens: MAX_DRAFT_TOKENS,
    system: [
      { text: systemPrompt, cache: true, cacheTtl: '1h' },
      { text: contextBlock, cache: false }
    ],
    messages: [{ role: 'user', content: userMessage }]
  })) {
    if (event.type === 'text_delta') {
      draft += event.delta;
      onTextDelta?.(event.delta);
    } else if (event.type === 'message_complete') {
      totalCost = event.usage;
    } else if (event.type === 'error') {
      throw new Error(`T4 Writer provider error: ${event.message ?? 'unknown'}`);
    }
  }

  // 5. Ground the draft (deterministic — ./grounding + checkGrounding).
  const validKeys = new Set(keyByPaperId.values());
  const audit = auditCitations(draft, validKeys);
  const numberGrounding: GroundingResult = checkGrounding(
    draft,
    orderedPaperIds.flatMap((id) => (chunksByPaper.get(id) ?? []).map((c) => ({ text: c.text })))
  );

  // Citations = valid keys actually used in the draft, mapped back to papers.
  const citations: WriterCitation[] = audit.valid.map((key) => {
    const paperId = paperIdByKey.get(key) ?? '';
    return {
      paperId,
      chunkIds: (chunksByPaper.get(paperId) ?? []).map((c) => c.chunkId),
      citationKey: key
    };
  });

  return {
    draft,
    section,
    citations,
    totalCost,
    durationMs: Date.now() - startedAt,
    sourceCount: orderedPaperIds.length,
    grounding: {
      invalidCitations: audit.invalid,
      unverifiedNumbers: numberGrounding.unverifiedNumbers,
      totalWarnings: audit.invalid.length + numberGrounding.unverifiedNumbers.length
    }
  };
}
