/**
 * POST /api/superadmin/evals/retrieval — run the retrieval golden-set eval.
 *
 * Reads the golden set at tenants/{tid}/_evalRetrieval/golden (built by the
 * worker's gen_retrieval_goldenset.py), runs the REAL hybrid retrieval
 * (searchPapers: dense + BM25 + RRF + rerank) for each query, and reports how
 * often the ground-truth chunk/paper lands in the top-K. This is the on-demand
 * A/B yardstick for Contextual Retrieval: run once with ENABLE_ENRICHMENT off
 * (baseline) and once on (after re-index); the delta is the measured lift.
 *
 * Body: { tenantId: string, label?: string }  // label tags the stored run, e.g. "off" / "on"
 * Stores each run at tenants/{tid}/_evalRetrievalRuns/{auto} for later comparison.
 *
 * @phase R247
 */
import 'server-only';
import { NextResponse } from 'next/server';
import { requireSuperadmin } from '@/lib/auth/superadmin-guard';
import { getAdminFirestoreService } from '@/lib/firebase/admin';
import { searchPapers } from '@/lib/ai/rag/search';
import type { SearchHit } from '@/lib/ai/rag/search-types';
import { mapWithConcurrency } from '@/lib/utils/concurrency';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const K_VALUES = [5, 10, 20] as const;
const SEARCH_CONCURRENCY = 6;
const VECTOR_TOP_K = 60;
const TOP_N = 30; // must be >= max(K_VALUES) so recall@20 is observable

interface GoldenItem {
  id: string;
  query: string;
  paperId: string;
  chunkIdx: number;
}

interface PerQuery {
  id: string;
  /** 1-based rank of the gold chunk in the final ranked hits, null if not in top-N */
  chunkRank: number | null;
  paperRank: number | null;
}

function firstRank(hits: SearchHit[], match: (h: SearchHit) => boolean): number | null {
  for (let i = 0; i < hits.length; i += 1) {
    if (match(hits[i])) return i + 1;
  }
  return null;
}

function recallAt(ranks: (number | null)[], k: number): number {
  if (ranks.length === 0) return 0;
  const hit = ranks.filter((r) => r !== null && r <= k).length;
  return Number((hit / ranks.length).toFixed(3));
}

function meanReciprocalRank(ranks: (number | null)[]): number {
  if (ranks.length === 0) return 0;
  const sum = ranks.reduce<number>((acc, r) => acc + (r ? 1 / r : 0), 0);
  return Number((sum / ranks.length).toFixed(3));
}

function recallMap(ranks: (number | null)[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const k of K_VALUES) out[`@${k}`] = recallAt(ranks, k);
  return out;
}

export async function POST(request: Request): Promise<NextResponse> {
  const guard = await requireSuperadmin(request);
  if (!guard.allowed) return guard.response!;

  let body: { tenantId?: string; label?: string };
  try {
    body = (await request.json()) as { tenantId?: string; label?: string };
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  const tenantId = (body.tenantId ?? '').trim();
  const label = (body.label ?? 'run').trim();
  if (!tenantId) return NextResponse.json({ error: 'tenantId_required' }, { status: 400 });

  const db = getAdminFirestoreService();
  const goldenSnap = await db.doc(`tenants/${tenantId}/_evalRetrieval/golden`).get();
  if (!goldenSnap.exists) {
    return NextResponse.json(
      { error: 'no_golden_set', hint: 'run gen_retrieval_goldenset.py --apply first' },
      { status: 404 }
    );
  }
  const items = ((goldenSnap.data()?.items ?? []) as GoldenItem[]).filter(
    (it) => it.query && it.paperId
  );
  if (items.length === 0) {
    return NextResponse.json({ error: 'empty_golden_set' }, { status: 400 });
  }

  const perQuery = await mapWithConcurrency<GoldenItem, PerQuery>(
    items,
    SEARCH_CONCURRENCY,
    async (it) => {
      try {
        const res = await searchPapers({
          tenantId,
          query: it.query,
          vectorTopK: VECTOR_TOP_K,
          topN: TOP_N,
          isPrivileged: true
        });
        const hits = res.hits;
        const goldChunkId = `${it.paperId}-${it.chunkIdx}`;
        return {
          id: it.id,
          chunkRank: firstRank(hits, (h) => `${h.paperId}-${h.chunkIdx}` === goldChunkId),
          paperRank: firstRank(hits, (h) => h.paperId === it.paperId)
        };
      } catch {
        return { id: it.id, chunkRank: null, paperRank: null };
      }
    }
  );

  const chunkRanks = perQuery.map((p) => p.chunkRank);
  const paperRanks = perQuery.map((p) => p.paperRank);

  const metrics = {
    n: items.length,
    chunkFound: chunkRanks.filter((r) => r !== null).length,
    paperFound: paperRanks.filter((r) => r !== null).length,
    chunkRecall: recallMap(chunkRanks),
    paperRecall: recallMap(paperRanks),
    chunkMRR: meanReciprocalRank(chunkRanks),
    paperMRR: meanReciprocalRank(paperRanks)
  };

  const ranAt = Date.now();
  const runRef = await db.collection(`tenants/${tenantId}/_evalRetrievalRuns`).add({
    label,
    ranAt,
    vectorTopK: VECTOR_TOP_K,
    topN: TOP_N,
    metrics,
    perQuery
  });

  return NextResponse.json({ ok: true, runId: runRef.id, label, ranAt, ...metrics });
}
