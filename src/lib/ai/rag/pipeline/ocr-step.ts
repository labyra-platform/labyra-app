/**
 * OCR step — Mistral OCR via OcrProvider abstraction.
 * @phase R160-ai-5b-2
 */
import 'server-only';
import type { OcrResult } from '@/lib/ai/rag/ocr';
import { getOcrProvider } from '@/lib/ai/rag/ocr';
import { getAdminStorageService } from '@/lib/firebase/admin';
import { incrementPaperCost, throwIfCancelled, updatePaperStatus } from './state';

interface OcrStepInput {
  tenantId: string;
  paperId: string;
  storagePath: string;
  signal: AbortSignal;
}

export async function runOcrStep(input: OcrStepInput): Promise<OcrResult> {
  const { tenantId, paperId, storagePath, signal } = input;

  throwIfCancelled(signal);
  await updatePaperStatus(tenantId, paperId, 'ocr');

  // Download PDF from Storage
  const bucket = getAdminStorageService().bucket();
  const file = bucket.file(storagePath.replace(`gs://${bucket.name}/`, ''));
  const [buffer] = await file.download();

  throwIfCancelled(signal);

  // Run OCR
  const ocrProvider = getOcrProvider();
  const result = await ocrProvider.processPdf(buffer);

  throwIfCancelled(signal);

  // Track cost
  await incrementPaperCost(tenantId, paperId, 'ocr', result.costUsd);

  // Upload extracted figures + collect light metadata. Best-effort — a figure
  // upload must never fail OCR, so each is guarded independently.
  const storedFigures: { name: string; page: number; storagePath: string; mimeType: string }[] = [];
  if (result.figures && result.figures.length > 0) {
    for (const fig of result.figures) {
      if (!fig.dataBase64) continue;
      try {
        const path = `tenants/${tenantId}/papers/${paperId}/figures/${fig.name}`;
        await bucket.file(path).save(Buffer.from(fig.dataBase64, 'base64'), {
          contentType: fig.mimeType,
          resumable: false
        });
        fig.storagePath = `gs://${bucket.name}/${path}`;
        fig.dataBase64 = undefined;
        storedFigures.push({
          name: fig.name,
          page: fig.page,
          storagePath: fig.storagePath,
          mimeType: fig.mimeType
        });
      } catch (err) {
        console.warn('ocr.figure.upload_failed', fig.name, String(err));
      }
    }
  }

  // Update page count (+ figures when present)
  const { getAdminFirestoreService } = await import('@/lib/firebase/admin');
  await getAdminFirestoreService()
    .doc(`tenants/${tenantId}/papers/${paperId}`)
    .update({
      pageCount: result.pageCount,
      ...(storedFigures.length > 0
        ? { figures: storedFigures, figureCount: storedFigures.length }
        : {})
    });

  return result;
}
