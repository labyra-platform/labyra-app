/**
 * Multi-spectrum reference card parser.
 *
 * Auto-detects spectrum type (FTIR/Raman/UV-Vis) from header keywords,
 * then routes to appropriate parser. XRD continues via legacy parser
 * (parse-reference-card.ts) for backward compatibility.
 *
 * Format support:
 *   FTIR:   "wavenumber | cm⁻¹ | cm-1" header → wavenumber + intensity (+ assignment)
 *   Raman:  "raman shift | shift" header → shift + intensity (+ assignment)
 *   UV-Vis: "wavelength | nm | absorbance" header → wavelength + intensity (+ assignment)
 *
 * Qualitative intensity codes (peer-reviewed papers):
 *   vs / s+ → 100   (very strong)
 *   s       → 75    (strong)
 *   m       → 50    (medium)
 *   w       → 25    (weak)
 *   vw / sh → 10    (very weak / shoulder)
 *
 * @phase R163-spectra-4c-3
 */
import type {
  FTIRReferenceCardPeak,
  RamanReferenceCardPeak,
  SpectrumTypeRefCard,
  UVVisReferenceCardPeak
} from '@/types/spectra';

export interface ParsedMultiReferenceCard {
  spectrumType: SpectrumTypeRefCard;
  cardNumber: string;
  phaseName: string;
  formula?: string;
  peaks: Array<FTIRReferenceCardPeak | RamanReferenceCardPeak | UVVisReferenceCardPeak>;
  nPeaks: number;
  detectedFromHeader: string; // for debugging which keyword matched
}

// ─── Intensity code → numeric ─────────────────────────────────────────
const INTENSITY_CODE_MAP: Record<string, number> = {
  vs: 100,
  's+': 100,
  s: 75,
  m: 50,
  w: 25,
  vw: 10,
  sh: 10, // shoulder
  br: 50, // broad — assume medium baseline
  // Vietnamese papers sometimes use:
  mạnh: 75,
  trung: 50,
  yếu: 25
};

function parseIntensity(token: string): number | null {
  // Try numeric first
  const n = Number.parseFloat(token);
  if (!Number.isNaN(n)) {
    // Normalize 0-1 absorbance → 0-100, leave 0-100 as is
    if (n > 0 && n <= 1.5) return Math.round(n * 100);
    if (n > 0 && n <= 100) return n;
  }
  // Try code (case-insensitive, strip punctuation)
  const cleaned = token.toLowerCase().replace(/[.,;:()]/g, '');
  if (cleaned in INTENSITY_CODE_MAP) return INTENSITY_CODE_MAP[cleaned];
  return null;
}

// ─── Format detection ─────────────────────────────────────────────────
const HEADER_PATTERNS: Array<{
  type: SpectrumTypeRefCard;
  pattern: RegExp;
  example: string;
}> = [
  {
    type: 'raman',
    pattern: /raman\s*shift|shift\s*\(cm/i,
    example: 'Raman shift (cm⁻¹)'
  },
  {
    type: 'ftir',
    pattern: /wavenumber|cm[-\u207B]\s*1|cm⁻¹/i,
    example: 'Wavenumber (cm⁻¹)'
  },
  {
    type: 'uvvis',
    pattern: /wavelength|absorbance|\bnm\b/i,
    example: 'Wavelength (nm)'
  }
];

export function detectSpectrumType(text: string): {
  type: SpectrumTypeRefCard | null;
  headerLine: string;
} {
  const lines = text.split('\n').slice(0, 10); // scan first 10 lines for header
  for (const line of lines) {
    for (const { type, pattern } of HEADER_PATTERNS) {
      if (pattern.test(line)) {
        return { type, headerLine: line.trim() };
      }
    }
  }
  return { type: null, headerLine: '' };
}

// ─── Common helpers ───────────────────────────────────────────────────
function splitColumns(line: string): string[] {
  // Same as XRD parser — split by whitespace/comma/tab, preserve assignments
  // in quotes if present
  return line
    .trim()
    .split(/[\s,;|\t]+/)
    .filter(Boolean);
}

function isPeakLineGeneric(parts: string[], minPosition: number, maxPosition: number): boolean {
  if (parts.length < 2) return false;
  const first = Number.parseFloat(parts[0]);
  return !Number.isNaN(first) && first >= minPosition && first <= maxPosition;
}

function looksLikeHeaderRow(line: string): boolean {
  const lower = line.toLowerCase();
  return /wavenumber|wavelength|shift|intensity|absorb|assign|peak\s*#/i.test(lower);
}

function extractPhaseInfo(text: string): {
  cardNumber: string;
  phaseName: string;
  formula?: string;
} {
  // Reuse XRD heuristic: first non-numeric line with phase-like info
  // For paper-style cards, accept any title-like first line
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  let phaseName = 'Reference card';
  let cardNumber = `custom-${Date.now().toString(36)}`;
  let formula: string | undefined;

  for (const line of lines.slice(0, 5)) {
    if (looksLikeHeaderRow(line)) continue;
    if (/^\d/.test(line)) continue; // skip lines starting with digit (data rows)
    // First text-like line is phase name
    if (phaseName === 'Reference card') {
      phaseName = line.slice(0, 100);
      // Extract formula heuristic: like "SiO2 silica" → formula=SiO2
      const fMatch = line.match(/\b([A-Z][a-z]?\d*){2,8}\b/);
      if (fMatch) formula = fMatch[0];
    }
    // Card number pattern: "Ref: Smith 2020" or "JCPDS xx-xxxx" or "Custom XYZ"
    const refMatch = line.match(/(ref(?:erence)?\s*[:#]?\s*|jcpds\s*)([\w\-\s]+)/i);
    if (refMatch) cardNumber = refMatch[0].slice(0, 50).trim();
  }
  return { cardNumber, phaseName, formula };
}

// ─── FTIR parser ──────────────────────────────────────────────────────
export function parseFTIRReferenceCard(text: string): ParsedMultiReferenceCard {
  const { headerLine } = detectSpectrumType(text);
  const lines = text.split('\n');
  const peaks: FTIRReferenceCardPeak[] = [];

  for (const line of lines) {
    const parts = splitColumns(line);
    if (!isPeakLineGeneric(parts, 100, 8000)) continue;
    if (looksLikeHeaderRow(line)) continue;

    const wavenumber = Number.parseFloat(parts[0]);
    const intensity = parseIntensity(parts[1] ?? '');
    if (intensity === null) continue;

    // Assignment: remaining tokens joined
    const assignmentTokens = parts.slice(2);
    const assignment =
      assignmentTokens.length > 0 ? assignmentTokens.join(' ').slice(0, 100) : undefined;

    peaks.push({ wavenumber, intensity, assignment });
  }

  const info = extractPhaseInfo(text);
  return {
    spectrumType: 'ftir',
    cardNumber: info.cardNumber,
    phaseName: info.phaseName,
    formula: info.formula,
    peaks,
    nPeaks: peaks.length,
    detectedFromHeader: headerLine
  };
}

// ─── Raman parser ─────────────────────────────────────────────────────
export function parseRamanReferenceCard(text: string): ParsedMultiReferenceCard {
  const { headerLine } = detectSpectrumType(text);
  const lines = text.split('\n');
  const peaks: RamanReferenceCardPeak[] = [];

  for (const line of lines) {
    const parts = splitColumns(line);
    if (!isPeakLineGeneric(parts, 50, 5000)) continue;
    if (looksLikeHeaderRow(line)) continue;

    const shift = Number.parseFloat(parts[0]);
    const intensity = parseIntensity(parts[1] ?? '');
    if (intensity === null) continue;

    const assignmentTokens = parts.slice(2);
    const assignment =
      assignmentTokens.length > 0 ? assignmentTokens.join(' ').slice(0, 100) : undefined;

    peaks.push({ shift, intensity, assignment });
  }

  const info = extractPhaseInfo(text);
  return {
    spectrumType: 'raman',
    cardNumber: info.cardNumber,
    phaseName: info.phaseName,
    formula: info.formula,
    peaks,
    nPeaks: peaks.length,
    detectedFromHeader: headerLine
  };
}

// ─── UV-Vis parser ────────────────────────────────────────────────────
export function parseUVVisReferenceCard(text: string): ParsedMultiReferenceCard {
  const { headerLine } = detectSpectrumType(text);
  const lines = text.split('\n');
  const peaks: UVVisReferenceCardPeak[] = [];

  for (const line of lines) {
    const parts = splitColumns(line);
    if (!isPeakLineGeneric(parts, 150, 2000)) continue;
    if (looksLikeHeaderRow(line)) continue;

    const wavelength = Number.parseFloat(parts[0]);
    const intensity = parseIntensity(parts[1] ?? '');
    if (intensity === null) continue;

    const assignmentTokens = parts.slice(2);
    const assignment =
      assignmentTokens.length > 0 ? assignmentTokens.join(' ').slice(0, 100) : undefined;

    peaks.push({ wavelength, intensity, assignment });
  }

  const info = extractPhaseInfo(text);
  return {
    spectrumType: 'uvvis',
    cardNumber: info.cardNumber,
    phaseName: info.phaseName,
    formula: info.formula,
    peaks,
    nPeaks: peaks.length,
    detectedFromHeader: headerLine
  };
}

// ─── Top-level dispatch ───────────────────────────────────────────────
export function parseAnyReferenceCard(text: string): ParsedMultiReferenceCard | null {
  const { type } = detectSpectrumType(text);
  if (type === 'ftir') return parseFTIRReferenceCard(text);
  if (type === 'raman') return parseRamanReferenceCard(text);
  if (type === 'uvvis') return parseUVVisReferenceCard(text);
  return null; // unknown — caller should fall back to XRD parser
}
