/**
 * POST /api/measurements/[id]/render-figure
 *
 * Server-side proxy to the spectra-worker /render-figure endpoint, which renders
 * a publication-grade figure (matplotlib) at a target journal's exact specs.
 * The client already holds the parsed curve/peaks (it draws them with Plotly),
 * so it sends them in the body; this route adds the Cloud Run ID token the
 * worker requires and streams the file back as a download.
 *
 * @phase R204 (publication figure export — app↔worker path)
 */
import { type NextRequest, NextResponse } from 'next/server';

import { authenticate } from '@/lib/api/auth-helper';
import { checkRateLimit, rateLimitKey } from '@/lib/security/rate-limit';
import { callWorker } from '@/lib/worker/client';

export const runtime = 'nodejs';

interface RouteContext {
  params: Promise<{ id: string }>;
}

const VALID_PUBLISHERS = new Set(['nature', 'acs', 'elsevier', 'rsc']);
const VALID_COLUMNS = new Set(['single', 'double']);
const VALID_FORMATS = new Set(['png', 'pdf', 'svg', 'eps', 'tiff']);

interface RenderBody {
  spectrum_type: string;
  curve: { x: number[]; y: number[] };
  peaks?: Array<Record<string, number>>;
  publisher: string;
  column: string;
  fmt: string;
  peak_labels?: string[];
  line_color?: string;
  title?: string | null;
}

export async function POST(req: NextRequest, _ctx: RouteContext) {
  const auth = await authenticate(req);
  if (auth.error) return auth.error;

  const rl = await checkRateLimit(rateLimitKey('render-figure', auth.tenantId), 20, 60);
  if (!rl.allowed) return new NextResponse('rate_limited', { status: 429 });

  let body: RenderBody;
  try {
    body = (await req.json()) as RenderBody;
  } catch {
    return new NextResponse('invalid_json', { status: 400 });
  }

  // Validate enums before paying for a worker round-trip.
  const publisher = body.publisher?.toLowerCase();
  const column = body.column?.toLowerCase();
  const fmt = body.fmt?.toLowerCase();
  if (!VALID_PUBLISHERS.has(publisher)) {
    return new NextResponse('invalid_publisher', { status: 400 });
  }
  if (!VALID_COLUMNS.has(column)) return new NextResponse('invalid_column', { status: 400 });
  if (!VALID_FORMATS.has(fmt)) return new NextResponse('invalid_format', { status: 400 });
  if (!body.curve?.x?.length || !body.curve?.y?.length) {
    return new NextResponse('empty_curve', { status: 400 });
  }

  let workerRes: Response;
  try {
    workerRes = await callWorker('/render-figure', {
      spectrum_type: body.spectrum_type,
      curve: body.curve,
      peaks: body.peaks ?? null,
      publisher,
      column,
      fmt,
      peak_labels: body.peak_labels ?? null,
      line_color: body.line_color ?? '#1f4e9c',
      title: body.title ?? null
    });
  } catch (err) {
    return new NextResponse(`worker_unavailable: ${String(err).slice(0, 200)}`, { status: 502 });
  }

  if (!workerRes.ok) {
    const detail = await workerRes.text().catch(() => '');
    return new NextResponse(`worker_error: ${detail.slice(0, 200)}`, { status: 502 });
  }

  const data = await workerRes.arrayBuffer();
  const mime = workerRes.headers.get('content-type') ?? 'application/octet-stream';
  const filename = `figure_${body.spectrum_type}_${publisher}_${column}.${fmt}`;
  return new NextResponse(data, {
    status: 200,
    headers: {
      'Content-Type': mime,
      'Content-Disposition': `attachment; filename="${filename}"`
    }
  });
}
