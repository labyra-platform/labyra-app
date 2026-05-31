/**
 * olmOCR 2 adapter — PLUG POINT (not wired yet).
 *
 * License posture (see docs/adr/ADR-048): olmOCR 2 = Apache-2.0 for BOTH the
 * code and the model weights (built on Qwen2.5-VL). No revenue cap, no funding
 * cap, no no-compete clause → the clean, permanent-free option to migrate to if
 * we ever cross Chandra's $2M OpenRAIL-M gate.
 *
 * Why a stub and not a finished adapter: olmOCR serves as a vLLM OpenAI-compatible
 * VLM, so a faithful integration rasterizes each PDF page to an image and prompts
 * the model per page. That page-loop + prompt glue is the work to do here. The
 * registry + router already route to this engine, so wiring it later is a focused
 * task confined to this file.
 *
 * Recipe to wire:
 *   1. Set OLMOCR_URL to your vLLM endpoint (/v1/chat/completions).
 *   2. Rasterize PDF pages (pdf-to-img / pdfium) → one PNG per page.
 *   3. POST each page as an image content block with the olmOCR prompt; collect markdown.
 *   4. Assemble OcrPage[] → return OcrResult (mirror chandra.ts).
 *
 * @phase R257 (plug point)
 */
import 'server-only';
import type { OcrMode, OcrProvider, OcrResult } from './types';

export class OlmOcrProvider implements OcrProvider {
  readonly id = 'olmocr-2';
  readonly costPer1000Pages = 0; // self-hosted

  processPdf(_pdfBuffer: Buffer, _options?: { mode?: OcrMode }): Promise<OcrResult> {
    return Promise.reject(
      new Error(
        'olmOCR engine is a plug point and not wired yet. ' +
          'See src/lib/ai/rag/ocr/olmocr.ts (recipe in header) and ADR-048.'
      )
    );
  }

  health(): Promise<boolean> {
    return Promise.resolve(false); // not wired
  }
}
