/**
 * Zod schema for ProvBase fields (PROV-O entities + activities).
 *
 * @phase R164-phase-2-schemas
 * @see src/types/prov-base.ts
 */
import { z } from 'zod';

export const LifecycleStatusSchema = z.enum(['active', 'deprecated', 'retracted']);

/**
 * Base fields required on all PROV-O records. Used as `.extend()` source
 * for entity + activity schemas.
 *
 * Note: `id`, `tenantId`, `createdBy`, `createdAt` are server-set, NOT in
 * Create inputs. Update patches generally don't touch them either.
 */
export const ProvBaseSchema = z.object({
  schemaVersion: z.number().int().positive(),
  derivedFrom: z.array(z.string()).max(50).optional(),
  generatedBy: z.string().max(100).optional(),
  lifecycleStatus: LifecycleStatusSchema.default('active'),
  retractedAt: z.number().int().positive().optional(),
  retractedBy: z.string().max(100).optional(),
  retractedReason: z.string().max(500).optional()
});

/**
 * Subset of ProvBase fields user can set during Create (others auto-generated).
 */
export const ProvBaseCreateInputSchema = z.object({
  derivedFrom: z.array(z.string()).max(50).optional(),
  generatedBy: z.string().max(100).optional()
});

/**
 * Patch shape for partial updates. lifecycleStatus changes happen via dedicated
 * deprecate/retract endpoints — not generic update.
 */
export const ProvBasePatchSchema = z.object({
  derivedFrom: z.array(z.string()).max(50).optional(),
  generatedBy: z.string().max(100).optional()
});
