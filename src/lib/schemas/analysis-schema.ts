/**
 * Zod schemas for Analysis activity record.
 *
 * @phase R164-phase-2-schemas
 * @see src/types/analyses.ts
 */
import { z } from 'zod';
import { ProvBaseCreateInputSchema, ProvBasePatchSchema } from './prov-base-schema';

// Server-side validation only — parsed/aiResult contents come from worker pubsub,
// trusted source. Validate top-level structure.
const AnalysisCoreFields = {
  measurementId: z.string().min(1).max(100),
  sampleId: z.string().max(100).optional(),
  analyzerVersion: z.string().min(1).max(50),
  modelTier: z.string().max(50).optional(),
  modelName: z.string().max(100).optional(),
  analysisDuration_ms: z.number().int().nonnegative().optional(),
  costUsd: z.number().nonnegative().optional(),
  parsed: z.record(z.string(), z.unknown()), // SpectrumParsedData
  aiResult: z.record(z.string(), z.unknown()).optional(),
  citationReferenceIds: z.array(z.string()).max(100).default([]),
  citationCandidates: z.array(z.record(z.string(), z.unknown())).max(50).optional(),
  supersedes: z.string().max(100).optional()
};

export const CreateAnalysisSchema = ProvBaseCreateInputSchema.extend(AnalysisCoreFields);
export const UpdateAnalysisSchema = ProvBasePatchSchema.extend(
  Object.fromEntries(Object.entries(AnalysisCoreFields).map(([k, v]) => [k, v.optional()])) as {
    [K in keyof typeof AnalysisCoreFields]: ReturnType<(typeof AnalysisCoreFields)[K]['optional']>;
  }
);

export type CreateAnalysisInput = z.infer<typeof CreateAnalysisSchema>;
export type UpdateAnalysisInput = z.infer<typeof UpdateAnalysisSchema>;
