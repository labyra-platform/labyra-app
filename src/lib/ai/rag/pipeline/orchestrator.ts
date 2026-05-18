/**
 * Paper processing orchestrator — runs full pipeline with retry + cancellation.
 * @phase R160-ai-5b-2
 */
// R165-phase-1-oxlint: oxlint cleanup
import 'server-only';
import { Timestamp } from 'firebase-admin/firestore';
import type { PaperProcessingJob } from '@/lib/ai/rag/jobs/types';
import { getAdminFirestoreService } from '@/lib/firebase/admin';
import type { Paper } from '@/types/papers';
import { chunkPaper } from './chunking';
// R166-ai6a-3b: citation extraction step
import { runCitationStep } from './citation-step';
import { runEmbedStep } from './embed-step';
import { runEnrichStep } from './enrich-step';
import { runIndexStep } from './index-step';
import { extractMetadata } from './metadata-extract';
import { runOcrStep } from './ocr-step';
import { CancelledError, setPaperCancelled, setPaperError, updatePaperStatus } from './state';

function backoffDelayMs(retryCount: number): number {
  const base = 2 ** retryCount * 1000;
  const jitter = Math.random() * 500;
  return base + jitter;
}

function isFatalError(err: unknown): boolean {
  if (err instanceof CancelledError) return true;
  const msg = err instanceof Error ? err.message : String(err);
  // Fatal: auth, quota, malformed
  return (
    msg.includes('unauthorized') ||
    msg.includes('quota_exceeded') ||
    msg.includes('invalid_pdf') ||
    msg.includes('malformed')
  );
}

async function loadPaper(tenantId: string, paperId: string): Promise<Paper | null> {
  const db = getAdminFirestoreService();
  const snap = await db.doc(`tenants/${tenantId}/papers/${paperId}`).get();
  if (!snap.exists) return null;
  const data = snap.data() as Paper;
  return data;
}

export async function processPaperJob(job: PaperProcessingJob, signal: AbortSignal): Promise<void> {
  const { tenantId, paperId } = job;
  const startedAt = Date.now();

  const log = (event: string, extra: Record<string, unknown> = {}) => {
    // eslint-disable-next-line no-console -- structured logging for audit
    console.log(
      JSON.stringify({
        level: 'info',
        event,
        paperId,
        tenantId,
        jobId: job.jobId,
        ts: new Date().toISOString(),
        ...extra
      })
    );
  };

  try {
    const paper = await loadPaper(tenantId, paperId);
    if (!paper) {
      log('paper_not_found');
      return;
    }

    if (paper.status === 'cancelling' || paper.status === 'cancelled') {
      log('paper_already_cancelled');
      await setPaperCancelled(tenantId, paperId);
      return;
    }

    // Mark processingStartedAt
    const db = getAdminFirestoreService();
    await db.doc(`tenants/${tenantId}/papers/${paperId}`).update({
      processingStartedAt: Timestamp.now()
    });

    log('pipeline_start');

    // ── STEP 1: OCR ─────────────────────────────────────────
    log('step_ocr_start');
    const ocrResult = await runOcrStep({
      tenantId,
      paperId,
      storagePath: paper.storagePath,
      signal
    });
    log('step_ocr_done', {
      pages: ocrResult.pageCount,
      costUsd: ocrResult.costUsd
    });

    // Hotfix-5d-4: extract real title/year/DOI from first page (~$0.001/paper)
    try {
      const firstPageText = ocrResult.pages?.[0]?.text ?? '';
      const meta = await extractMetadata(firstPageText);
      // Persist to paper doc
      const db = getAdminFirestoreService();
      const paperRef = db.doc(`tenants/${tenantId}/papers/${paperId}`);
      await paperRef.update({
        title: meta.title,
        authors: meta.authors,
        year: meta.year,
        doi: meta.doi,
        metadataExtractedAt: Timestamp.now()
      });
      // Update local paper for downstream steps (so index-step uses real metadata)
      paper.title = meta.title;
      paper.authors = meta.authors;
      paper.year = meta.year;
      paper.doi = meta.doi;
    } catch (err) {
      log('metadata_extract_skipped', {
        paperId,
        error: err instanceof Error ? err.message : String(err)
      });
    }

    // ── STEP 2: Chunking ────────────────────────────────────
    await updatePaperStatus(tenantId, paperId, 'chunking');
    log('step_chunking_start');
    const chunks = chunkPaper(ocrResult);
    await db.doc(`tenants/${tenantId}/papers/${paperId}`).update({
      chunkCount: chunks.length
    });
    log('step_chunking_done', { chunks: chunks.length });

    // ── STEP 3: Contextual enrichment ───────────────────────
    await updatePaperStatus(tenantId, paperId, 'enriching');
    log('step_enriching_start');
    const enriched = await runEnrichStep({
      tenantId,
      paperId,
      fullDocumentMd: ocrResult.fullText,
      chunks,
      signal
    });
    await db.doc(`tenants/${tenantId}/papers/${paperId}`).update({
      enrichedChunkCount: enriched.length
    });
    log('step_enriching_done', { enriched: enriched.length });

    // ── STEP 4: Embedding ───────────────────────────────────
    await updatePaperStatus(tenantId, paperId, 'embedding');
    log('step_embedding_start');
    const embedded = await runEmbedStep({
      tenantId,
      paperId,
      chunks: enriched,
      signal
    });
    await db.doc(`tenants/${tenantId}/papers/${paperId}`).update({
      embeddedChunkCount: embedded.length
    });
    log('step_embedding_done', { embedded: embedded.length });

    // ── STEP 5: Indexing ────────────────────────────────────
    await updatePaperStatus(tenantId, paperId, 'indexing');
    log('step_indexing_start');
    const indexed = await runIndexStep({
      tenantId,
      paper: {
        id: paper.id,
        title: paper.title,
        authors: paper.authors,
        year: paper.year,
        doi: paper.doi
      },
      chunks: embedded,
      signal
    });
    await db.doc(`tenants/${tenantId}/papers/${paperId}`).update({
      indexedChunkCount: indexed
    });
    log('step_indexing_done', { indexed });

    // ── STEP 6: Citation extraction (non-blocking) ─────────
    // R166-ai6a-3b: extract DOI references → Citation edges
    try {
      await updatePaperStatus(tenantId, paperId, 'extracting_citations');
      log('step_citation_start');
      // Concatenate per-page OCR text into single fullText for reference parsing
      const fullText = (ocrResult.pages ?? []).map((p) => p.text ?? '').join('\n\n');
      const citationResult = await runCitationStep({
        tenantId,
        paper: {
          id: paper.id,
          createdBy: paper.createdBy
        },
        fullText,
        signal
      });
      log('step_citation_done', citationResult as unknown as Record<string, unknown>);
    } catch (citationErr) {
      // Non-fatal: citation extraction failure must NOT fail paper indexing.
      // Log and continue — paper is still searchable via vector embeddings.
      if (citationErr instanceof CancelledError) throw citationErr;
      log('step_citation_failed', {
        error: citationErr instanceof Error ? citationErr.message : String(citationErr)
      });
    }

    // ── DONE ────────────────────────────────────────────────
    await updatePaperStatus(tenantId, paperId, 'indexed', {
      processingCompletedAt: Timestamp.now(),
      totalLatencyMs: Date.now() - startedAt
    });
    log('pipeline_complete', { latencyMs: Date.now() - startedAt });
  } catch (err) {
    if (err instanceof CancelledError) {
      log('pipeline_cancelled');
      await setPaperCancelled(tenantId, paperId);
      return;
    }

    const msg = err instanceof Error ? err.message : String(err);

    if (isFatalError(err)) {
      log('pipeline_fatal_error', { error: msg });
      await setPaperError(tenantId, paperId, msg, false);
      return;
    }

    // Retryable error — check retry count
    const paper = await loadPaper(tenantId, paperId);
    if (!paper) return;

    // Hotfix-3: check retry cap STRICTLY (don't schedule retry if would exceed)
    const nextRetryCount = paper.retryCount + 1;
    if (nextRetryCount > paper.maxRetries) {
      log('pipeline_max_retries_exceeded', {
        retries: paper.retryCount,
        error: msg
      });
      await setPaperError(
        tenantId,
        paperId,
        `${msg} (exceeded max retries: ${paper.maxRetries})`,
        false
      );
      return;
    }

    // Increment retry, wait, re-throw to outer (queue will not re-call automatically
    // since we have no DLQ — log and mark for manual reprocess)
    await setPaperError(tenantId, paperId, msg, true);
    log('pipeline_retryable_error', {
      retryCount: paper.retryCount + 1,
      error: msg
    });

    // Schedule retry via setTimeout (Stage 1 limitation — Stage 2 PubSub does this natively)
    const delayMs = backoffDelayMs(paper.retryCount + 1);
    log('pipeline_retry_scheduled', { delayMs });
    setTimeout(() => {
      // Re-enter pipeline
      processPaperJob(job, signal).catch((retryErr) => {
        console.error('retry_failed', retryErr);
      });
    }, delayMs);
  }
}
