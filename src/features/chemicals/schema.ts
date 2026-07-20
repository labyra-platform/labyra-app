import { z } from 'zod';

const GHS_PICTOGRAMS = [
  'GHS01',
  'GHS02',
  'GHS03',
  'GHS04',
  'GHS05',
  'GHS06',
  'GHS07',
  'GHS08',
  'GHS09'
] as const;

export const chemicalFormSchema = z.object({
  chemicalCode: z.string().min(1, 'Code is required').max(50),
  name: z.string().min(1, 'Name is required').max(200),
  casNumber: z
    .string()
    .regex(/^\d{2,7}-\d{2}-\d$/, 'Invalid CAS format (e.g. 7732-18-5)')
    .optional()
    .or(z.literal('')),
  formula: z.string().max(100).optional(),
  ghsHazards: z.array(z.enum(GHS_PICTOGRAMS)).default([]),
  hazardStatements: z.array(z.string().max(10)).optional(),
  signalWord: z.enum(['Danger', 'Warning']).optional(),
  purity: z.string().max(50).optional(),
  grade: z.string().max(100).optional(),
  manufacturer: z.string().max(100).optional(),
  catalogNumber: z.string().max(100).optional(),
  lotNumber: z.string().max(100).optional(),
  quantity: z.number().min(0, 'Quantity must be ≥ 0'),
  unit: z.enum(['g', 'kg', 'mg', 'mL', 'L', 'mol', 'mmol', 'piece']),
  state: z.enum(['solid', 'liquid', 'gas']),
  reorderThreshold: z.number().min(0).optional(),
  // R577: how reorderThreshold is read. 'absolute' means the number is in the
  // chemical's own unit (5 g); 'percent' means it is a fraction of… nothing on
  // its own — percent needs a baseline, see the type comment. Default absolute,
  // which is how every existing chemical (no mode stored) already behaves.
  reorderMode: z.enum(['absolute', 'percent']).optional(),
  location: z.string().max(100).optional(),
  storageConditions: z.string().max(200).optional(),
  expiryAt: z.number().optional(),
  expiryKind: z.enum(['expiry', 'retest', 'none']).optional()
});

export type ChemicalFormValues = z.infer<typeof chemicalFormSchema>;
