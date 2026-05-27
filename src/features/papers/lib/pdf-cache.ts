/**
 * R232: module-level PDF binary cache.
 *
 * Why this exists — the reader now mounts only the ACTIVE tab's PdfViewer
 * (R232), so switching tabs unmounts react-pdf and frees its DOM (~1.4k nodes
 * per open PDF previously → 8.4k DOM nodes with 6 tabs, the root cause of the
 * 16 MB / 2.7-min page). The cost of unmounting is that re-opening a tab would
 * normally re-fetch the whole PDF from GCS (the slow leg on a VN→GCS link).
 *
 * This cache keeps the already-downloaded PDF bytes alive OUTSIDE React, keyed
 * by paperId. Re-opening a visited tab reads the ArrayBuffer straight from here
 * and hands it to react-pdf as `file={{ data }}` — no network, just a ~100 ms
 * parse. Memory stays bounded by an LRU cap; evicted entries are dropped so the
 * browser can GC the buffers.
 *
 * Binary (not PDFDocumentProxy) because react-pdf v10's `file` prop accepts
 * `{ data: ArrayBuffer }` but not a pre-parsed proxy.
 */

interface CacheEntry {
  buffer: ArrayBuffer;
  bytes: number;
}

const CACHE = new Map<string, CacheEntry>();

/** Max cached PDFs. Matches the tab cap so every open tab can stay warm. */
const MAX_ENTRIES = 6;
/** Hard ceiling on total cached bytes (~90 MB) regardless of count. */
const MAX_TOTAL_BYTES = 90 * 1024 * 1024;

function totalBytes(): number {
  let n = 0;
  for (const e of CACHE.values()) n += e.bytes;
  return n;
}

/** Evict least-recently-used (Map preserves insertion order) until within caps. */
function evict(): void {
  while (CACHE.size > MAX_ENTRIES || totalBytes() > MAX_TOTAL_BYTES) {
    const oldest = CACHE.keys().next().value;
    if (oldest === undefined) break;
    CACHE.delete(oldest);
  }
}

export function getCachedPdf(paperId: string): ArrayBuffer | null {
  const entry = CACHE.get(paperId);
  if (!entry) return null;
  // Bump recency: re-insert so it moves to the most-recent end.
  CACHE.delete(paperId);
  CACHE.set(paperId, entry);
  return entry.buffer;
}

export function setCachedPdf(paperId: string, buffer: ArrayBuffer): void {
  CACHE.delete(paperId);
  CACHE.set(paperId, { buffer, bytes: buffer.byteLength });
  evict();
}

export function hasCachedPdf(paperId: string): boolean {
  return CACHE.has(paperId);
}
