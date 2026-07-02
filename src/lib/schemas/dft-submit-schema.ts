/**
 * DFT submit schema — the editor posts a serialized workflow to be launched.
 *
 * Light top-level validation here (id slug, preset, non-empty units); the
 * worker performs deep QE validation.
 *
 * @phase R245-dag-editor-b4-serialize
 */
import { z } from 'zod';

export const DFT_MACHINE_PRESETS = [
  'low',
  'standard',
  'bulk',
  'bulk-amd',
  'bulk-large',
  'bulk-amd-xl',
  'high-gpu'
] as const;

export const dftSubmitSchema = z.object({
  workflowId: z
    .string()
    .trim()
    .min(3)
    .max(64)
    .regex(/^[a-z0-9][a-z0-9-]*$/, 'Lowercase letters, digits and hyphens only.'),
  machinePreset: z.enum(DFT_MACHINE_PRESETS),
  workflow: z.object({
    structure: z.unknown(),
    global: z.unknown(),
    units: z.array(z.unknown()).min(1)
  })
});

export type DftSubmitInput = z.infer<typeof dftSubmitSchema>;
