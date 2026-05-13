import { z } from 'zod';

export const equipmentFormSchema = z.object({
  equipmentCode: z.string().min(1, 'Code is required').max(50),
  name: z.string().min(1, 'Name is required').max(200),
  description: z.string().max(1000).optional(),
  category: z.enum([
    'reactor',
    'measurement',
    'furnace',
    'computer',
    'spectrometer',
    'microscope',
    'other'
  ]),
  manufacturer: z.string().max(100).optional(),
  model: z.string().max(100).optional(),
  serialNumber: z.string().max(100).optional(),
  location: z.string().max(100).optional(),
  status: z.enum(['available', 'in_use', 'maintenance', 'broken', 'retired']),
  notes: z.string().max(2000).optional()
});

export type EquipmentFormValues = z.infer<typeof equipmentFormSchema>;
