/**
 * Crossref REST API client for paper metadata lookup.
 *
 * Free, no API key needed for Stage 1 (rate ~50 req/s public pool).
 * Polite User-Agent (with mailto) gets higher rate share.
 *
 * @phase R166-ai6a-3a
 * @see https://api.crossref.org/swagger-ui/index.html
 */
import 'server-only';
import { cleanText, cleanTextList } from '@/lib/utils/normalize-text';

const CROSSREF_API_BASE = 'https://api.crossref.org/works';
const DEFAULT_TIMEOUT_MS = 10_000;

// Polite header — mailto helps Crossref classify as good citizen.
// Configure via env to avoid hard-coding org email.
const POLITE_MAILTO = process.env.CROSSREF_POLITE_MAILTO ?? 'labyra-platform@github.io';
const USER_AGENT = `Labyra/1.0 (mailto:${POLITE_MAILTO})`;

export interface CitationMetadata {
  doi: string;
  title?: string;
  authors?: string[];
  year?: number;
  journal?: string;
  isRetracted?: boolean;
  source: 'crossref' | 'openalex';
}

/**
 * Lookup paper metadata by DOI.
 * Returns null on 404 (DOI not in Crossref).
 * Throws on network errors / 5xx.
 */
export async function lookupDoiCrossref(
  doi: string,
  signal?: AbortSignal
): Promise<CitationMetadata | null> {
  const url = `${CROSSREF_API_BASE}/${encodeURIComponent(doi)}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  // Chain user signal to internal controller
  signal?.addEventListener('abort', () => controller.abort(), { once: true });

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/json'
      },
      signal: controller.signal
    });

    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`crossref_http_${res.status}`);

    const json = (await res.json()) as { message?: Record<string, unknown> };
    const msg = json.message;
    if (!msg) return null;

    return {
      doi,
      title: extractTitle(msg.title),
      authors: extractAuthors(msg.author),
      year: extractYear(msg),
      journal: extractJournal(msg),
      isRetracted: Boolean(
        msg.subtype === 'retraction' ||
        msg.type === 'retraction' ||
        ((msg['update-to'] as Array<{ type?: string }> | undefined) ?? []).some(
          (u) => u.type === 'retraction'
        )
      ),
      source: 'crossref'
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

function extractTitle(raw: unknown): string | undefined {
  if (Array.isArray(raw) && raw.length > 0 && typeof raw[0] === 'string') {
    return cleanText(raw[0]);
  }
  if (typeof raw === 'string') return cleanText(raw);
  return undefined;
}

function extractAuthors(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: string[] = [];
  for (const a of raw) {
    if (a && typeof a === 'object') {
      const family = (a as { family?: string }).family;
      const given = (a as { given?: string }).given;
      if (family) {
        out.push(given ? `${family}, ${given}` : family);
      }
    }
  }
  return cleanTextList(out);
}

function extractYear(msg: Record<string, unknown>): number | undefined {
  // Try published-print, then published-online, then created
  const sources = ['published-print', 'published-online', 'created'];
  for (const key of sources) {
    const block = msg[key] as { 'date-parts'?: number[][] } | undefined;
    const parts = block?.['date-parts']?.[0];
    if (parts?.[0]) return parts[0];
  }
  return undefined;
}

function extractJournal(msg: Record<string, unknown>): string | undefined {
  const cont = msg['container-title'];
  if (Array.isArray(cont) && cont.length > 0 && typeof cont[0] === 'string') {
    return cleanText(cont[0]);
  }
  return undefined;
}
