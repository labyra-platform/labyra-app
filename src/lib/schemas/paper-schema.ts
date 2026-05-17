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
  abstract: z.string().max(10000).optional(),
  // R177-1e: book/document-type fields. Lenient ISBN format (worker
  // does strict checksum); empty string allowed for non-book papers.
  documentType: DocumentTypeSchema.optional(),
  isbn: z
    .string()
    .max(20)
    .regex(/^$|^[\d\-\sX]{10,17}$/i, 'isbn: 10 or 13 digits, hyphens allowed')
    .optional(),
  publisher: z.string().max(200).optional()
};

export const UpdatePaperMetadataSchema = ProvBasePatchSchema.extend(PaperPatchFields);

export type UpdatePaperMetadataInput = z.infer<typeof UpdatePaperMetadataSchema>;
