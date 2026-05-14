/**
 * Zod schemas for Measurement activity record.
 *
 * @phase R164-phase-2-schemas
 * @see src/types/measurements.ts
 */
import { z } from 'zod';
import { ProvBaseCreateInputSchema, ProvBasePatchSchema } from './prov-base-schema';

export const SpectrumTypeSchema = z.enum([
  'xrd',
  'uvvis',
  'uvvis_drs',
  'raman',
  'ftir',
  'tga',
  'dsc',
  'ocp',
  'pl',
  'eds',
  'sem',
  'tem',
  'bet',
  'cv',
  'lsv',
  'eis',
  'gcd'
]);

export const MeasurementProcessingStatusSchema = z.enum([
  'uploaded',
  'queued',
  'parsing',
  'analyzing',
  'analyzed',
  'failed'
]);

const MeasurementCoreFields = {
  sampleId: z.string().max(100).optional(),
  experimentId: z.string().max(100).optional(),
  spectrumType: SpectrumTypeSchema,
  formula: z.string().max(100).optional(),
  measuredAt: z.number().int().positive().optional(),
  fileAssetPath: z.string().min(1).max(500),
  originalFilename: z.string().min(1).max(200),
  mimeType: z.string().max(100),
  sizeBytes: z
    .number()
    .int()
    .positive()
    .max(100 * 1024 * 1024), // 100 MB hard cap
  sha256: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional(),
  instrument: z.string().max(200).optional(),
  parameters: z.record(z.string(), z.unknown()).optional(),
  processingStatus: MeasurementProcessingStatusSchema.default('uploaded'),
  processingStatusAt: z.number().int().positive().optional(),
  processingError: z.string().max(2000).optional(),
  analysisId: z.string().max(100).optional()
};

export const CreateMeasurementSchema = ProvBaseCreateInputSchema.extend(MeasurementCoreFields);
export const UpdateMeasurementSchema = ProvBasePatchSchema.extend(
  Object.fromEntries(Object.entries(MeasurementCoreFields).map(([k, v]) => [k, v.optional()])) as {
    [K in keyof typeof MeasurementCoreFields]: ReturnType<
      (typeof MeasurementCoreFields)[K]['optional']
    >;
  }
);

export type CreateMeasurementInput = z.infer<typeof CreateMeasurementSchema>;
export type UpdateMeasurementInput = z.infer<typeof UpdateMeasurementSchema>;
