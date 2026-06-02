/**
 * OpenAlex REST API client — fallback when Crossref 404.
 *
 * Free, no API key, 100k requests/day public pool.
 * Polite-pool eligible with mailto.
 *
 * @phase R166-ai6a-3a
 * @see https://docs.openalex.org/
 */
import 'server-only';
import type { CitationMetadata } from './crossref';

const OPENALEX_API_BASE = 'https://api.openalex.org/works';
const DEFAULT_TIMEOUT_MS = 10_000;

const POLITE_MAILTO =
  process.env.OPENALEX_POLITE_MAILTO ??
  process.env.CROSSREF_POLITE_MAILTO ??
  'labyra-platform@github.io';

export async function lookupDoiOpenalex(
  doi: string,
  signal?: AbortSignal
): Promise<CitationMetadata | null> {
  const url = `${OPENALEX_API_BASE}/doi:${encodeURIComponent(doi)}?mailto=${encodeURIComponent(POLITE_MAILTO)}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  signal?.addEventListener('abort', () => controller.abort(), { once: true });

  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: controller.signal
    });

    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`openalex_http_${res.status}`);

    const json = (await res.json()) as Record<string, unknown>;

    return {
      doi,
      title: typeof json.title === 'string' ? json.title : undefined,
      authors: extractAuthorsOA(json.authorships),
      year: typeof json.publication_year === 'number' ? json.publication_year : undefined,
      journal: extractJournalOA(json.primary_location),
      isRetracted: Boolean(json.is_retracted),
      source: 'openalex'
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

function extractAuthorsOA(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: string[] = [];
  for (const a of raw) {
    const name = (a as { author?: { display_name?: string } })?.author?.display_name;
    if (name) out.push(name);
  }
  return out.length > 0 ? out : undefined;
}

function extractJournalOA(raw: unknown): string | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const src = (raw as { source?: { display_name?: string } }).source;
  return src?.display_name?.trim();
}

/**
 * Lookup with Crossref primary, OpenAlex fallback.
 * Returns null if both fail with 404 (DOI not in either database).
 */
export async function lookupDoi(
  doi: string,
  signal?: AbortSignal
): Promise<CitationMetadata | null> {
  const { lookupDoiCrossref } = await import('./crossref');
  try {
    const result = await lookupDoiCrossref(doi, signal);
    if (result) return result;
  } catch (err) {
    // Log but try OpenAlex
    // eslint-disable-next-line no-console -- audit logging
    console.error(
      JSON.stringify({
        level: 'warn',
        event: 'crossref_lookup_failed',
        doi,
        error: err instanceof Error ? err.message : String(err)
      })
    );
  }
  // Fallback to OpenAlex
  return lookupDoiOpenalex(doi, signal);
}

/** OpenAlex allows up to 50 OR-values in a single `filter=doi:a|b|...` query. */
const OA_BATCH_SIZE = 50;

function normalizeDoiKey(raw: string): string {
  return raw.replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '').toLowerCase();
}

/**
 * Resolve many DOIs in one shot via OpenAlex's OR-filter (50 per request).
 *
 * For N DOIs this is ceil(N/50) HTTP calls instead of N sequential lookups —
 * e.g. 381 references → 8 calls (~seconds) vs ~76s at 200ms/DOI. OpenAlex-only:
 * Crossref has no comparable batch-by-DOI endpoint.
 *
 * Returns a Map keyed by lowercased bare DOI. DOIs not found in OpenAlex are
 * simply absent from the map (caller decides what to do).
 */
export async function lookupDoiBatch(
  dois: string[],
  signal?: AbortSignal
): Promise<Map<string, CitationMetadata>> {
  const out = new Map<string, CitationMetadata>();
  const unique = [...new Set(dois.map(normalizeDoiKey).filter(Boolean))];

  for (let i = 0; i < unique.length; i += OA_BATCH_SIZE) {
    if (signal?.aborted) break;
    const chunk = unique.slice(i, i + OA_BATCH_SIZE);
    const filter = `doi:${chunk.join('|')}`;
    const url = `${OPENALEX_API_BASE}?filter=${encodeURIComponent(filter)}&per-page=${OA_BATCH_SIZE}&mailto=${encodeURIComponent(POLITE_MAILTO)}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
    signal?.addEventListener('abort', () => controller.abort(), { once: true });

    try {
      const res = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: controller.signal
      });
      if (!res.ok) continue; // skip this chunk; others still resolve
      const json = (await res.json()) as { results?: Record<string, unknown>[] };
      for (const work of json.results ?? []) {
        const rawDoi = typeof work.doi === 'string' ? work.doi : '';
        const key = normalizeDoiKey(rawDoi);
        if (!key) continue;
        out.set(key, {
          doi: key,
          title:
            typeof work.title === 'string'
              ? work.title
              : typeof work.display_name === 'string'
                ? work.display_name
                : undefined,
          authors: extractAuthorsOA(work.authorships),
          year: typeof work.publication_year === 'number' ? work.publication_year : undefined,
          journal: extractJournalOA(work.primary_location),
          isRetracted: Boolean(work.is_retracted),
          source: 'openalex'
        });
      }
    } catch {
      // network/abort on one chunk shouldn't sink the whole batch
    } finally {
      clearTimeout(timeoutId);
    }
  }

  return out;
}
