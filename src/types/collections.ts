/**
 * Paper Collection — per-user, Zotero-style topic grouping of papers.
 *
 * Distinct from groupId (ADR-034 access scope): a collection is PERSONAL
 * organization, filtered by `createdBy == uid`, independent of who may access a
 * paper. One paper has exactly one groupId but may live in many collections.
 *
 * Firestore: tenants/{tid}/collections/{collectionId}
 *
 * @phase R-collection-1
 * @see labyra-collection-download-strategy.md §3
 */
import type { ProvBase } from '@/types/prov-base';

export interface PaperCollection extends ProvBase {
  // ProvBase supplies: id, tenantId, schemaVersion, createdBy (per-user owner),
  // createdAt, updatedBy?, updatedAt?, lifecycleStatus, derivedFrom?, ...
  /** Display name, e.g. "WO₃ photocatalysis". */
  name: string;
  description?: string;
  /** Member papers (many-to-many). A paper may belong to several collections. */
  paperIds: string[];
  /** UI colour tag (Zotero-style). */
  color?: string;
  /** Parent collection for nesting; null/undefined = root. */
  parentId?: string | null;
  /**
   * R265: optional link to a Project (Đề tài). Cross-cutting — the collection
   * stays visible at its origin AND in the project overview (Benchling Studies);
   * not duplicated. Resources (papers) themselves are not project-scoped.
   */
  projectId?: string;
  /**
   * Auto-managed bucket holding papers orphaned when a sibling subcollection is
   * deleted ("Chưa phân loại"). Not user-created; identified by this flag.
   */
  isUnfiledBucket?: boolean;
}
