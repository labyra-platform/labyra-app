/**
 * Project (Đề tài) — the WHAT axis of research, independent of the WHO axis
 * (Research Group). Modeled on Benchling "Studies": experiments, computations,
 * manuscripts and collections link to a Project via a `projectId` field and
 * stay visible both at their origin and in the project overview (no copies).
 *
 * Storage: tenants/{tenantId}/projects/{projectId} (per-tenant, like collections).
 *
 * @phase R263 — Project entity (MVP data layer)
 * @see labyra-project-entity-spec.md
 */
import { z } from 'zod';
import type { ProvBase } from './prov-base';

/** Kind of research project — shapes manuscript template + default timeline. */
export type ProjectType = 'course' | 'graduation' | 'master' | 'phd' | 'funded';

/** Who owns the project (the WHO axis: a user or a research group). */
export type ProjectOwnerType = 'individual' | 'group';

/** Grant level for funded projects (B2G — Nghị quyết 57). */
export type GrantLevel = 'university' | 'provincial' | 'ministry' | 'national';

/** Workflow status of the project (distinct from PROV-O lifecycleStatus). */
export type ProjectStatus = 'planning' | 'active' | 'writing' | 'completed' | 'archived';

/** A dated milestone on the project timeline (v2 surfaces it on a calendar). */
export interface Milestone {
  id: string;
  title: string;
  /** ISO date (yyyy-mm-dd). */
  dueDate: string;
  type: 'proposal' | 'experiment' | 'analysis' | 'draft' | 'defense' | 'submission' | 'custom';
  done: boolean;
}

export interface Project extends ProvBase {
  name: string;
  description?: string;
  type: ProjectType;

  // Ownership (WHO)
  ownerType: ProjectOwnerType;
  /** userId when ownerType==='individual', groupId when ownerType==='group'. */
  ownerId: string;
  /** Participants beyond the owner. */
  memberIds: string[];
  /** Supervisor (GVHD) for course/graduation/master/phd. */
  advisorId?: string;

  // Funded-only
  grantLevel?: GrantLevel;
  grantCode?: string;

  // Timeline
  /** ISO date (yyyy-mm-dd). */
  startDate?: string;
  /** ISO date (yyyy-mm-dd). */
  dueDate?: string;
  milestones?: Milestone[];

  status: ProjectStatus;
}

export const PROJECT_TYPES: readonly ProjectType[] = [
  'course',
  'graduation',
  'master',
  'phd',
  'funded'
];

export const GRANT_LEVELS: readonly GrantLevel[] = [
  'university',
  'provincial',
  'ministry',
  'national'
];

export const PROJECT_STATUSES: readonly ProjectStatus[] = [
  'planning',
  'active',
  'writing',
  'completed',
  'archived'
];

/**
 * Validates the editable fields of a project (create/update form payload).
 * ProvBase + server-set fields (id, tenantId, createdAt, lifecycleStatus, ...)
 * are NOT part of the input — the query layer fills them. `funded` requires a
 * grant level (B2G), enforced via superRefine.
 */
export const projectInputSchema = z
  .object({
    name: z.string().trim().min(1, 'Name is required').max(200),
    description: z.string().max(2000).optional(),
    type: z.enum(['course', 'graduation', 'master', 'phd', 'funded']),
    ownerType: z.enum(['individual', 'group']),
    ownerId: z.string().min(1),
    memberIds: z.array(z.string()).default([]),
    advisorId: z.string().optional(),
    grantLevel: z.enum(['university', 'provincial', 'ministry', 'national']).optional(),
    grantCode: z.string().max(100).optional(),
    startDate: z.string().optional(),
    dueDate: z.string().optional(),
    status: z.enum(['planning', 'active', 'writing', 'completed', 'archived']).default('planning')
  })
  .superRefine((p, ctx) => {
    if (p.type === 'funded' && !p.grantLevel) {
      ctx.addIssue({
        code: 'custom',
        path: ['grantLevel'],
        message: 'A funded project needs a grant level.'
      });
    }
  });

export type ProjectInput = z.infer<typeof projectInputSchema>;
