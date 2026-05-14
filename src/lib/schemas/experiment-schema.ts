/**
 * Zod schemas for Experiment entity.
 *
 * @phase R164-phase-2-schemas
 * @see src/types/experiments.ts
 */
import { z } from 'zod';
import { ProvBaseCreateInputSchema, ProvBasePatchSchema } from './prov-base-schema';

export const ExperimentTypeSchema = z.enum([
  'synthesis',
  'characterization',
  'measurement',
  'analysis',
  'other'
]);

export const ExperimentWorkflowStatusSchema = z.enum([
  'planned',
  'running',
  'completed',
  'failed',
  'cancelled'
]);

const ExperimentCoreFields = {
  experimentCode: z.string().min(1).max(50),
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  hypothesis: z.string().max(2000).optional(),
  experimentType: ExperimentTypeSchema,
  workflowStatus: ExperimentWorkflowStatusSchema.default('planned'),
  sampleIds: z.array(z.string()).max(100),
  equipmentUsed: z.array(z.string()).max(50).optional(),
  scheduledAt: z.number().int().positive().optional(),
  startedAt: z.number().int().positive().optional(),
  completedAt: z.number().int().positive().optional(),
  notes: z.string().max(5000).optional(),
  attachmentPaths: z.array(z.string()).max(50).optional(),
  temperature: z.number().optional(),
  pressure: z.number().nonnegative().optional(),
  duration: z.number().nonnegative().optional(),
  results: z.record(z.string(), z.unknown()).optional()
};

export const CreateExperimentSchema = ProvBaseCreateInputSchema.extend(ExperimentCoreFields);
export const UpdateExperimentSchema = ProvBasePatchSchema.extend(
  Object.fromEntries(Object.entries(ExperimentCoreFields).map(([k, v]) => [k, v.optional()])) as {
    [K in keyof typeof ExperimentCoreFields]: ReturnType<
      (typeof ExperimentCoreFields)[K]['optional']
    >;
  }
);

export type CreateExperimentInput = z.infer<typeof CreateExperimentSchema>;
export type UpdateExperimentInput = z.infer<typeof UpdateExperimentSchema>;
