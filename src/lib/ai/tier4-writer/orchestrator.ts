/**
 * T4 Writer orchestrator — drafts paper sections with RAG-backed citations.
 *
 * Flow:
 *   1. Detect section type (or use explicit)
 *   2. RAG search top-K papers
 *   3. Stream draft with section-specific prompt + context
 *   4. Extract citations from draft
 *
 * @phase R173-4
 * @see docs/ai/AI_ARCHITECTURE.md Tier 4
 */
import 'server-only';
import { selectProvider } from '@/lib/ai/providers';
import { searchPapers } from '@/lib/ai/rag/search';
import { buildWriterSystemPrompt, detectSection, CONTEXT_INSTRUCTION } from './prompts';
import type { WriterOptions, WriterResult, WriterCitation, SectionType } from './types';
import type { AiCostBreakdown } from '@/types/ai';

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

function extractCitations(
  draft: string,
  paperById: Map<string, { chunks: string[] }>
): WriterCitation[] {
  // Match [citationKey] patterns
  const citationKeys = new Set<string>();
  const regex = /\[([a-z]+\d{4}[a-z]?)\]/gi;
  let match;
  while ((match = regex.exec(draft)) !== null) {
    citationKeys.add(match[1].toLowerCase());
  }

  const result: WriterCitation[] = [];
  for (const key of citationKeys) {
    // Find matching paper (heuristic: first lastName + year in citationKey)
    for (const [paperId, info] of paperById) {
      if (paperId.toLowerCase().includes(key.slice(0, 5))) {
        result.push({ paperId, chunkIds: info.chunks, citationKey: key });
        break;
      }
    }
  }
  return result;
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

  // Build context block from retrieved chunks
  const paperById = new Map<string, { chunks: string[]; text: string }>();
  let contextBlock = CONTEXT_INSTRUCTION;
  for (const p of papers.slice(0, TOP_K_PAPERS)) {
    const paperId = String(p.paperId ?? '');
    const chunkId = String(p.chunkIdx ?? '');
    const text = String(p.text ?? '').slice(0, 800);
    const citationKey = paperId
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .slice(0, 12);

    contextBlock += `\n### [${citationKey}] (paper: ${paperId})\n${text}\n`;

    const entry = paperById.get(paperId) ?? { chunks: [], text: '' };
    entry.chunks.push(chunkId);
    paperById.set(paperId, entry);
  }

  if (papers.length === 0) {
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

  // 4. Extract citations
  const citations = extractCitations(draft, paperById);

  return {
    draft,
    section,
    citations,
    totalCost,
    durationMs: Date.now() - startedAt,
    sourceCount: papers.length
  };
}
