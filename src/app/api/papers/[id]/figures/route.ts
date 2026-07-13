import { getTenantIdFromToken } from '@/lib/auth/token';
import { getAdminAuthService, getAdminFirestoreService } from '@/lib/firebase/admin';
import { getSignedDownloadUrl } from '@/lib/firebase/storage';
import type { Paper } from '@/types/papers';

export const dynamic = 'force-dynamic';

/**
 * GET /api/papers/[id]/figures
 * Returns the document's extracted figures with short-lived signed URLs.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: paperId } = await params;

  const authHeader = request.headers.get('authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  let decoded;
  try {
    decoded = await getAdminAuthService().verifyIdToken(authHeader.slice('Bearer '.length));
  } catch {
    return Response.json({ error: 'invalid_token' }, { status: 401 });
  }
  const tenantId = getTenantIdFromToken(decoded);
  if (!tenantId) return Response.json({ error: 'missing_tenant_claim' }, { status: 403 });

  const snap = await getAdminFirestoreService().doc(`tenants/${tenantId}/papers/${paperId}`).get();
  if (!snap.exists) return Response.json({ error: 'not_found' }, { status: 404 });

  const paper = snap.data() as Paper;
  let figures: { name: string; page: number; mimeType: string; storagePath: string }[] = (
    paper.figures ?? []
  ).map((f) => ({
    name: f.name,
    page: f.page,
    mimeType: f.mimeType,
    storagePath: f.storagePath
  }));

  // Fallback: the images live in storage even if the doc's figures[] metadata is
  // missing (e.g. it was never written or got lost). List the folder directly so
  // the figures still show — pages are unknown here, so default to 0.
  if (figures.length === 0) {
    try {
      const { getAdminStorageService } = await import('@/lib/firebase/admin');
      const prefix = `tenants/${tenantId}/papers/${paperId}/figures/`;
      const [files] = await getAdminStorageService().bucket().getFiles({ prefix });
      figures = files
        .filter((file) => !file.name.endsWith('/'))
        .map((file) => ({
          name: file.name.slice(prefix.length),
          page: 0,
          mimeType: /\.png$/i.test(file.name) ? 'image/png' : 'image/jpeg',
          storagePath: file.name
        }));
    } catch {
      // No fallback available — return whatever we have.
    }
  }

  const signed = await Promise.all(
    figures.map(async (f) => {
      try {
        const url = await getSignedDownloadUrl(f.storagePath, 60);
        return { name: f.name, page: f.page, mimeType: f.mimeType, url };
      } catch {
        return null;
      }
    })
  );

  const items = signed.filter((x): x is NonNullable<typeof x> => x !== null);
  return Response.json({ figures: items });
}
