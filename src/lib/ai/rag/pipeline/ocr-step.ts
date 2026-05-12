/**
 * OCR step — Mistral OCR via OcrProvider abstraction.
 * @phase R160-ai-5b-2
 */
import 'server-only';
import { getOcrProvider } from '@/lib/ai/rag/ocr';
import { getAdminStorageService } from '@/lib/firebase/admin';
import { updatePaperStatus, incrementPaperCost, throwIfCancelled } from './state';
import type { OcrResult } from '@/lib/ai/rag/ocr';

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

  // Update page count
  const { getAdminFirestoreService } = await import('@/lib/firebase/admin');
  await getAdminFirestoreService().doc(`tenants/${tenantId}/papers/${paperId}`).update({
    pageCount: result.pageCount
  });

  return result;
}
