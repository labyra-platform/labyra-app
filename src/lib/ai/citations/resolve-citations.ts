/**
 * Batch re-resolution of citations that have a DOI but no resolved title.
 *
 * Why this exists (R177-2): the inline resolution in citation-step runs one DOI
 * at a time (~200ms each). A paper with hundreds of references blows past the
 * processing timeout, so most citations get persisted as `unverified` with no
 * title and render as "Untitled reference". This pass re-resolves them in bulk
 * via OpenAlex's OR-filter (50 DOIs/request) — fast enough to finish well within
 * a request — and writes the titles back.
 *
 * Re-uses createCitation()'s update-in-place semantics: the existing rows are
 * `unverified` (trust 1); re-writing them with `doi-exact` (trust 3) overwrites
 * in place (same id = sourcePaperId + targetDoi). DOIs OpenAlex doesn't know are
 * left untouched.
 *
 * @phase R177-2-doi-resolver
 */
import 'server-only';
import {
  createCitation,
  listCitationsBySource,
  recomputeCitationStats
} from '@/lib/firebase/citations/service';
import { lookupDoiBatch } from './openalex';

export interface ResolveCitationsResult {
  /** Citations that had a DOI but no title (candidates for resolution). */
  attempted: number;
  /** Of those, how many got a title written back. */
  resolved: number;
}

function log(event: string, fields: Record<string, unknown>): void {
  // eslint-disable-next-line no-console -- structured audit log
  console.log(JSON.stringify({ level: 'info', step: 'resolve-citations', event, ...fields }));
}

/**
 * Resolve titles for every unresolved citation of one source paper.
 */
export async function resolveCitationsForPaper(
  tenantId: string,
  paperId: string,
  signal?: AbortSignal
): Promise<ResolveCitationsResult> {
  const all = await listCitationsBySource(tenantId, paperId, {});
  const unresolved = all.filter((c) => Boolean(c.targetDoi) && !c.targetTitle?.trim());

  if (unresolved.length === 0) {
    return { attempted: 0, resolved: 0 };
  }

  const found = await lookupDoiBatch(
    unresolved.map((c) => c.targetDoi as string),
    signal
  );

  let resolved = 0;
  for (const c of unresolved) {
    if (signal?.aborted) break;
    const meta = found.get((c.targetDoi as string).toLowerCase());
    if (!meta?.title) continue;

    await createCitation({
      tenantId,
      createdBy: c.createdBy,
      sourcePaperId: c.sourcePaperId,
      targetDoi: c.targetDoi,
      targetTitle: meta.title,
      targetAuthors: meta.authors,
      targetYear: meta.year,
      targetJournal: meta.journal,
      targetPaperId: c.targetPaperId ?? undefined,
      metadataSource: 'openalex',
      confidence: 'doi-exact',
      context: c.context,
      citationType: c.citationType
    });
    resolved += 1;
  }

  if (resolved > 0) {
    try {
      await recomputeCitationStats(tenantId, paperId);
    } catch (err) {
      log('stats_failed', { paperId, error: err instanceof Error ? err.message : String(err) });
    }
  }

  log('done', { paperId, attempted: unresolved.length, resolved });
  return { attempted: unresolved.length, resolved };
}
