/**
 * GET /api/bookings/available?equipmentId=&date=YYYY-MM-DD&durationMin=60
 * → free slots for that equipment on that local day. (authed)
 *
 * `date` is interpreted in the caller's timezone offset via `tzOffsetMin`
 * (minutes, as from Date.getTimezoneOffset()). Falls back to UTC day.
 * @phase BOOK-1
 */
import { type NextRequest, NextResponse } from 'next/server';
import { authenticate } from '@/lib/api/auth-helper';
import { findAvailableSlots } from '@/lib/firebase/bookings/service';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const auth = await authenticate(req);
  if (auth.error) return auth.error;
  const sp = req.nextUrl.searchParams;
  const equipmentId = sp.get('equipmentId');
  const date = sp.get('date'); // YYYY-MM-DD
  const durationMin = Number(sp.get('durationMin') ?? '60');
  const tzOffsetMin = Number(sp.get('tzOffsetMin') ?? '0');

  if (!equipmentId || !date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
  }

  // Build local-day window. getTimezoneOffset() is minutes BEHIND UTC
  // (e.g. UTC+7 → -420). Local midnight in UTC ms = Date.UTC(...) + offset*60000.
  const [y, m, d] = date.split('-').map(Number);
  const dayStartUtc = Date.UTC(y, m - 1, d, 0, 0, 0) + tzOffsetMin * 60000;
  const dayEndUtc = dayStartUtc + 24 * 60 * 60 * 1000;
  const minDurationMs = Math.max(durationMin, 1) * 60000;

  try {
    const slots = await findAvailableSlots(
      auth.tenantId,
      equipmentId,
      dayStartUtc,
      dayEndUtc,
      minDurationMs
    );
    return NextResponse.json({ slots });
  } catch (err) {
    console.error('GET /api/bookings/available', err);
    return new NextResponse('failed', { status: 500 });
  }
}
