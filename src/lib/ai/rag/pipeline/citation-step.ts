/**
 * Citation extraction step — runs after indexing.
 *
 * Extracts DOIs from paper OCR text, resolves metadata via Crossref/OpenAlex,
 * stores Citation edges in Firestore. Non-blocking: failures logged only.
 *
 * @phase R166-ai6a-3b
 */
import 'server-only';
import { extractDoisFromText } from '@/lib/ai/citations/references-parser';
import { lookupDoi } from '@/lib/ai/citations/openalex';
import {
  createCitation,
  resolveInternalTarget,
  recomputeCitationStats,
  listCitationsBySource
} from '@/lib/firebase/citations/service';
import { getAdminFirestoreService } from '@/lib/firebase/admin';
import { CancelledError } from './state';

const CROSSREF_RATE_LIMIT_MS = 200; // 5 req/s — well below 50/s shared limit
const MAX_DOIS_PER_PAPER = 100; // safety cap

export interface CitationStepInput {
  tenantId: string;
  paper: {
    id: string;
    createdBy?: string;
  };
  fullText: string;
  signal?: AbortSignal;
}

export interface CitationStepResult {
  doisFound: number;
  citationsCreated: number;
  resolutionsLinked: number;
  apiFailures: number;
}

function log(event: string, fields: Record<string, unknown>): void {
  // eslint-disable-next-line no-console -- structured pipeline audit log
  console.log(JSON.stringify({ level: 'info', step: 'citation', event, ...fields }));
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(new CancelledError());
      },
      { once: true }
    );
  });
}

/**
 * Find internal paperId for a target DOI (cross-reference resolution).
 * Returns null if target not in our tenant's papers collection.
 */
async function findInternalPaperByDoi(
  tenantId: string,
  doi: string,
  signal?: AbortSignal
): Promise<string | null> {
  if (signal?.aborted) throw new CancelledError();
  const db = getAdminFirestoreService();
  const snap = await db
    .collection('tenants')
    .doc(tenantId)
    .collection('papers')
    .where('doi', '==', doi)
    .where('lifecycleStatus', '==', 'active')
    .limit(1)
    .get();
  if (snap.empty) return null;
  return snap.docs[0].id;
}

/**
 * Run citation extraction for a paper.
 *
 * Errors during DOI lookup are caught + logged (apiFailures counter).
 * Only CancelledError propagates.
 */
export async function runCitationStep(input: CitationStepInput): Promise<CitationStepResult> {
  const { tenantId, paper, fullText, signal } = input;
  const result: CitationStepResult = {
    doisFound: 0,
    citationsCreated: 0,
    resolutionsLinked: 0,
    apiFailures: 0
  };

  log('extract_start', { paperId: paper.id });

  // 1. Extract DOIs from text
  const refs = extractDoisFromText(fullText, MAX_DOIS_PER_PAPER);
  result.doisFound = refs.length;
  log('extract_done', { paperId: paper.id, doisFound: refs.length });

  if (refs.length === 0) return result;

  // 2. Check existing citations (skip re-lookup of already-resolved DOIs)
  const existing = await listCitationsBySource(tenantId, paper.id, {
    includeDeprecated: false
  });
  const existingDois = new Set(
    existing.map((c) => c.targetDoi?.toLowerCase()).filter(Boolean) as string[]
  );

  // 3. Lookup + create each citation
  const createdBy = paper.createdBy ?? 'citation-extraction-system';
  for (let i = 0; i < refs.length; i++) {
    if (signal?.aborted) throw new CancelledError();
    const ref = refs[i];

    // Skip if already exists (idempotent)
    if (existingDois.has(ref.doi.toLowerCase())) {
      log('skip_existing', { doi: ref.doi });
      continue;
    }

    // Rate limit between API calls
    if (i > 0) await sleep(CROSSREF_RATE_LIMIT_MS, signal);

    let metadata: Awaited<ReturnType<typeof lookupDoi>> = null;
    try {
      metadata = await lookupDoi(ref.doi, signal);
    } catch (err) {
      if (err instanceof CancelledError) throw err;
      result.apiFailures += 1;
      log('lookup_failed', {
        doi: ref.doi,
        error: err instanceof Error ? err.message : String(err)
      });
      // Still create citation with DOI only (no metadata) — context preserved
    }

    try {
      // Resolve internal target (if cited paper is also in our DB)
      const internalTargetId = await findInternalPaperByDoi(tenantId, ref.doi, signal);
      if (internalTargetId) result.resolutionsLinked += 1;

      await createCitation({
        tenantId,
        createdBy,
        sourcePaperId: paper.id,
        targetDoi: ref.doi,
        targetTitle: metadata?.title,
        targetAuthors: metadata?.authors,
        targetYear: metadata?.year,
        targetJournal: metadata?.journal,
        targetPaperId: internalTargetId,
        metadataSource: metadata?.source ?? 'pdf-only',
        confidence: 'doi-exact',
        context: ref.context
      });
      result.citationsCreated += 1;
    } catch (err) {
      if (err instanceof CancelledError) throw err;
      log('create_failed', {
        doi: ref.doi,
        error: err instanceof Error ? err.message : String(err)
      });
    }
  }

  // 4. Recompute stats for source paper
  try {
    await recomputeCitationStats(tenantId, paper.id);
  } catch (err) {
    log('stats_failed', {
      paperId: paper.id,
      error: err instanceof Error ? err.message : String(err)
    });
  }

  log('done', {
    paperId: paper.id,
    ...result
  });
  return result;
}

// Re-export resolveInternalTarget for batch re-resolution scripts
export { resolveInternalTarget };
