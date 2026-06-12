/**
 * POST /api/dft/preview — render one unit's QE .in (no save / no run).
 *
 * Requires auth + a tenant. Proxies to the worker /dft/preview so the node panel
 * can show the exact input before launch (a 1-char QE error fails the whole job).
 *
 * @phase R253-dft-preview
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentTenantId, getCurrentUser } from '@/lib/auth/server';
import { previewDftInput } from '@/lib/dft/worker-client';

const previewSchema = z.object({
  calcType: z.string().min(1),
  structure: z.unknown(),
  global: z.unknown(),
  params: z.unknown()
});

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const tenantId = await getCurrentTenantId();
  if (!tenantId) {
    return NextResponse.json({ error: 'No tenant' }, { status: 403 });
  }
  const json: unknown = await request.json().catch(() => null);
  const parsed = previewSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
  try {
    const result = await previewDftInput(parsed.data);
    if (!result.ok) {
      const data = result.data as { detail?: string } | null;
      return NextResponse.json(
        { error: data?.detail ?? 'Worker error', status: result.status },
        { status: 502 }
      );
    }
    const data = result.data as { input?: string };
    return NextResponse.json({ input: data.input ?? '' });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Preview failed' },
      { status: 500 }
    );
  }
}
