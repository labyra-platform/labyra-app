/**
 * POST /api/dft/pseudo/upload — upload one .UPF into the tenant's pseudopotential
 * library. Body: { filename, contentB64 }. Requires auth + a tenant. Proxies to
 * the worker /dft/pseudo/upload (writes GCS pseudo/{filename}).
 *
 * @phase R344-pseudo-upload
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentTenantId, getCurrentUser } from '@/lib/auth/server';
import { uploadPseudo } from '@/lib/dft/worker-client';

const schema = z.object({
  filename: z.string().trim().min(1).max(200),
  contentB64: z.string().min(1)
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
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
  const result = await uploadPseudo(parsed.data.filename, parsed.data.contentB64);
  if (!result.ok) {
    const data = result.data as { detail?: string } | null;
    return NextResponse.json(
      { error: data?.detail ?? 'Worker error', status: result.status },
      { status: result.status }
    );
  }
  return NextResponse.json(result.data);
}
