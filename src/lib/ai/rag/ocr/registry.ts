/**
 * OCR engine registry — single source of truth for which engines exist,
 * their license posture, and how to construct them.
 *
 * Selection is env-driven in ./index. License rationale: docs/adr/ADR-048.
 * @phase R257
 */
import 'server-only';
import { ChandraOcrProvider } from './chandra';
import { DatalabOcrProvider } from './datalab';
import { DoclingOcrProvider } from './docling';
import { MistralOcrProvider } from './mistral';
import { OlmOcrProvider } from './olmocr';
import type { OcrEngineId, OcrProvider } from './types';

export interface OcrEngineInfo {
  id: OcrEngineId;
  label: string;
  /** 'wired' = usable now; 'plug-point' = interface ready, fill glue + set env */
  status: 'wired' | 'plug-point';
  /** License posture for commercial SaaS (see ADR-048) */
  license: string;
  /** Lazy constructor */
  create: () => OcrProvider;
}

export const OCR_ENGINES: Record<OcrEngineId, OcrEngineInfo> = {
  mistral: {
    id: 'mistral',
    label: 'Mistral OCR 3',
    status: 'wired',
    license: 'Cloud API — per-page billing, no model redistribution',
    create: () => new MistralOcrProvider()
  },
  chandra: {
    id: 'chandra',
    label: 'Chandra 2 (self-hosted)',
    status: 'wired',
    license: 'Code Apache-2.0; weights OpenRAIL-M (<$2M rev AND <$2M funding AND no-compete)',
    create: () => new ChandraOcrProvider()
  },
  datalab: {
    id: 'datalab',
    label: 'Datalab API (hosted Marker)',
    status: 'wired',
    license: 'Paid cloud service (per-page) — $2M open-weights gate N/A',
    create: () => new DatalabOcrProvider()
  },
  olmocr: {
    id: 'olmocr',
    label: 'olmOCR 2 (self-hosted)',
    status: 'plug-point',
    license: 'Apache-2.0 (code + weights) — clean, no caps',
    create: () => new OlmOcrProvider()
  },
  docling: {
    id: 'docling',
    label: 'Docling + Granite-Docling',
    status: 'plug-point',
    license: 'MIT (code) + Apache-2.0 (weights) — clean, no caps',
    create: () => new DoclingOcrProvider()
  }
};

const DEFAULT_ENGINE: OcrEngineId = 'mistral';

/** Resolve an engine id (case-insensitive) to a fresh provider instance. */
export function resolveOcrEngine(id: string | undefined): OcrProvider {
  const key = (id ?? DEFAULT_ENGINE).toLowerCase().trim();
  const info = (OCR_ENGINES as Record<string, OcrEngineInfo | undefined>)[key];
  if (!info) {
    throw new Error(`Unknown OCR engine "${id}". Valid: ${Object.keys(OCR_ENGINES).join(', ')}`);
  }
  return info.create();
}
