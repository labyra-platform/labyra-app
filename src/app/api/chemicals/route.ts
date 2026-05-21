/**
 * GET  /api/chemicals — list (any authed tenant member).
 * POST /api/chemicals — create (writer+).
 * @phase CHEM-1
 */
import { type NextRequest, NextResponse } from 'next/server';
import { authenticate, authenticateWriter } from '@/lib/api/auth-helper';
import { createChemical, listChemicals } from '@/lib/firebase/chemicals/service';
import { chemicalFormSchema } from '@/features/chemicals/schema';
import { checkRateLimit, rateLimitKey } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const auth = await authenticate(req);
  if (auth.error) return auth.error;
  const rl = await checkRateLimit(rateLimitKey('chemicals-read', auth.tenantId), 100, 60);
  if (!rl.allowed) {
    return new NextResponse('rate_limited', {
      status: 429,
      headers: { 'Retry-After': String(rl.resetSec) }
    });
  }
  try {
    const items = await listChemicals(auth.tenantId);
    return NextResponse.json({ items });
  } catch (err) {
    console.error('GET /api/chemicals', err);
    return new NextResponse('list_failed', { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await authenticateWriter(req);
  if (auth.error) return auth.error;
  const rl = await checkRateLimit(
    rateLimitKey('chemicals-write', `${auth.tenantId}:${auth.uid}`),
    30,
    60
  );
  if (!rl.allowed) {
    return new NextResponse('rate_limited', {
      status: 429,
      headers: { 'Retry-After': String(rl.resetSec) }
    });
  }
  let parsed;
  try {
    parsed = chemicalFormSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
  }
  try {
    const item = await createChemical(
      auth.tenantId,
      { ...parsed, casNumber: parsed.casNumber || undefined },
      auth.uid
    );
    return NextResponse.json(item, { status: 201 });
  } catch (err) {
    console.error('POST /api/chemicals', err);
    return new NextResponse('create_failed', { status: 500 });
  }
}
