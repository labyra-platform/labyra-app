/**
 * POST /api/papers/resolve-doi — look up bibliographic metadata for a DOI so the
 * metadata-confirm UI can pre-fill title / authors / year / journal from the
 * authoritative source (Crossref → OpenAlex fallback). Server-side so we keep
 * the polite mailto + avoid browser CORS. Read-only; never writes the paper.
 *
 * @phase R237bl (upload metadata-confirm)
 */
import { type NextRequest, NextResponse } from 'next/server';
import { authenticate } from '@/lib/api/auth-helper';
import { lookupDoi } from '@/lib/ai/citations/openalex';
import { checkRateLimit, rateLimitKey } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';

const DOI_RE = /^10\.\d{4,9}\/[-._;()/:A-Z0-9]+$/i;

export async function POST(req: NextRequest) {
  const auth = await authenticate(req);
  if (auth.error) return auth.error;

  const rl = await checkRateLimit(rateLimitKey('papers-resolve-doi', auth.tenantId), 30, 60);
  if (!rl.allowed) return new NextResponse('rate_limited', { status: 429 });

  let body: { doi?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const doi =
    typeof body.doi === 'string' ? body.doi.trim().replace(/^https?:\/\/doi\.org\//i, '') : '';
  if (!DOI_RE.test(doi)) {
    return NextResponse.json({ error: 'invalid_doi' }, { status: 400 });
  }

  try {
    const meta = await lookupDoi(doi);
    if (!meta) return NextResponse.json({ found: false });
    return NextResponse.json({
      found: true,
      doi: meta.doi ?? doi,
      title: meta.title ?? '',
      authors: meta.authors ?? [],
      year: meta.year ?? 0,
      journal: meta.journal ?? '',
      isRetracted: meta.isRetracted ?? false,
      source: meta.source ?? ''
    });
  } catch (err) {
    console.error('POST /api/papers/resolve-doi', err);
    return NextResponse.json({ error: 'resolve_failed' }, { status: 502 });
  }
}
