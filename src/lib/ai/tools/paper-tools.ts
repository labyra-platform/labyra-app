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
  // R178-3: optional domain-axis scope filter (paper-axis OR with paperId).
  // @r178-3-applied
  if (ctx.selectedDomains && ctx.selectedDomains.length > 0) {
    filter.domain = { $in: ctx.selectedDomains };
  }

  const result = await searchPapers({
    tenantId: ctx.tenantId,
    query,
    filter: Object.keys(filter).length > 0 ? filter : undefined,
    // ADR-034 TEAM-5: KB group scope (privileged viewers bypass in search.ts).
    viewerGroupId: ctx.viewerGroupId,
    isPrivileged: ctx.isPrivileged
  });

  // R477: attach figures on each hit's pages so the assistant can embed them.
  // Best-effort — a lookup failure just omits figures.
  const { getAdminFirestoreService } = await import('@/lib/firebase/admin');
  const db = getAdminFirestoreService();
  const uniquePaperIds = [...new Set(result.hits.map((h) => h.paperId))];
  const figuresByPaper = new Map<string, { name: string; page: number }[]>();
  await Promise.all(
    uniquePaperIds.map(async (pid) => {
      try {
        const snap = await db.doc(`tenants/${ctx.tenantId}/papers/${pid}`).get();
        figuresByPaper.set(
          pid,
          (snap.data()?.figures as { name: string; page: number }[] | undefined) ?? []
        );
      } catch {
        figuresByPaper.set(pid, []);
      }
    })
  );

  // Compact result for LLM context (preserve structure for UI use)
  return {
    query,
    hits: result.hits.map((h, idx) => {
      const figures = (figuresByPaper.get(h.paperId) ?? [])
        .filter((f) => {
          if (f.page <= 0) return false;
          // The figure's page or one immediately adjacent — an in-text mention of
          // a figure often sits a page or two away from the figure itself.
          if (h.pages.some((p) => Math.abs(p - f.page) <= 1)) return true;
          // Or the hit text names this figure's number (when the filename keeps it).
          const num = /(?:figure|fig|picture|pic)[_\s-]*(\d+)/i.exec(f.name)?.[1];
          return num
            ? new RegExp(`(?:figure|fig\\.?|hình|picture)\\s*0*${num}\\b`, 'i').test(h.text)
            : false;
        })
        .map((f) => f.name);
      return {
        ref: idx + 1, // citation number [1], [2], ...
        paperId: h.paperId,
        paperTitle: h.paperTitle,
        paperAuthors: h.paperAuthors,
        paperYear: h.paperYear,
        paperDoi: h.paperDoi,
        pages: h.pages,
        section: h.section,
        excerpt: h.text.length > 500 ? `${h.text.slice(0, 500)}…` : h.text,
        score: Number(h.score.toFixed(3)),
        ...(figures.length > 0 ? { figures } : {})
      };
    }),
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
    // R178-2c: when system prompt mentions Scoped Library, ALWAYS call this tool
    // for any content question (even vague "tóm tắt" / "summarize") using a
    // broad topic-keyword query derived from the scoped paper titles.
    'When the system prompt mentions a Scoped Library, ALWAYS call this tool for any content question — even vague ones like "tóm tắt" or "summarize" — using a broad topic-keyword query derived from the scoped paper titles. Do not ask the user to clarify scope first. ' +
    'A hit may include a "figures" array (figure filenames on/near its cited pages). You CAN embed a figure in your reply — to show one (e.g. a SEM image the user asked for), put its marker on its own line: [[FIG:paperId:filename]] using that hit\'s exact paperId and filename. Never say you cannot show images; use the marker. When the user asks to SEE or SHOW figures/images (e.g. "cho tôi xem", "show me", "các hình SEM"), you MUST embed the available matching figures with these markers — writing a text description like "Hình 9: ..." INSTEAD of embedding is wrong. Only skip figures that are clearly unrelated, and embed several when the user asks for multiple. ' +
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
