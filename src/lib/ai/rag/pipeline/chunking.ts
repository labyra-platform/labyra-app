/**
 * Sliding window chunker for paper text.
 * @phase R160-ai-5b-2
 *
 * Strategy: ~1024 tokens per chunk with 100 token overlap.
 * Approximate tokens by chars (English ~4 chars/token, Vietnamese ~3 chars/token).
 * Conservative: assume 3.5 chars/token.
 */
import type { OcrResult, OcrPage } from '@/lib/ai/rag/ocr';

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

  // Sliding window
  const chunks: Chunk[] = [];
  let start = 0;
  let chunkIdx = 0;

  while (start < chars.length) {
    const end = Math.min(start + TARGET_CHARS, chars.length);
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
    const pages = Array.from(pagesSet).sort((a, b) => a - b);
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
    start = end - OVERLAP_CHARS;
  }

  return chunks;
}
