/**
 * Compose draft store — an in-memory singleton that keeps the composer's working
 * state alive across tab/subtab navigation. Client-side navigation in Next.js does
 * not reload the JS context, so a module-level value survives switching between the
 * computation tabs (it only resets on a hard reload, which beforeunload guards).
 *
 * It also tracks a dirty flag (unsaved edits vs the last Firestore save) that the
 * ComputationTabs reads to warn before navigating away. useSyncExternalStore-ready.
 *
 * @phase R380-compose-persist
 */

export interface ComposeDraft {
  /** Context key = `${projectId ?? ''}:${structureId ?? ''}` — a draft is only
   * restored when the composer opens on the same project + structure. */
  contextKey: string;
  nodes: unknown;
  global: unknown;
  runId: string;
  sourceId: string;
  selectedId: string | null;
  pickedProject: string;
  archId: string;
}

let draft: ComposeDraft | null = null;
let dirty = false;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

export function saveComposeDraft(next: ComposeDraft): void {
  draft = next;
}

export function getComposeDraft(): ComposeDraft | null {
  return draft;
}

export function clearComposeDraft(): void {
  draft = null;
}

/** Dirty = there are compose edits not yet saved to Firestore. */
export function setComposeDirty(value: boolean): void {
  if (dirty === value) return;
  dirty = value;
  emit();
}

export function getComposeDirty(): boolean {
  return dirty;
}

export function subscribeComposeDirty(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
