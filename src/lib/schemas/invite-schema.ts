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
  role: InviteRoleSchema,
  // ADR-034 TEAM-2: optionally assign the invitee to a research group.
  // For group leaders this is forced to their own group at the route layer.
  groupId: z.string().min(1).max(128).optional()
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
  /** ADR-034 TEAM-2: research group the invitee joins on accept, if any. */
  groupId?: string;
}
