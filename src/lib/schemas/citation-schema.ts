/**
 * Zod schemas for Citation validation (API input + Firestore write).
 *
 * @phase R166-ai6a-1
 */
import { z } from 'zod';
import { ProvBaseCreateInputSchema } from './prov-base-schema';

// DOI regex per CrossRef spec: 10.{4-9 digits}/{rest}
// Example: 10.1038/s41586-022-04532-4
export const DOI_REGEX = /^10\.\d{4,9}\/[-._;()/:a-zA-Z0-9]+$/;

export const CitationConfidenceSchema = z.enum(['doi-exact', 'title-fuzzy', 'manual']);

// R166-ai6a-2-fix: tenantId + createdBy are server-injected (not user input from API),
// so we extend ProvBase fields explicitly instead of via ProvBaseCreateInputSchema.
export const CitationCreateInputSchema = ProvBaseCreateInputSchema.extend({
  tenantId: z.string().min(1),
  createdBy: z.string().min(1),
  sourcePaperId: z.string().min(1, 'sourcePaperId required'),
  targetDoi: z.string().regex(DOI_REGEX, 'Invalid DOI format').optional(),
  targetTitle: z.string().min(1).max(500).optional(),
  targetAuthors: z.array(z.string().min(1).max(200)).max(50).optional(),
  targetYear: z.number().int().min(1800).max(2100).optional(),
  targetJournal: z.string().min(1).max(300).optional(),
  targetPaperId: z.string().nullable().optional(),
  metadataSource: z.enum(['crossref', 'openalex', 'pdf-only', 'manual']).optional(),
  confidence: CitationConfidenceSchema,
  context: z.string().max(500).optional(),
  citationType: z.enum(['primary', 'review', 'methods', 'background', 'unknown']).optional()
}).refine((data) => data.targetDoi !== undefined || data.targetTitle !== undefined, {
  message: 'Either targetDoi or targetTitle must be provided'
});

export const CitationPatchSchema = z.object({
  // Only allow patching resolution + lifecycle fields, not source/extraction fields
  targetPaperId: z.string().nullable().optional(),
  confidence: CitationConfidenceSchema.optional(),
  citationType: z.enum(['primary', 'review', 'methods', 'background', 'unknown']).optional()
});

export type CitationCreateInput = z.infer<typeof CitationCreateInputSchema>;
export type CitationPatch = z.infer<typeof CitationPatchSchema>;
