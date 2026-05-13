import { z } from 'zod';

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
  status: z.enum(['prepared', 'in_use', 'consumed', 'archived', 'discarded']),
  location: z.string().max(100).optional(),
  protocol: z.string().max(2000).optional()
});

export type SampleFormValues = z.infer<typeof sampleFormSchema>;
