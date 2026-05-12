/**
 * Firebase Storage helpers (server-side).
 * @phase R160-ai-5b-1
 */
import 'server-only';
import { getAdminStorageService } from './admin';

/** Tenant-scoped paper storage path */
export function paperStoragePath(tenantId: string, paperId: string, version: number): string {
  return `papers/${tenantId}/${paperId}.v${version}.pdf`;
}

/**
 * Upload a buffer to Firebase Storage at the given path.
 * Returns the gs:// URI.
 */
export async function uploadBuffer(
  storagePath: string,
  buffer: Buffer,
  contentType: string
): Promise<string> {
  const bucket = getAdminStorageService().bucket();
  const file = bucket.file(storagePath);
  await file.save(buffer, {
    contentType,
    resumable: false,
    metadata: {
      cacheControl: 'private, max-age=0'
    }
  });
  return `gs://${bucket.name}/${storagePath}`;
}

/**
 * Get a signed download URL valid for `expiresInMinutes` minutes.
 */
export async function getSignedDownloadUrl(
  storagePath: string,
  expiresInMinutes: number = 15
): Promise<string> {
  const bucket = getAdminStorageService().bucket();
  const file = bucket.file(storagePath);
  const [url] = await file.getSignedUrl({
    action: 'read',
    expires: Date.now() + expiresInMinutes * 60 * 1000
  });
  return url;
}

/**
 * Delete a file from Storage. Idempotent (no-op if not exists).
 */
export async function deleteStorageFile(storagePath: string): Promise<void> {
  const bucket = getAdminStorageService().bucket();
  const file = bucket.file(storagePath);
  try {
    await file.delete();
  } catch (err) {
    const code = (err as { code?: number }).code;
    if (code === 404) return; // already gone
    throw err;
  }
}
