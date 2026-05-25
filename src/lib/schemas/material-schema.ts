/**
 * Zod schemas for Material entity — scientific reference catalog (R232).
 *
 * @see src/types/materials.ts
 */
import { z } from 'zod';
import { ProvBaseCreateInputSchema, ProvBasePatchSchema, ProvBaseSchema } from './prov-base-schema';

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

/**
 * Full-doc READ schema (R244, audit Option B). LENIENT by design: legacy docs
 * (pre-R232 categories, missing schemaVersion) must stay visible + editable,
 * so unknown category coerces to 'other' and schemaVersion tolerates absence.
 * A doc only fails parse if it lacks a usable identity/name.
 * Output is cast to `Material` at the hook boundary.
 */
export const MaterialDocSchema = ProvBaseSchema.extend({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  createdBy: z.string(),
  createdAt: z.number(),
  schemaVersion: z.number().catch(2),
  name: z.string().min(1).max(200),
  formula: z.string().max(100).optional(),
  category: MaterialCategorySchema.catch('other'),
  description: z.string().max(2000).optional()
});

export type MaterialDoc = z.infer<typeof MaterialDocSchema>;
