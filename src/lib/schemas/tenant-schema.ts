/**
 * Tenant Zod schema — validates the `/tenants/{id}` root doc.
 *
 * @phase TD-ONBOARD
 */
import { z } from 'zod';

export const TenantPlanSchema = z.enum(['dev', 'free', 'trial', 'pro', 'enterprise']);

export const TenantSchema = z.object({
  name: z.string().min(1).max(200),
  plan: TenantPlanSchema,
  createdAt: z.number(),
  createdBy: z.string().min(1),
  trialEndsAt: z.number().optional(),
  stripeCustomerId: z.string().optional()
});
export type TenantDoc = z.infer<typeof TenantSchema>;
