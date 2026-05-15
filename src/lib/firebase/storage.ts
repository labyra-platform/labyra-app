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

/**
 * Measurement storage path helpers + signed URL generation.
 * @phase R164-phase-5b-1 (was R160-spectra-1) — renamed spectrum* → measurement*
 * @see labyra-experiment-database-report.md Section 2.1, ADR-016
 *
 * Path format: tenants/{tid}/measurements/{id}/raw|processed|thumbnail
 * Deprecated `spectrum*` aliases kept; both produce the SAME new path.
 */

/** Tenant-scoped raw measurement file path. */
export function measurementRawPath(
  tenantId: string,
  measurementId: string,
  filename: string
): string {
  const safe = filename.replace(/[^\w.-]/g, '_');
  return `tenants/${tenantId}/measurements/${measurementId}/raw/${safe}`;
}

export function measurementProcessedPath(
  tenantId: string,
  measurementId: string,
  filename: string
): string {
  const safe = filename.replace(/[^\w.-]/g, '_');
  return `tenants/${tenantId}/measurements/${measurementId}/processed/${safe}`;
}

export function measurementThumbnailPath(tenantId: string, measurementId: string): string {
  return `tenants/${tenantId}/measurements/${measurementId}/thumbnail.jpg`;
}

/** @deprecated Use measurementRawPath. R164 alias for R160-R163 callers. */
export function spectrumRawPath(tenantId: string, spectrumId: string, filename: string): string {
  return measurementRawPath(tenantId, spectrumId, filename);
}

/** @deprecated Use measurementProcessedPath. */
export function spectrumProcessedPath(
  tenantId: string,
  spectrumId: string,
  filename: string
): string {
  return measurementProcessedPath(tenantId, spectrumId, filename);
}

/** @deprecated Use measurementThumbnailPath. */
export function spectrumThumbnailPath(tenantId: string, spectrumId: string): string {
  return measurementThumbnailPath(tenantId, spectrumId);
}

/**
 * Generate a signed UPLOAD URL (V4) for client to PUT a file directly to GCS.
 * Expires in 15 minutes. Client uploads bytes, then calls /api/measurements/notify-complete.
 */
export async function getSignedUploadUrl(
  storagePath: string,
  contentType: string,
  expiresInMs = 15 * 60 * 1000
): Promise<string> {
  const bucket = getAdminStorageService().bucket();
  const file = bucket.file(storagePath);
  const [url] = await file.getSignedUrl({
    version: 'v4',
    action: 'write',
    expires: Date.now() + expiresInMs,
    contentType
  });
  return url;
}

/** Verify a file exists in Storage at the given path */
export async function fileExists(storagePath: string): Promise<boolean> {
  const bucket = getAdminStorageService().bucket();
  const file = bucket.file(storagePath);
  const [exists] = await file.exists();
  return exists;
}

/** Get file metadata (size, contentType, sha256 if present) */
export async function getFileMetadata(storagePath: string) {
  const bucket = getAdminStorageService().bucket();
  const file = bucket.file(storagePath);
  const [metadata] = await file.getMetadata();
  return metadata;
}

/** Delete a file from Storage */
export async function deleteFile(storagePath: string): Promise<void> {
  const bucket = getAdminStorageService().bucket();
  const file = bucket.file(storagePath);
  await file.delete({ ignoreNotFound: true });
}

/**
 * Move (rename) a file in Storage. Used by upload-complete flow to promote
 * a file from temp `_uploads/{sessionId}.pdf` to final `{paperId}.v1.pdf`.
 *
 * GCS does not support atomic rename — internally this is copy + delete.
 * On failure mid-flight, the destination may exist without the source being
 * deleted (rare; caller logs warning).
 *
 * @phase R168-3.2
 */
export async function movePaperFile(srcPath: string, dstPath: string): Promise<void> {
  const bucket = getAdminStorageService().bucket();
  const srcFile = bucket.file(srcPath);
  await srcFile.move(dstPath);
}
