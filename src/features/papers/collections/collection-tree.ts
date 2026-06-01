/**
 * Pure tree operations for nested paper collections — no I/O, unit-testable.
 * Used to validate moves (no cycles, depth cap) and to render the sidebar tree.
 * Every function is cycle-safe so a corrupted parent chain can never hang.
 *
 * @phase R-collection-1
 */
import type { PaperCollection } from '@/types/collections';

/** Max nesting depth (root = 1). Enforced on move/create. */
export const MAX_COLLECTION_DEPTH = 4;

export interface CollectionNode {
  collection: PaperCollection;
  children: CollectionNode[];
}

function parentIdOf(c: PaperCollection): string | null {
  return c.parentId ?? null;
}

/** Map parentId → child ids, in input order. Shared by the tree walkers. */
function childrenByParent(collections: PaperCollection[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const c of collections) {
    const pid = parentIdOf(c);
    if (pid != null) {
      const arr = map.get(pid);
      if (arr) arr.push(c.id);
      else map.set(pid, [c.id]);
    }
  }
  return map;
}

/**
 * Nest a flat list into a forest by parentId. A node is a root when its
 * parentId is null OR points to a collection not in the list (orphans surface
 * as roots rather than vanishing). Sibling order follows input order.
 */
export function buildCollectionTree(collections: PaperCollection[]): CollectionNode[] {
  const present = new Set(collections.map((c) => c.id));
  const nodeById = new Map<string, CollectionNode>(
    collections.map((c) => [c.id, { collection: c, children: [] }])
  );
  const roots: CollectionNode[] = [];
  for (const c of collections) {
    const node = nodeById.get(c.id);
    if (!node) continue;
    const pid = parentIdOf(c);
    const parent = pid != null && present.has(pid) ? nodeById.get(pid) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}

/** All descendant ids of `rootId` (excluding itself). Cycle-safe. */
export function descendantIds(collections: PaperCollection[], rootId: string): Set<string> {
  const kids = childrenByParent(collections);
  const out = new Set<string>();
  const stack = [...(kids.get(rootId) ?? [])];
  while (stack.length > 0) {
    const id = stack.pop();
    if (id === undefined || out.has(id)) continue;
    out.add(id);
    for (const child of kids.get(id) ?? []) stack.push(child);
  }
  return out;
}

/**
 * Would moving `moveId` under `newParentId` create a cycle? True when the new
 * parent is the node itself or one of its descendants.
 */
export function wouldCreateCycle(
  collections: PaperCollection[],
  moveId: string,
  newParentId: string | null
): boolean {
  if (newParentId == null) return false; // to root: never a cycle
  if (newParentId === moveId) return true; // self-parent
  return descendantIds(collections, moveId).has(newParentId);
}

/** Depth of `id` from its root (root = 1). Cycle-safe (stops on revisit). */
export function collectionDepth(collections: PaperCollection[], id: string): number {
  const byId = new Map(collections.map((c) => [c.id, c]));
  const seen = new Set<string>();
  let depth = 0;
  let cur: string | null = id;
  while (cur != null && byId.has(cur) && !seen.has(cur)) {
    seen.add(cur);
    depth += 1;
    const node = byId.get(cur);
    cur = node ? parentIdOf(node) : null;
  }
  return depth;
}

/** Height of the subtree rooted at `id` (single node = 1). Cycle-safe. */
export function subtreeHeight(collections: PaperCollection[], id: string): number {
  const kids = childrenByParent(collections);
  const seen = new Set<string>();
  const walk = (node: string): number => {
    if (seen.has(node)) return 0;
    seen.add(node);
    let max = 0;
    for (const k of kids.get(node) ?? []) max = Math.max(max, walk(k));
    return 1 + max;
  };
  return walk(id);
}

/**
 * Would moving `moveId` (with its whole subtree) under `newParentId` exceed
 * `maxDepth`? Moving to root means the parent contributes depth 0.
 */
export function wouldExceedDepth(
  collections: PaperCollection[],
  moveId: string,
  newParentId: string | null,
  maxDepth: number = MAX_COLLECTION_DEPTH
): boolean {
  const parentDepth = newParentId == null ? 0 : collectionDepth(collections, newParentId);
  return parentDepth + subtreeHeight(collections, moveId) > maxDepth;
}

/**
 * Throw if moving `moveId` under `newParentId` is illegal (cycle or depth cap).
 * Defensive guard for moveCollection, independent of any UI pre-check.
 */
export function validateMove(
  collections: PaperCollection[],
  moveId: string,
  newParentId: string | null,
  maxDepth: number = MAX_COLLECTION_DEPTH
): void {
  if (wouldCreateCycle(collections, moveId, newParentId)) {
    throw new Error('Move would create a cycle in the collection tree.');
  }
  if (wouldExceedDepth(collections, moveId, newParentId, maxDepth)) {
    throw new Error(`Move would exceed the maximum nesting depth (${maxDepth}).`);
  }
}
