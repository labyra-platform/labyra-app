/**
 * DFT submit form schema — launches a *verified preset* workflow.
 *
 * Intentionally narrow: the user picks a known template + names the run.
 * Arbitrary structure/parameter editing is out of scope (a future builder),
 * which keeps the compute-triggering surface small and safe.
 *
 * @phase R240-dft-submit
 */
import { z } from 'zod';

export const DFT_TEMPLATE_IDS = ['h-wo3-bulk-pbeu', '2h-ws2-bulk-vdw'] as const;

export const DFT_MACHINE_PRESETS = ['bulk-large', 'bulk-amd', 'standard'] as const;

export const dftSubmitSchema = z.object({
  templateId: z.enum(DFT_TEMPLATE_IDS),
  workflowId: z
    .string()
    .trim()
    .min(3)
    .max(64)
    .regex(/^[a-z0-9][a-z0-9-]*$/, 'Lowercase letters, digits and hyphens only.'),
  machinePreset: z.enum(DFT_MACHINE_PRESETS)
});

export type DftSubmitInput = z.infer<typeof dftSubmitSchema>;
