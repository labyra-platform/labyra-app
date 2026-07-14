/**
 * /api/papers/[id]/si — Supplementary Information files (R490).
 *
 * SI PDFs/ZIPs are user-provided (publishers rarely expose them via API).
 * Signed-URL flow mirrors paper upload (client PUTs straight to GCS, so the
 * Vercel 4.5MB body cap never applies):
 *   POST   { filename, contentType, sizeBytes } → { signedUploadUrl, storagePath }
 *   PATCH  { filename } → verifies the object landed, records it on the doc
 *   GET    → { items: [{ ...meta, url }] } with 15-min signed read URLs
 *   DELETE { filename } → removes doc entry + GCS object
 *
 * Read: any member within group scope (ADR-034 TEAM-4a, 404 on foreign group).
 * Write: member+ (authenticateWriter) within the same scope.
 */
import { type NextRequest, NextResponse } from 'next/server';
import { authenticate, authenticateWriter } from '@/lib/api/auth-helper';
import { getAdminFirestoreService, getAdminStorageService } from '@/lib/firebase/admin';
import { getPaper } from '@/lib/firebase/papers/service';
import {
  deleteStorageFile,
  fileExists,
  getSignedDownloadUrl,
  getSignedUploadUrl
} from '@/lib/firebase/storage';
import { checkRateLimit, rateLimitKey } from '@/lib/security/rate-limit';
import type { Paper, SiFile } from '@/types/papers';

export const runtime = 'nodejs';

const MAX_SI_SIZE = 100 * 1024 * 1024; // 100 MB
const ALLOWED_TYPES = new Set([
  'application/pdf',
  'application/zip',
  'application/x-zip-compressed'
]);

interface RouteContext {
  params: Promise<{ id: string }>;
}

function sanitizeName(name: string): string {
  return name.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 120);
}

function siPath(tenantId: string, paperId: string, filename: string): string {
  return `tenants/${tenantId}/papers/${paperId}/si/${filename}`;
}

/** Shared load + ADR-034 TEAM-4a group guard (404 on foreign group). */
async function loadGuarded(
  auth: { tenantId: string; role: string | null; groupId: string | null },
  paperId: string
): Promise<Paper | NextResponse> {
  const paper = await getPaper(auth.tenantId, paperId);
  if (!paper) return new NextResponse('not_found', { status: 404 });
  const isPrivileged = auth.role === 'admin' || auth.role === 'superadmin';
  if (!isPrivileged && paper.groupId !== 'lab-shared' && paper.groupId !== auth.groupId) {
    return new NextResponse('not_found', { status: 404 });
  }
  return paper;
}

function paperRef(tenantId: string, paperId: string) {
  return getAdminFirestoreService()
    .collection('tenants')
    .doc(tenantId)
    .collection('papers')
    .doc(paperId);
}

export async function GET(req: NextRequest, ctx: RouteContext) {
  const auth = await authenticate(req);
  if (auth.error) return auth.error;
  const rl = await checkRateLimit(rateLimitKey('papers-read', auth.tenantId), 100, 60);
  if (!rl.allowed) return new NextResponse('rate_limited', { status: 429 });

  const { id } = await ctx.params;
  const paper = await loadGuarded(auth, id);
  if (paper instanceof NextResponse) return paper;

  try {
    const items = await Promise.all(
      (paper.siFiles ?? []).map(async (f) => ({
        ...f,
        url: await getSignedDownloadUrl(f.storagePath, 15)
      }))
    );
    return NextResponse.json({ items });
  } catch (err) {
    console.error('GET /api/papers/[id]/si', err);
    return new NextResponse('list_failed', { status: 500 });
  }
}

export async function POST(req: NextRequest, ctx: RouteContext) {
  const auth = await authenticateWriter(req);
  if (auth.error) return auth.error;
  const rl = await checkRateLimit(rateLimitKey('papers-write', auth.tenantId), 30, 60);
  if (!rl.allowed) return new NextResponse('rate_limited', { status: 429 });

  const { id } = await ctx.params;
  const paper = await loadGuarded(auth, id);
  if (paper instanceof NextResponse) return paper;

  let body: { filename?: string; contentType?: string; sizeBytes?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
  }
  const filename = sanitizeName(body.filename ?? '');
  if (!filename) return NextResponse.json({ error: 'invalid_filename' }, { status: 400 });
  if (!body.contentType || !ALLOWED_TYPES.has(body.contentType)) {
    return NextResponse.json({ error: 'invalid_type' }, { status: 400 });
  }
  if (!body.sizeBytes || body.sizeBytes <= 0 || body.sizeBytes > MAX_SI_SIZE) {
    return NextResponse.json({ error: 'invalid_size' }, { status: 400 });
  }

  try {
    const storagePath = siPath(auth.tenantId, id, filename);
    const signedUploadUrl = await getSignedUploadUrl(storagePath, body.contentType);
    return NextResponse.json({ signedUploadUrl, storagePath, filename });
  } catch (err) {
    console.error('POST /api/papers/[id]/si', err);
    return new NextResponse('sign_failed', { status: 500 });
  }
}

export async function PATCH(req: NextRequest, ctx: RouteContext) {
  const auth = await authenticateWriter(req);
  if (auth.error) return auth.error;
  const rl = await checkRateLimit(rateLimitKey('papers-write', auth.tenantId), 30, 60);
  if (!rl.allowed) return new NextResponse('rate_limited', { status: 429 });

  const { id } = await ctx.params;
  const paper = await loadGuarded(auth, id);
  if (paper instanceof NextResponse) return paper;

  let body: { filename?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
  }
  const filename = sanitizeName(body.filename ?? '');
  if (!filename) return NextResponse.json({ error: 'invalid_filename' }, { status: 400 });

  try {
    const storagePath = siPath(auth.tenantId, id, filename);
    if (!(await fileExists(storagePath))) {
      return NextResponse.json({ error: 'upload_missing' }, { status: 400 });
    }
    const [meta] = await getAdminStorageService().bucket().file(storagePath).getMetadata();
    const entry: SiFile = {
      name: filename,
      storagePath,
      sizeBytes: Number(meta.size ?? 0),
      uploadedAt: Date.now(),
      uploadedBy: auth.uid
    };
    const existing = (paper.siFiles ?? []).filter((f) => f.name !== filename);
    const siFiles = [...existing, entry];
    await paperRef(auth.tenantId, id).update({
      siFiles,
      updatedAt: Date.now(),
      updatedBy: auth.uid
    });
    return NextResponse.json({ ok: true, siFiles });
  } catch (err) {
    console.error('PATCH /api/papers/[id]/si', err);
    return new NextResponse('attach_failed', { status: 500 });
  }
}

export async function DELETE(req: NextRequest, ctx: RouteContext) {
  const auth = await authenticateWriter(req);
  if (auth.error) return auth.error;
  const rl = await checkRateLimit(rateLimitKey('papers-write', auth.tenantId), 30, 60);
  if (!rl.allowed) return new NextResponse('rate_limited', { status: 429 });

  const { id } = await ctx.params;
  const paper = await loadGuarded(auth, id);
  if (paper instanceof NextResponse) return paper;

  const filename = sanitizeName(req.nextUrl.searchParams.get('filename') ?? '');
  if (!filename) return NextResponse.json({ error: 'invalid_filename' }, { status: 400 });

  try {
    const siFiles = (paper.siFiles ?? []).filter((f) => f.name !== filename);
    await paperRef(auth.tenantId, id).update({
      siFiles,
      updatedAt: Date.now(),
      updatedBy: auth.uid
    });
    await deleteStorageFile(siPath(auth.tenantId, id, filename)); // idempotent
    return NextResponse.json({ ok: true, siFiles });
  } catch (err) {
    console.error('DELETE /api/papers/[id]/si', err);
    return new NextResponse('delete_failed', { status: 500 });
  }
}
