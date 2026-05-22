import { z } from 'zod';

/**
 * Group schemas — ADR-034 TEAM-1.
 * Owner (tenant admin/superadmin) creates groups and appoints leaders.
 */
export const CreateGroupSchema = z.object({
  name: z.string().min(1, 'Group name is required').max(120)
});
export type CreateGroupInput = z.infer<typeof CreateGroupSchema>;

export const UpdateGroupSchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    /** Appoint/transfer leader. uid of a tenant member, or null to clear. */
    leaderId: z.string().min(1).max(128).nullable().optional()
  })
  .refine((d) => d.name !== undefined || d.leaderId !== undefined, {
    message: 'At least one field must be provided'
  });
export type UpdateGroupInput = z.infer<typeof UpdateGroupSchema>;
