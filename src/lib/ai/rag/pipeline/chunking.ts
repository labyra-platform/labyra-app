/**
 * Sliding window chunker for paper text.
 * @phase R160-ai-5b-2
 *
 * Strategy: ~1024 tokens per chunk with 100 token overlap.
 * Approximate tokens by chars (English ~4 chars/token, Vietnamese ~3 chars/token).
 * Conservative: assume 3.5 chars/token.
 */
import type { OcrPage, OcrResult } from '@/lib/ai/rag/ocr';

const TARGET_TOKENS = 1024;
const OVERLAP_TOKENS = 100;
const CHARS_PER_TOKEN = 3.5;
const TARGET_CHARS = Math.floor(TARGET_TOKENS * CHARS_PER_TOKEN);
const OVERLAP_CHARS = Math.floor(OVERLAP_TOKENS * CHARS_PER_TOKEN);

export interface Chunk {
  chunkIdx: number;
  text: string;
  pages: number[];
  section: string;
  tokens: number;
}

/** Detect section heading from a line (Markdown # or ALL CAPS short line) */
function detectSection(line: string): string | null {
  const trimmed = line.trim();
  if (trimmed.startsWith('#')) {
    return trimmed.replace(/^#+\s*/, '').slice(0, 80);
  }
  // ALL CAPS, short, not punctuation-only
  if (
    trimmed.length > 3 &&
    trimmed.length < 80 &&
    trimmed === trimmed.toUpperCase() &&
    /[A-Z]/.test(trimmed)
  ) {
    return trimmed;
  }
  return null;
}

/** Split text into paragraphs (double newline) */
function splitParagraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

/** Approximate token count by char count */
function approxTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

interface PageBuffer {
  text: string;
  pageNumber: number;
}

/**
 * Chunk paper pages into ~1024 token windows with 100 token overlap.
 * Respects paragraph + section boundaries when possible.
 */
export function chunkPaper(ocrResult: OcrResult): Chunk[] {
  // Flatten pages while tracking which chars belong to which page
  const pageBuffers: PageBuffer[] = ocrResult.pages.map((p: OcrPage) => ({
    text: p.text,
    pageNumber: p.pageNumber
  }));

  // Build flat character stream with page markers
  const chars: { ch: string; page: number; section: string }[] = [];
  let currentSection = '';

  for (const pb of pageBuffers) {
    const paragraphs = splitParagraphs(pb.text);
    for (const para of paragraphs) {
      // Check first line for section heading
      const firstLine = para.split('\n')[0];
      const newSection = detectSection(firstLine);
      if (newSection) {
        currentSection = newSection;
      }
      for (const ch of para) {
        chars.push({ ch, page: pb.pageNumber, section: currentSection });
      }
      // Paragraph separator
      chars.push({ ch: '\n', page: pb.pageNumber, section: currentSection });
      chars.push({ ch: '\n', page: pb.pageNumber, section: currentSection });
    }
  }

  /**
   * R547: nudge an index to the nearest word boundary.
   *
   * The window is measured in characters, so both edges land wherever the count
   * runs out — usually inside a word. That is how a chunk comes to begin "l
   * bandgap energy…" when the paper says "optical bandgap energy", and how the
   * hover card ends up showing a citation that starts with a letter. The `cal`
   * is not trimmed at the reader; it is *not in the chunk*, and no amount of
   * cleverness downstream can put it back.
   *
   * Search is bounded: past ~40 characters we are no longer near a boundary and
   * a run that long without whitespace is a formula or a URL, where the exact
   * cut matters less than not walking half a chunk looking for a space.
   */
  const SNAP_LIMIT = 40;
  const isWordChar = (i: number) => i >= 0 && i < chars.length && /[\p{L}\p{N}]/u.test(chars[i].ch);
  /** Move forward to the start of the next whole word. */
  const snapForward = (i: number) => {
    if (!isWordChar(i) || !isWordChar(i - 1)) return i;
    let j = i;
    while (j < chars.length && j - i < SNAP_LIMIT && isWordChar(j)) j += 1;
    while (j < chars.length && j - i < SNAP_LIMIT && !isWordChar(j)) j += 1;
    return j - i >= SNAP_LIMIT ? i : j;
  };
  /** Move back to the end of the last whole word. */
  const snapBack = (i: number) => {
    if (!isWordChar(i - 1) || !isWordChar(i)) return i;
    let j = i;
    while (j > 0 && i - j < SNAP_LIMIT && isWordChar(j - 1)) j -= 1;
    return i - j >= SNAP_LIMIT ? i : j;
  };

  // Sliding window
  const chunks: Chunk[] = [];
  let start = 0;
  let chunkIdx = 0;

  while (start < chars.length) {
    const rawEnd = Math.min(start + TARGET_CHARS, chars.length);
    const end = rawEnd >= chars.length ? rawEnd : snapBack(rawEnd);
    const slice = chars.slice(start, end);
    const text = slice
      .map((c) => c.ch)
      .join('')
      .trim();
    if (text.length === 0) {
      start = end;
      continue;
    }
    const pagesSet = new Set<number>();
    const sectionsSet = new Set<string>();
    for (const c of slice) {
      pagesSet.add(c.page);
      if (c.section) sectionsSet.add(c.section);
    }
    const pages = Array.from(pagesSet).toSorted((a, b) => a - b);
    const section = Array.from(sectionsSet)[0] ?? '';
    chunks.push({
      chunkIdx,
      text,
      pages,
      section,
      tokens: approxTokens(text)
    });
    chunkIdx++;

    if (end >= chars.length) break;
    // Snap the next start too, or the overlap re-introduces the split it just
    // avoided — the overlap is also plain arithmetic on a character count.
    const nextStart = snapForward(Math.max(0, end - OVERLAP_CHARS));
    // Never stand still: if snapping cannot advance past this window's start,
    // take the unsnapped index rather than loop forever on a 40-char formula.
    start = nextStart > start ? nextStart : end;
  }

  return chunks;
}
