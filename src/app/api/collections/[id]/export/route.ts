/**
 * Export a collection as a .zip containing every member paper's PDF, nested under
 * a folder named after the collection ("My Collection/paper.pdf"). Extracting the
 * archive yields that folder. Auth: Bearer Firebase ID token; owner-only (personal
 * collection). Best-effort per paper — a missing/retracted/failed PDF is skipped
 * rather than failing the whole export.
 */
import { type NextRequest, NextResponse } from 'next/server';

import { getTenantIdFromToken } from '@/lib/auth/token';
import { getAdminAuthService, getAdminFirestoreService } from '@/lib/firebase/admin';
import { getSignedDownloadUrl } from '@/lib/firebase/storage';
import { checkRateLimit, rateLimitKey } from '@/lib/security/rate-limit';
import type { PaperCollection } from '@/types/collections';
import type { Paper } from '@/types/papers';
import { buildZip, type ZipEntry } from '@/lib/zip/minimal-zip';

export const maxDuration = 300;

/** Cap to keep the in-memory archive within serverless limits. */
const MAX_PAPERS = 60;

/** Make a string safe as a zip path segment. */
function safeName(s: string): string {
  const cleaned = (s || '')
    // eslint-disable-next-line no-control-regex
    .replace(/[/\\:*?"<>|\u0000-\u001f]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
  return cleaned === '' ? 'untitled' : cleaned;
}

/** ASCII fallback for the Content-Disposition filename (non-ASCII → filename*). */
function asciiName(s: string): string {
  const a = s.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return a.trim() === '' ? 'collection' : a;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new NextResponse('unauthorized', { status: 401 });
    }
    const decoded = await getAdminAuthService().verifyIdToken(authHeader.slice('Bearer '.length));
    const tenantId = getTenantIdFromToken(decoded);
    if (!tenantId) {
      return new NextResponse('no_tenant', { status: 403 });
    }
    const uid = decoded.uid;

    const rl = await checkRateLimit(rateLimitKey('collection-export', tenantId), 20, 60);
    if (!rl.allowed) {
      return new NextResponse('rate_limited', {
        status: 429,
        headers: { 'Retry-After': String(rl.resetSec) }
      });
    }

    const db = getAdminFirestoreService();
    const colSnap = await db.doc(`tenants/${tenantId}/collections/${id}`).get();
    if (!colSnap.exists) {
      return new NextResponse('not_found', { status: 404 });
    }
    const col = colSnap.data() as PaperCollection;
    // Collections are personal (createdBy == uid); only the owner may export.
    if (col.createdBy !== uid) {
      return new NextResponse('forbidden', { status: 403 });
    }

    const paperIds = (col.paperIds ?? []).slice(0, MAX_PAPERS);
    if (paperIds.length === 0) {
      return new NextResponse('empty_collection', { status: 422 });
    }

    const folder = safeName(col.name);
    const expectedPrefix = `tenants/${tenantId}/papers/`;

    // Fetch each paper's metadata + PDF bytes in parallel; skip any that fail.
    const fetched = await Promise.all(
      paperIds.map(async (pid) => {
        try {
          const pSnap = await db.doc(`tenants/${tenantId}/papers/${pid}`).get();
          if (!pSnap.exists) return null;
          const p = pSnap.data() as Paper;
          if (p.lifecycleStatus === 'retracted' || !p.storagePath) return null;
          if (!p.storagePath.startsWith(expectedPrefix)) return null;
          const url = await getSignedDownloadUrl(p.storagePath);
          const resp = await fetch(url);
          if (!resp.ok) return null;
          const data = Buffer.from(await resp.arrayBuffer());
          return { title: safeName(p.title || pid), data };
        } catch (err) {
          console.warn(
            JSON.stringify({
              event: 'collection_export_paper_failed',
              pid,
              detail: String(err).slice(0, 120)
            })
          );
          return null;
        }
      })
    );

    // De-duplicate filenames within the folder (papers can share a title).
    const used = new Set<string>();
    const entries: ZipEntry[] = [];
    for (const f of fetched) {
      if (!f) continue;
      let name = `${f.title}.pdf`;
      let n = 2;
      while (used.has(name.toLowerCase())) {
        name = `${f.title} (${n}).pdf`;
        n += 1;
      }
      used.add(name.toLowerCase());
      entries.push({ name: `${folder}/${name}`, data: f.data });
    }

    if (entries.length === 0) {
      return new NextResponse('no_downloadable_papers', { status: 422 });
    }

    const zip = buildZip(entries);
    return new NextResponse(new Uint8Array(zip), {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${asciiName(folder)}.zip"; filename*=UTF-8''${encodeURIComponent(folder)}.zip`,
        'Content-Length': String(zip.length),
        'Cache-Control': 'no-store'
      }
    });
  } catch (err) {
    console.error('collection export error', err);
    return new NextResponse('export_failed', { status: 500 });
  }
}
