/**
 * Zod schemas for Sample entity.
 *
 * @phase R164-phase-2-schemas
 * @see src/types/samples.ts
 */
import { z } from 'zod';
import { ProvBaseCreateInputSchema, ProvBasePatchSchema } from './prov-base-schema';

export const SampleWorkflowStatusSchema = z.enum([
  'prepared',
  'in_use',
  'consumed',
  'archived',
  'discarded'
]);

// R185-4b: composition entry — must mirror src/features/samples/schema.ts
const CompositionEntryFields = z.object({
  formula: z
    .string()
    .min(1)
    .max(50)
    .regex(/^[A-Z]/, 'Formula must start with capital letter'),
  role: z.enum(['matrix', 'core', 'active', 'shell', 'support', 'filler', 'dopant', 'substrate']),
  nominalFraction: z.number().min(0).max(1).optional(),
  formationMethod: z.string().max(50).optional()
});

export const CompositeTypeSchema = z.enum([
  'single-phase',
  'heterostructure',
  'doped',
  'mixed-phase',
  'core-shell',
  'composite'
]);

const SampleCoreFields = {
  sampleCode: z.string().min(1).max(50),
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  parentMaterialIds: z.array(z.string()).max(50),
  derivedFromSampleId: z.string().max(100).optional(),
  preparedAt: z.number().int().positive(),
  preparedBy: z.string().max(100),
  protocol: z.string().max(2000).optional(),
  mass: z.number().nonnegative().optional(),
  volume: z.number().nonnegative().optional(),
  concentration: z.number().nonnegative().optional(),
  concentrationUnit: z.string().max(20).optional(),
  workflowStatus: SampleWorkflowStatusSchema.default('prepared'),
  location: z.string().max(100).optional(),
  // R185-4b: multi-phase composition declaration
  composition: z.array(CompositionEntryFields).max(20).optional(),
  compositeType: CompositeTypeSchema.optional()
};

export const CreateSampleSchema = ProvBaseCreateInputSchema.extend(SampleCoreFields);
export const UpdateSampleSchema = ProvBasePatchSchema.extend(
  Object.fromEntries(Object.entries(SampleCoreFields).map(([k, v]) => [k, v.optional()])) as {
    [K in keyof typeof SampleCoreFields]: ReturnType<(typeof SampleCoreFields)[K]['optional']>;
  }
);

export type CreateSampleInput = z.infer<typeof CreateSampleSchema>;
export type UpdateSampleInput = z.infer<typeof UpdateSampleSchema>;
