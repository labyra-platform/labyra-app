/**
 * Parse user-pasted XRD reference card text (client-side, no worker call).
 *
 * Mirrors Python implementation at src/reference/parser.py in spectra-worker.
 * Keep in sync if either side changes.
 *
 * @phase R160-spectra-4a-pdf
 */
import type { ReferenceCardPeak } from '@/types/spectra';

export interface ParsedReferenceCard {
  cardNumber: string;
  phaseName: string;
  formula: string;
  schemaDetected: '2T_D_I_HKL' | '2T_I_HKL' | '2T_D_I' | '2T_I';
  peaks: ReferenceCardPeak[];
  nPeaks: number;
}

const PDF_CARD_PATTERN =
  /(PDF-?[24]?\+?\s*#?\s*\d+[-\s]\d+|ICDD\s*\d+[-\s]\d+|JCPDS\s*\d+[-\s]\d+)/i;
const FORMULA_PATTERN = /\b((?:[A-Z][a-z]?\d*){2,8})\b/;

function isHklDefinite(token: string): boolean {
  const t = token.replace(/[()[\]]/g, '');
  if (t.includes('_')) {
    const parts = t.split('_');
    return parts.length === 3 && parts.every((p) => /^-?\d{1,2}$/.test(p));
  }
  if (t.slice(1).includes('-')) {
    return /^-?\d-?\d-?\d$/.test(t);
  }
  return false;
}

function looksLikeCompactHkl(token: string): boolean {
  return /^\d{3}$/.test(token);
}

function splitColumns(line: string): string[] {
  // Protect (h k l) by joining with underscore
  const protectedLine = line.replace(
    /[([]\s*(-?\d{1,2})\s+(-?\d{1,2})\s+(-?\d{1,2})\s*[)\]]/g,
    '$1_$2_$3'
  );
  return protectedLine
    .trim()
    .split(/[\s,;|\t]+/)
    .filter(Boolean);
}

function classifyTokens(parts: string[]): { nums: number[]; hkls: string[] } {
  if (parts.length === 0) return { nums: [], hkls: [] };
  const nums: number[] = [];
  const hkls: string[] = [];
  let lastUsedAsHkl = false;

  for (const p of parts) {
    if (isHklDefinite(p)) {
      hkls.push(p.replace(/[()[\]]/g, '').replace(/_/g, ' '));
    }
  }

  const last = parts[parts.length - 1];
  if (hkls.length === 0 && looksLikeCompactHkl(last) && parts.length >= 3) {
    hkls.push(last);
    lastUsedAsHkl = true;
  }

  for (let i = 0; i < parts.length; i++) {
    if (lastUsedAsHkl && i === parts.length - 1) continue;
    if (isHklDefinite(parts[i])) continue;
    const n = Number.parseFloat(parts[i]);
    if (!Number.isNaN(n)) nums.push(n);
  }
  return { nums, hkls };
}

function looksLikePeakLine(parts: string[]): boolean {
  if (parts.length === 0) return false;
  const first = Number.parseFloat(parts[0]);
  return !Number.isNaN(first) && first > 2 && first < 180;
}

function detectSchema(peakParts: string[][]): ParsedReferenceCard['schemaDetected'] {
  const sample = peakParts.slice(0, 5);
  let hasHklCount = 0;
  let hasDCount = 0;
  const tokenCounts: number[] = [];
  for (const parts of sample) {
    const { nums, hkls } = classifyTokens(parts);
    tokenCounts.push(nums.length);
    if (hkls.length > 0) hasHklCount++;
    if (nums.length >= 3 && nums[1] > 0.3 && nums[1] < 30) hasDCount++;
  }
  const hasHkl = hasHklCount >= Math.floor(sample.length / 2) + 1;
  const hasD = hasDCount >= Math.floor(sample.length / 2) + 1;
  if (hasD && hasHkl) return '2T_D_I_HKL';
  if (hasD) return '2T_D_I';
  if (hasHkl) return '2T_I_HKL';
  return '2T_I';
}

function parsePeakWithSchema(
  parts: string[],
  schema: ParsedReferenceCard['schemaDetected']
): ReferenceCardPeak | null {
  const { nums, hkls } = classifyTokens(parts);
  if (nums.length === 0) return null;
  const twoTheta = nums[0];
  if (twoTheta <= 2 || twoTheta >= 180) return null;

  let dSpacing: number | undefined;
  let intensity: number | undefined;
  let hkl = hkls[0] ?? '';

  if (schema === '2T_D_I_HKL') {
    if (nums.length >= 3) {
      dSpacing = nums[1] > 0.3 && nums[1] < 30 ? nums[1] : undefined;
      intensity = nums[2];
    }
  } else if (schema === '2T_D_I') {
    if (nums.length >= 3) {
      dSpacing = nums[1] > 0.3 && nums[1] < 30 ? nums[1] : undefined;
      intensity = nums[2];
    } else if (nums.length === 2) {
      intensity = nums[1];
    }
  } else if (schema === '2T_I_HKL') {
    if (nums.length >= 2) intensity = nums[1];
    if (!hkl && nums.length >= 3) {
      const third = Math.floor(nums[2]);
      if (third >= 0 && third < 1000) hkl = String(third).padStart(3, '0');
    }
  } else {
    if (nums.length >= 2) intensity = nums[1];
  }

  if (intensity === undefined || intensity <= 0 || intensity > 100) return null;

  const peak: ReferenceCardPeak = {
    twoTheta: Number(twoTheta.toFixed(3)),
    intensity: Number(intensity.toFixed(1))
  };
  if (dSpacing !== undefined) peak.dSpacing = Number(dSpacing.toFixed(4));
  if (hkl) peak.hkl = hkl;
  return peak;
}

export function parseReferenceCard(text: string): ParsedReferenceCard {
  if (!text?.trim()) throw new Error('Empty text');

  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) throw new Error('No content');

  const peakLineIdxs: number[] = [];
  const peakParts: string[][] = [];
  for (let i = 0; i < lines.length; i++) {
    const parts = splitColumns(lines[i]);
    if (looksLikePeakLine(parts)) {
      peakLineIdxs.push(i);
      peakParts.push(parts);
    }
  }

  if (peakLineIdxs.length === 0) {
    throw new Error('No peak data found (expected 2θ values between 2 and 180 degrees)');
  }

  const firstPeakIdx = peakLineIdxs[0];
  const metadataLines = lines.slice(0, firstPeakIdx);

  let cardNumber = '';
  let phaseName = '';
  for (const line of metadataLines) {
    if (!cardNumber) {
      const m = line.match(PDF_CARD_PATTERN);
      if (m) {
        cardNumber = m[1].trim();
        continue;
      }
    }
    if (!phaseName && !PDF_CARD_PATTERN.test(line)) {
      phaseName = line.slice(0, 100);
    }
  }

  if (!cardNumber) cardNumber = `Custom-${(phaseName || 'Unnamed').slice(0, 20)}`;

  let formula = '';
  if (phaseName) {
    const m = phaseName.match(FORMULA_PATTERN);
    if (m) {
      const cand = m[0];
      const hasDigit = /\d/.test(cand);
      const upperCount = [...cand].filter((c) => c >= 'A' && c <= 'Z').length;
      if (hasDigit || upperCount >= 2) formula = cand;
    }
  }

  const schema = detectSchema(peakParts);
  const peaks: ReferenceCardPeak[] = [];
  for (const parts of peakParts) {
    const peak = parsePeakWithSchema(parts, schema);
    if (peak) peaks.push(peak);
  }

  if (peaks.length < 3) {
    throw new Error(`Too few peaks (${peaks.length}). Need at least 3.`);
  }

  return {
    cardNumber,
    phaseName: phaseName || 'Unknown phase',
    formula,
    schemaDetected: schema,
    peaks,
    nPeaks: peaks.length
  };
}
