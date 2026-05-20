/**
 * Invite schema — onboarding ADR-031 (invite-only + email-match).
 *
 * @phase ONBOARD-1
 */
import { z } from 'zod';

// Roles an invite can grant. superadmin is NEVER invitable (set via script only).
export const InviteRoleSchema = z.enum(['admin', 'member', 'viewer']);
export type InviteRole = z.infer<typeof InviteRoleSchema>;

export const CreateInviteSchema = z.object({
  email: z.string().email().max(254).toLowerCase(),
  role: InviteRoleSchema
});
export type CreateInviteInput = z.infer<typeof CreateInviteSchema>;

export type InviteStatus = 'pending' | 'accepted' | 'revoked';

export interface Invite {
  id: string;
  tenantId: string;
  email: string;
  role: InviteRole;
  invitedBy: string; // uid
  status: InviteStatus;
  createdAt: number;
  expiresAt: number;
  acceptedAt?: number;
  acceptedBy?: string; // uid
}
