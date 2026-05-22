/**
 * Group (research group / team) — `/tenants/{tenantId}/groups/{groupId}`.
 *
 * A group is a group of PEOPLE (a leader + members), not a research project.
 * Per ADR-034: groups are the unit of data isolation for research IP
 * (experiments/samples/spectra/papers) while physical resources
 * (equipment/chemicals/bookings) stay tenant-shared.
 *
 * Leadership is expressed via custom claims (groupId + isGroupLead), NOT a
 * fifth role — RBAC stays 2-axis (role × scope). See ADR-034 §2.2.
 *
 * @phase TEAM-1 (ADR-034)
 */
export interface Group {
  schemaVersion: 1;
  /** Document ID. Not stored in the doc body. */
  id: string;
  tenantId: string;
  name: string;
  /** uid of the appointed group leader (group_admin), if any. */
  leaderId?: string;
  /** uid of the owner/admin who created the group. */
  createdBy: string;
  createdAt: number;
  updatedAt: number;
}
