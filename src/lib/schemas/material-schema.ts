/**
 * Zod schemas for Material entity.
 *
 * @phase R164-phase-2-schemas
 * @see src/types/materials.ts
 */
import { z } from 'zod';
import { ProvBaseCreateInputSchema, ProvBasePatchSchema } from './prov-base-schema';

export const MaterialCategorySchema = z.enum([
  'chemical',
  'reagent',
  'solvent',
  'gas',
  'consumable',
  'equipment',
  'other'
]);

export const MaterialUnitSchema = z.enum([
  'g',
  'kg',
  'mg',
  'mL',
  'L',
  'µL',
  'mol',
  'mmol',
  'piece',
  'box'
]);

export const HazardLevelSchema = z.enum(['none', 'low', 'medium', 'high', 'extreme']);

const MaterialCoreFields = {
  name: z.string().min(1).max(200),
  formula: z.string().max(100).optional(),
  category: MaterialCategorySchema,
  cas: z
    .string()
    .max(50)
    .regex(/^[\d-]*$/, 'cas: digits and hyphens only')
    .optional(),
  quantity: z.number().nonnegative(),
  unit: MaterialUnitSchema,
  location: z.string().max(100).optional(),
  supplier: z.string().max(100).optional(),
  lotNumber: z.string().max(50).optional(),
  purchaseDate: z.number().int().positive().optional(),
  expiryDate: z.number().int().positive().optional(),
  hazardLevel: HazardLevelSchema.default('none'),
  hazardNotes: z.string().max(1000).optional()
};

export const CreateMaterialSchema = ProvBaseCreateInputSchema.extend(MaterialCoreFields);
export const UpdateMaterialSchema = ProvBasePatchSchema.extend(
  Object.fromEntries(Object.entries(MaterialCoreFields).map(([k, v]) => [k, v.optional()])) as {
    [K in keyof typeof MaterialCoreFields]: ReturnType<(typeof MaterialCoreFields)[K]['optional']>;
  }
);

export type CreateMaterialInput = z.infer<typeof CreateMaterialSchema>;
export type UpdateMaterialInput = z.infer<typeof UpdateMaterialSchema>;
