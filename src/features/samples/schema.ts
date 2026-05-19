import { z } from 'zod';

/**
 * Sample composition entry — declares one component of a multi-phase sample.
 *
 * Roles (must match worker src/deviation/multi_phase.py ROLE_WEIGHT):
 *   matrix    — primary phase (e.g. MoS2 in MoS2/rGO composite)
 *   core      — core in core-shell structure
 *   active    — functional layer
 *   shell     — shell in core-shell
 *   support   — supporting substrate (e.g. rGO, carbon black)
 *   filler    — non-functional bulk addition
 *   dopant    — small fraction, distinct signature
 *   substrate — underlying substrate (Si, SiO2, sapphire)
 *
 * @phase R185-4b
 */
export const compositionEntrySchema = z.object({
  formula: z
    .string()
    .min(1, 'Formula is required')
    .max(50)
    .regex(/^[A-Z]/, 'Formula must start with a capital letter'),
  role: z.enum(['matrix', 'core', 'active', 'shell', 'support', 'filler', 'dopant', 'substrate']),
  nominalFraction: z.coerce
    .number()
    .min(0, 'Fraction must be between 0 and 1')
    .max(1, 'Fraction must be between 0 and 1')
    .optional(),
  formationMethod: z.string().max(50).optional()
});

export type CompositionEntry = z.infer<typeof compositionEntrySchema>;

export const sampleFormSchema = z.object({
  sampleCode: z.string().min(1, 'Code is required').max(50),
  name: z.string().min(1, 'Name is required').max(200),
  description: z.string().max(1000).optional(),
  parentMaterialIds: z.array(z.string()).default([]),
  derivedFromSampleId: z.string().optional(),
  mass: z.coerce.number().min(0).optional(),
  volume: z.coerce.number().min(0).optional(),
  concentration: z.coerce.number().min(0).optional(),
  concentrationUnit: z.string().max(20).optional(),
  workflowStatus: z.enum(['prepared', 'in_use', 'consumed', 'archived', 'discarded']),
  location: z.string().max(100).optional(),
  protocol: z.string().max(2000).optional(),
  /** R185-4b: target composition for multi-phase deviation analysis. */
  composition: z.array(compositionEntrySchema).default([]).optional(),
  /** R185-4b: high-level composite type hint. */
  compositeType: z
    .enum(['single-phase', 'heterostructure', 'doped', 'mixed-phase', 'core-shell', 'composite'])
    .optional()
});

export type SampleFormValues = z.infer<typeof sampleFormSchema>;
