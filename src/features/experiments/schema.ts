import { z } from 'zod';

export const experimentFormSchema = z.object({
  experimentCode: z.string().min(1, 'Code is required').max(50),
  title: z.string().min(1, 'Title is required').max(200),
  description: z.string().max(2000).optional(),
  experimentType: z.enum(['synthesis', 'characterization', 'measurement', 'analysis', 'other']),
  status: z.enum(['planned', 'running', 'completed', 'failed', 'cancelled']),
  sampleIds: z.array(z.string()).default([]),
  equipmentUsed: z.array(z.string()).default([]),
  temperature: z.coerce.number().optional(),
  pressure: z.coerce.number().optional(),
  duration: z.coerce.number().min(0).optional(),
  notes: z.string().max(5000).optional()
});

export type ExperimentFormValues = z.infer<typeof experimentFormSchema>;
