import { describe, expect, it } from 'vitest';

import type { PaperCollection } from '@/types/collections';
import {
  buildCollectionTree,
  collectionDepth,
  descendantIds,
  MAX_COLLECTION_DEPTH,
  subtreeHeight,
  validateMove,
  wouldCreateCycle,
  wouldExceedDepth
} from '@/features/papers/collections/collection-tree';

function mk(id: string, parentId: string | null = null): PaperCollection {
  return {
    id,
    tenantId: 't',
    schemaVersion: 1,
    createdBy: 'u',
    createdAt: 0,
    lifecycleStatus: 'active',
    name: id,
    paperIds: [],
    parentId
  };
}

// a → b → c (chain), plus sibling d under a, plus root e
const tree = [mk('a'), mk('b', 'a'), mk('c', 'b'), mk('d', 'a'), mk('e')];

describe('buildCollectionTree (R-collection-1)', () => {
  it('nests by parentId with input sibling order', () => {
    const roots = buildCollectionTree(tree);
    expect(roots.map((r) => r.collection.id)).toEqual(['a', 'e']);
    const a = roots[0];
    expect(a.children.map((c) => c.collection.id)).toEqual(['b', 'd']);
    expect(a.children[0].children.map((c) => c.collection.id)).toEqual(['c']);
  });

  it('treats a node whose parent is missing as a root (orphan never vanishes)', () => {
    const roots = buildCollectionTree([mk('x', 'ghost')]);
    expect(roots.map((r) => r.collection.id)).toEqual(['x']);
  });
});

describe('descendantIds', () => {
  it('returns the full subtree excluding the node itself', () => {
    expect(descendantIds(tree, 'a')).toEqual(new Set(['b', 'c', 'd']));
    expect(descendantIds(tree, 'b')).toEqual(new Set(['c']));
    expect(descendantIds(tree, 'c')).toEqual(new Set());
  });
});

describe('wouldCreateCycle', () => {
  it('blocks moving a node under itself', () => {
    expect(wouldCreateCycle(tree, 'a', 'a')).toBe(true);
  });
  it('blocks moving a node under one of its descendants', () => {
    expect(wouldCreateCycle(tree, 'a', 'c')).toBe(true); // c is under a
  });
  it('allows a valid move and a move to root', () => {
    expect(wouldCreateCycle(tree, 'c', 'e')).toBe(false);
    expect(wouldCreateCycle(tree, 'b', null)).toBe(false);
  });
});

describe('collectionDepth + subtreeHeight', () => {
  it('measures depth from root (root = 1)', () => {
    expect(collectionDepth(tree, 'a')).toBe(1);
    expect(collectionDepth(tree, 'b')).toBe(2);
    expect(collectionDepth(tree, 'c')).toBe(3);
  });
  it('measures subtree height (single node = 1)', () => {
    expect(subtreeHeight(tree, 'a')).toBe(3); // a→b→c
    expect(subtreeHeight(tree, 'c')).toBe(1);
  });
});

describe('wouldExceedDepth', () => {
  it('blocks a move that would push the subtree past the cap', () => {
    // depth-4 chain p1→p2→p3→p4; moving a 2-tall subtree under p3 (depth 3) → 5 > 4
    const deep = [mk('p1'), mk('p2', 'p1'), mk('p3', 'p2'), mk('p4', 'p3'), mk('s'), mk('s2', 's')];
    expect(wouldExceedDepth(deep, 's', 'p3', MAX_COLLECTION_DEPTH)).toBe(true);
  });
  it('allows a move that stays within the cap', () => {
    expect(wouldExceedDepth(tree, 'c', null)).toBe(false); // root + height 1 = 1
  });
});

describe('validateMove', () => {
  it('throws on a cycle', () => {
    expect(() => validateMove(tree, 'a', 'c')).toThrow(/cycle/i);
  });
  it('throws when exceeding depth', () => {
    const deep = [mk('p1'), mk('p2', 'p1'), mk('p3', 'p2'), mk('p4', 'p3'), mk('s'), mk('s2', 's')];
    expect(() => validateMove(deep, 's', 'p3')).toThrow(/depth/i);
  });
  it('does not throw for a valid move', () => {
    expect(() => validateMove(tree, 'c', 'e')).not.toThrow();
  });
});
