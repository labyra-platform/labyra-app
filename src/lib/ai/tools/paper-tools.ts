/**
 * Paper search tools — uses hybrid RAG (ai-5d-2).
 * All tools multi-tenant scoped via ToolContext.tenantId.
 * @phase R160-ai-5d-3
 */
import 'server-only';
import { searchPapers } from '@/lib/ai/rag/search';
import type { RegisteredTool, ToolContext } from './types';

// ─── searchPapers tool ─────────────────────────────────────────────
interface SearchPapersInput {
  query: string;
  paperYear?: number;
}

async function searchPapersHandler(input: Record<string, unknown>, ctx: ToolContext) {
  const typed = input as unknown as SearchPapersInput;
  const query = typeof typed.query === 'string' ? typed.query.trim() : '';
  if (!query) {
    return { error: 'query is required' };
  }

  const filter: Record<string, unknown> = {};
  if (typeof typed.paperYear === 'number' && typed.paperYear > 0) {
    filter.paperYear = typed.paperYear;
  }
  // R178-2a: scope retrieval to user-selected papers when present.
  // Empty array = no filter (search all tenant papers, backward-compat).
  if (ctx.selectedPaperIds && ctx.selectedPaperIds.length > 0) {
    filter.paperId = { $in: ctx.selectedPaperIds };
  }

  const result = await searchPapers({
    tenantId: ctx.tenantId,
    query,
    filter: Object.keys(filter).length > 0 ? filter : undefined
  });

  // Compact result for LLM context (preserve structure for UI use)
  return {
    query,
    hits: result.hits.map((h, idx) => ({
      ref: idx + 1, // citation number [1], [2], ...
      paperId: h.paperId,
      paperTitle: h.paperTitle,
      paperAuthors: h.paperAuthors,
      paperYear: h.paperYear,
      paperDoi: h.paperDoi,
      pages: h.pages,
      section: h.section,
      excerpt: h.text.length > 500 ? `${h.text.slice(0, 500)}…` : h.text,
      score: Number(h.score.toFixed(3))
    })),
    totalHits: result.hits.length,
    cost: result.cost,
    latencyMs: result.latencyMs
  };
}

const searchPapersTool: RegisteredTool = {
  name: 'searchPapers',
  description:
    "Search the user's indexed scientific paper library for relevant excerpts. " +
    'Returns top 5 most relevant chunks with paper title, authors, year, DOI, page numbers, and section. ' +
    'Each hit has a "ref" number — cite them in your response as [1], [2], etc. ' +
    'Use this when the user asks about content in their papers, requests literature review, ' +
    'compares findings across papers, or asks "what does the paper say about X". ' +
    'If results seem irrelevant or empty, mention this to the user instead of inventing answers.',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description:
          'Natural language search query. Be specific. Examples: ' +
          '"WO3 photocatalysis quantum yield improvements", ' +
          '"PFSA ionomer adsorption mechanism on Pt/C catalyst"'
      },
      paperYear: {
        type: 'number',
        description: 'Optional: filter to papers published in this exact year'
      }
    },
    required: ['query']
  },
  handler: searchPapersHandler
};

export const paperTools: RegisteredTool[] = [searchPapersTool];
