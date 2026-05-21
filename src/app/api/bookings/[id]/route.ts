/**
 * GET    /api/bookings/[id] — detail (authed).
 * PATCH  /api/bookings/[id] — update time/purpose (owner or admin), overlap-checked.
 * DELETE /api/bookings/[id] — cancel (owner or admin).
 * @phase BOOK-1
 */
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authenticate, authenticateWriter } from '@/lib/api/auth-helper';
import {
  BookingConflictError,
  cancelBooking,
  getBooking,
  updateBooking
} from '@/lib/firebase/bookings/service';

export const runtime = 'nodejs';

const PatchSchema = z.object({
  startAt: z.number().int().optional(),
  endAt: z.number().int().optional(),
  purpose: z.string().min(1).max(500).optional(),
  notes: z.string().max(2000).optional(),
  status: z.enum(['pending', 'approved', 'in_progress', 'completed', 'cancelled']).optional()
});

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await authenticate(req);
  if (auth.error) return auth.error;
  const { id } = await ctx.params;
  const b = await getBooking(auth.tenantId, id);
  if (!b) return new NextResponse('not_found', { status: 404 });
  return NextResponse.json(b);
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await authenticateWriter(req);
  if (auth.error) return auth.error;
  const { id } = await ctx.params;
  let patch;
  try {
    patch = PatchSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
  }
  try {
    const isAdmin = auth.role === 'admin' || auth.role === 'superadmin';
    await updateBooking(auth.tenantId, id, patch, auth.uid, isAdmin);
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    if (err instanceof BookingConflictError) {
      return NextResponse.json(
        { error: 'booking_conflict', conflicts: err.conflicts },
        { status: 409 }
      );
    }
    const msg = err instanceof Error ? err.message : 'update_failed';
    const status =
      msg === 'forbidden'
        ? 403
        : msg === 'booking_not_found'
          ? 404
          : msg === 'invalid_interval'
            ? 400
            : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await authenticateWriter(req);
  if (auth.error) return auth.error;
  const { id } = await ctx.params;
  try {
    const isAdmin = auth.role === 'admin' || auth.role === 'superadmin';
    await cancelBooking(auth.tenantId, id, auth.uid, isAdmin);
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'cancel_failed';
    const status = msg === 'forbidden' ? 403 : msg === 'booking_not_found' ? 404 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
