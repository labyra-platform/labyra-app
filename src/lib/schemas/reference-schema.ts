/**
 * Zod schemas for Reference entity (port + extension of R163 reference-card-schema).
 *
 * Adds:
 *   - ProvBase fields (lifecycleStatus, createdBy, etc.)
 *   - paperId optional link to Paper entity (for DOI verification, R164 ADR-016)
 *   - currentVersion for sub-collection versioning
 *
 * @phase R164-phase-2-schemas
 * @see src/types/references.ts
 */
// R165-phase-1-oxlint: oxlint cleanup
import { z } from 'zod';
import { ProvBaseCreateInputSchema } from './prov-base-schema';
import {
  XRDPeakSchema,
  FTIRPeakSchema,
  RamanPeakSchema,
  UVVisPeakSchema,
  CardNumberSchema,
  PhaseNameSchema,
  FormulaSchema,
  SpaceGroupSchema,
  AnodeSchema
} from '@/lib/spectra/reference-card-schema';

/**
 * Common fields for all spectrum types (refs).
 */
const RefBaseFields = {
  cardNumber: CardNumberSchema,
  phaseName: PhaseNameSchema,
  formula: FormulaSchema,
  source: z.enum(['manual', 'cod', 'mp', 'paper']).default('manual'),
  sourceUrl: z.string().url().max(500).optional(),
  paperId: z.string().max(100).optional(), // R164: link to Paper entity
  notes: z.string().max(1000).optional()
};

export const CreateXRDReferenceSchema = ProvBaseCreateInputSchema.extend({
  ...RefBaseFields,
  spectrumType: z.literal('xrd'),
  spaceGroup: SpaceGroupSchema,
  anode: AnodeSchema,
  peaks: z.array(XRDPeakSchema).min(3).max(200)
});

export const CreateFTIRReferenceSchema = ProvBaseCreateInputSchema.extend({
  ...RefBaseFields,
  spectrumType: z.literal('ftir'),
  mode: z.enum(['transmittance', 'absorbance']).optional(),
  peaks: z.array(FTIRPeakSchema).min(2).max(200)
});

export const CreateRamanReferenceSchema = ProvBaseCreateInputSchema.extend({
  ...RefBaseFields,
  spectrumType: z.literal('raman'),
  laserWavelength: z.number().gte(200).lte(2000).optional(),
  peaks: z.array(RamanPeakSchema).min(2).max(200)
});

export const CreateUVVisReferenceSchema = ProvBaseCreateInputSchema.extend({
  ...RefBaseFields,
  spectrumType: z.literal('uvvis'),
  solvent: z.string().max(50).optional(),
  peaks: z.array(UVVisPeakSchema).min(1).max(100)
});

export const CreateAnyReferenceSchema = z.discriminatedUnion('spectrumType', [
  CreateXRDReferenceSchema,
  CreateFTIRReferenceSchema,
  CreateRamanReferenceSchema,
  CreateUVVisReferenceSchema
]);

export type CreateAnyReferenceInput = z.infer<typeof CreateAnyReferenceSchema>;
