import { z } from 'zod';

export const materialFormSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200),
  formula: z.string().max(100).optional(),
  category: z.enum([
    'oxide',
    'sulfide',
    'nitride',
    'carbon',
    'metal',
    'polymer',
    'composite',
    'perovskite',
    'two_dimensional',
    'other'
  ]),
  description: z.string().max(2000).optional()
});

export type MaterialFormValues = z.infer<typeof materialFormSchema>;
