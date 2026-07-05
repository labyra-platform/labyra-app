/**
 * DftProject: a named container grouping crystal structures for computation, plus
 * saved compose states so an in-progress workflow survives leaving the page.
 *
 * Firestore layout:
 *   tenants/{tid}/dftProjects/{projectId}
 *   tenants/{tid}/dftProjects/{projectId}/composeStates/{composeId}
 *
 * A project references structures from the shared crystal-structure store (by id);
 * it does not copy them. One structure may have several compose states in a
 * project, distinguished by runId (which must be unique within the project so job
 * names stay unique).
 */

export interface DftProject {
  id: string;
  name: string;
  /** Epoch ms. */
  createdAt: number | null;
  /** crystalStructure ids imported into this project. */
  structureIds: string[];
}

export interface DftComposeState {
  id: string;
  /** crystalStructure id this compose targets. */
  structureId: string;
  /** Unique-within-project run identifier; becomes part of the job name. */
  runId: string;
  /** Serialized compose nodes (ComposeNode[]). */
  nodes: unknown;
  /** Serialized global settings (DftWorkflowGlobal). */
  global: unknown;
  /** Currently-selected node id, restored on reopen. */
  selectedId?: string | null;
  /** Epoch ms of the last manual save. */
  updatedAt: number | null;
}

export interface CreateDftProjectInput {
  name: string;
}

export interface SaveComposeStateInput {
  projectId: string;
  structureId: string;
  runId: string;
  nodes: unknown;
  global: unknown;
  selectedId?: string | null;
}
