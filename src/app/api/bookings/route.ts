/**
 * POST /api/bookings — create (writer+), overlap-checked.
 * GET  /api/bookings — list (authed). Optional ?equipmentId=&from=&to=
 * @phase BOOK-1
 */
import { type NextRequest, NextResponse } from 'next/server';
import { authenticate, authenticateWriter } from '@/lib/api/auth-helper';
import { featureBlockedResponse } from '@/lib/api/feature-access';
import { bookingFormSchema } from '@/features/bookings/schema';
import { BookingConflictError, createBooking, listBookings } from '@/lib/firebase/bookings/service';
import { checkRateLimit, rateLimitKey } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const auth = await authenticate(req);
  if (auth.error) return auth.error;
  const gated = await featureBlockedResponse(auth, 'bookings');
  if (gated) return gated;
  const sp = req.nextUrl.searchParams;
  const equipmentId = sp.get('equipmentId') ?? undefined;
  const from = sp.get('from') ? Number(sp.get('from')) : undefined;
  const to = sp.get('to') ? Number(sp.get('to')) : undefined;
  try {
    const items = await listBookings(auth.tenantId, { equipmentId, from, to });
    return NextResponse.json({ items });
  } catch (err) {
    console.error('GET /api/bookings', err);
    return new NextResponse('list_failed', { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await authenticateWriter(req);
  if (auth.error) return auth.error;
  const gated = await featureBlockedResponse(auth, 'bookings');
  if (gated) return gated;
  const rl = await checkRateLimit(
    rateLimitKey('bookings-write', `${auth.tenantId}:${auth.uid}`),
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
    parsed = bookingFormSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
  }
  try {
    const booking = await createBooking(
      auth.tenantId,
      {
        equipmentId: parsed.equipmentId,
        equipmentName: parsed.equipmentName,
        startAt: parsed.startAt,
        endAt: parsed.endAt,
        purpose: parsed.purpose,
        notes: parsed.notes
      },
      auth.uid,
      auth.groupId
    );
    return NextResponse.json(booking, { status: 201 });
  } catch (err) {
    if (err instanceof BookingConflictError) {
      return NextResponse.json(
        { error: 'booking_conflict', conflicts: err.conflicts },
        { status: 409 }
      );
    }
    const msg = err instanceof Error ? err.message : 'create_failed';
    const status =
      msg === 'invalid_interval'
        ? 400
        : msg === 'equipment_unavailable' ||
            msg === 'too_short' ||
            msg === 'too_long' ||
            msg === 'too_far_ahead'
          ? 422
          : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
