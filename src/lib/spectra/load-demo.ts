/**
 * Demo dataset loader.
 *
 * Fetches a public demo file and returns a File object that the dropzone
 * accepts identically to user-uploaded files. No branching downstream.
 *
 * @phase R162-demo-dataset
 */

export interface DemoSample {
  id: string;
  filename: string;
  spectrumType: 'xrd';
  label_vi: string;
  label_en: string;
  formula: string;
  description_vi: string;
  description_en: string;
  anode: string;
  monochromator: string;
  expectedPhase: string;
  sizeBytes: number;
}

export interface DemoManifest {
  version: number;
  samples: DemoSample[];
}

const MANIFEST_URL = '/demos/spectra/manifest.json';
const FILES_BASE = '/demos/spectra';

let manifestCache: DemoManifest | null = null;

export async function loadDemoManifest(): Promise<DemoManifest> {
  if (manifestCache) return manifestCache;
  const res = await fetch(MANIFEST_URL, { cache: 'force-cache' });
  if (!res.ok) {
    throw new Error(`demo_manifest_${res.status}`);
  }
  const data: unknown = await res.json();
  if (!isManifest(data)) {
    throw new Error('demo_manifest_invalid');
  }
  manifestCache = data;
  return data;
}

export async function fetchDemoFile(sample: DemoSample): Promise<File> {
  const url = `${FILES_BASE}/${sample.filename}`;
  const res = await fetch(url, { cache: 'force-cache' });
  if (!res.ok) {
    throw new Error(`demo_file_${res.status}`);
  }
  const blob = await res.blob();
  return new File([blob], sample.filename, {
    type: 'text/plain',
    lastModified: Date.now()
  });
}

function isManifest(value: unknown): value is DemoManifest {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as { version?: unknown; samples?: unknown };
  return (
    typeof candidate.version === 'number' &&
    Array.isArray(candidate.samples) &&
    candidate.samples.every(isSample)
  );
}

function isSample(value: unknown): value is DemoSample {
  if (typeof value !== 'object' || value === null) return false;
  const s = value as Record<string, unknown>;
  return (
    typeof s.id === 'string' &&
    typeof s.filename === 'string' &&
    s.spectrumType === 'xrd' &&
    typeof s.formula === 'string'
  );
}
