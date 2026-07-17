/**
 * Zod schemas for Paper entity.
 *
 * @phase R164-phase-2-schemas
 * @see src/types/papers.ts
 */
import { z } from 'zod';
import { ProvBasePatchSchema } from './prov-base-schema';

export const PaperStatusSchema = z.enum([
  'queued',
  'ocr',
  'chunking',
  'enriching',
  'embedding',
  'indexing',
  'indexed',
  'failed',
  'cancelling',
  'cancelled'
]);

// Paper Create is currently handled by /api/papers/upload (multipart, not REST POST).
// Update schema is simpler — for editing metadata after RAG indexing completes.
// R177-1e: DocumentType enum mirrors src/types/papers.ts
export const DocumentTypeSchema = z.enum(['article', 'book', 'thesis', 'unknown']);

const PaperPatchFields = {
  title: z.string().min(1).max(500).optional(),
  authors: z.array(z.string().max(200)).max(50).optional(),
  year: z.number().int().min(1800).max(2100).optional(),
  doi: z
    .string()
    .max(100)
    .regex(/^10\.\d{4,9}\/[-._;()/:A-Z0-9]+$/i, 'doi: invalid format')
    .optional(),
  // R310b: manual DOI verification flag. The metadata editor sets this true after
  // a successful "Resolve from DOI", clearing the amber unverified-DOI triangle
  // without a full worker reprocess. The editor only ever sends `true`.
  doiVerified: z.boolean().optional(),
  // R568: clears the worker's "this DOI belongs to another paper" flag. Zod
  // strips unknown keys, so without a line here the editor's `false` would be
  // dropped in silence and the warning would never go away — the field would be
  // dead on the write side exactly as it was on the read side.
  doiTitleMismatch: z.boolean().optional(),
  // R282: DOI provenance. The editor sets 'manual' when the user corrects the
  // DOI so the worker preserves it across reprocess instead of re-extracting.
  doiSource: z.literal('manual').optional(),
  abstract: z.string().max(10000).optional(),
  // R177-1e: book/document-type fields. Lenient ISBN format (worker
  // does strict checksum); empty string allowed for non-book papers.
  documentType: DocumentTypeSchema.optional(),
  isbn: z
    .string()
    .max(20)
    .regex(/^$|^[\d\-\sX]{10,17}$/i, 'isbn: 10 or 13 digits, hyphens allowed')
    .optional(),
  publisher: z.string().max(200).optional(),
  // SI link (R237bv): user-provided URL to the paper's Supplementary
  // Information. http(s) only; empty string clears it.
  siUrl: z
    .string()
    .max(1000)
    .regex(/^$|^https?:\/\/.+/i, 'siUrl: must be an http(s) URL')
    .optional()
};

export const UpdatePaperMetadataSchema = ProvBasePatchSchema.extend(PaperPatchFields);

export type UpdatePaperMetadataInput = z.infer<typeof UpdatePaperMetadataSchema>;
