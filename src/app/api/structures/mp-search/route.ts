/**
 * POST /api/structures/mp-search — search Materials Project (mp-id / chemical
 * system / elements / formula) via the worker /materials/search gateway, for the
 * structure-import picker. Auth + tenant required; read-only (no Firestore write).
 *
 * @phase R323-mp-search
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentTenantId, getCurrentUser } from '@/lib/auth/server';
import { searchMaterials } from '@/lib/dft/worker-client';

const schema = z.object({
  query: z.string().trim().min(1).max(80),
  limit: z.number().int().min(1).max(100).optional()
});

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const tenantId = await getCurrentTenantId();
  if (!tenantId) return NextResponse.json({ error: 'No tenant' }, { status: 403 });

  const json: unknown = await request.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });

  try {
    const result = await searchMaterials(parsed.data.query, parsed.data.limit ?? 30);
    if (!result.ok) {
      const data = result.data as { error?: string } | null;
      return NextResponse.json(
        { error: data?.error ?? 'Search failed', status: result.status },
        { status: 502 }
      );
    }
    return NextResponse.json(result.data);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Search failed' },
      { status: 500 }
    );
  }
}
