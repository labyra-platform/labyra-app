/**
 * Zod schemas for Material entity — scientific reference catalog (R232).
 *
 * @see src/types/materials.ts
 */
import { z } from 'zod';
import { ProvBaseCreateInputSchema, ProvBasePatchSchema } from './prov-base-schema';

export const MaterialCategorySchema = z.enum([
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
]);

const MaterialCoreFields = {
  name: z.string().min(1).max(200),
  formula: z.string().max(100).optional(),
  category: MaterialCategorySchema,
  description: z.string().max(2000).optional()
};

export const CreateMaterialSchema = ProvBaseCreateInputSchema.extend(MaterialCoreFields);
export const UpdateMaterialSchema = ProvBasePatchSchema.extend(
  Object.fromEntries(Object.entries(MaterialCoreFields).map(([k, v]) => [k, v.optional()])) as {
    [K in keyof typeof MaterialCoreFields]: ReturnType<(typeof MaterialCoreFields)[K]['optional']>;
  }
);

export type CreateMaterialInput = z.infer<typeof CreateMaterialSchema>;
export type UpdateMaterialInput = z.infer<typeof UpdateMaterialSchema>;
