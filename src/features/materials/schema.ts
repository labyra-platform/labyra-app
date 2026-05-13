import { z } from 'zod';

export const materialFormSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200),
  formula: z.string().max(100).optional(),
  category: z.enum(['chemical', 'reagent', 'solvent', 'gas', 'consumable', 'equipment', 'other']),
  cas: z.string().max(20).optional(),
  quantity: z.coerce.number().min(0, 'Must be non-negative'),
  unit: z.enum(['g', 'kg', 'mg', 'mL', 'L', 'µL', 'mol', 'mmol', 'piece', 'box']),
  location: z.string().max(100).optional(),
  supplier: z.string().max(100).optional(),
  lotNumber: z.string().max(50).optional(),
  hazardLevel: z.enum(['none', 'low', 'medium', 'high', 'extreme']),
  hazardNotes: z.string().max(500).optional()
});

export type MaterialFormValues = z.infer<typeof materialFormSchema>;
