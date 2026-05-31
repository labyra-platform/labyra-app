/**
 * Docling adapter — PLUG POINT (not wired yet).
 *
 * License posture (see docs/adr/ADR-048): Docling code = MIT; companion
 * Granite-Docling-258M weights = Apache-2.0. Clean, permissive, runs fully
 * local/air-gapped → strong "sensitive tenant" + permanent-free option.
 *
 * Why a stub: Docling typically runs as a Python lib or a `docling-serve` HTTP
 * service. The registry + router already route here; wiring later is confined to
 * this file.
 *
 * Recipe to wire:
 *   1. Stand up docling-serve (or a small FastAPI wrapper) and set DOCLING_URL.
 *   2. POST the PDF; Docling returns a DoclingDocument (export to markdown).
 *   3. Map exported markdown/pages → OcrPage[] → OcrResult (mirror chandra.ts).
 *
 * @phase R257 (plug point)
 */
import 'server-only';
import type { OcrMode, OcrProvider, OcrResult } from './types';

export class DoclingOcrProvider implements OcrProvider {
  readonly id = 'docling';
  readonly costPer1000Pages = 0;

  processPdf(_pdfBuffer: Buffer, _options?: { mode?: OcrMode }): Promise<OcrResult> {
    return Promise.reject(
      new Error(
        'Docling engine is a plug point and not wired yet. ' +
          'See src/lib/ai/rag/ocr/docling.ts (recipe in header) and ADR-048.'
      )
    );
  }

  health(): Promise<boolean> {
    return Promise.resolve(false);
  }
}
