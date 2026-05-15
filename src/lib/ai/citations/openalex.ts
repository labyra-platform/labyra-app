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
