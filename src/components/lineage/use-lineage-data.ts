/**
 * Hook to fetch PROV-O lineage edges starting from a root entity.
 *
 * Returns nodes + edges in a shape consumable by D3 force layout.
 * Traverses backward (derivedFrom) AND forward (find* lineage queries).
 *
 * @phase R164-phase-8-9a
 */
'use client';
import { getAuth } from 'firebase/auth';
import { useEffect, useState } from 'react';

export type EntityType =
  | 'material'
  | 'sample'
  | 'experiment'
  | 'measurement'
  | 'analysis'
  | 'reference'
  | 'paper';

export interface LineageNode {
  id: string;
  type: EntityType;
  label: string;
  /** Distance from root (0 = root). Used for color/opacity. */
  depth: number;
}

export interface LineageEdge {
  source: string;
  target: string;
  /** PROV-O relation type. */
  relation: 'derivedFrom' | 'generatedBy' | 'used';
}

interface LineageData {
  nodes: LineageNode[];
  edges: LineageEdge[];
}

const COLLECTION_BY_TYPE: Record<EntityType, string> = {
  material: 'materials',
  sample: 'samples',
  experiment: 'experiments',
  measurement: 'measurements',
  analysis: 'analyses',
  reference: 'references',
  paper: 'papers'
};

async function fetchEntity(
  type: EntityType,
  id: string,
  token: string
): Promise<Record<string, unknown> | null> {
  const res = await fetch(`/api/${COLLECTION_BY_TYPE[type]}/${id}`, {
    headers: { authorization: `Bearer ${token}` }
  });
  if (!res.ok) return null;
  return res.json();
}

function inferLabel(type: EntityType, data: Record<string, unknown>): string {
  switch (type) {
    case 'material':
      return (data.name as string) ?? (data.id as string);
    case 'sample':
      return (data.sampleCode as string) ?? (data.name as string) ?? (data.id as string);
    case 'experiment':
      return (data.experimentCode as string) ?? (data.title as string) ?? (data.id as string);
    case 'measurement':
      return (
        ((data.spectrumType as string) ?? 'spectrum') +
        ': ' +
        ((data.originalFilename as string) ?? (data.id as string))
      );
    case 'analysis':
      return (data.analyzerVersion as string) ?? 'analysis';
    case 'reference':
      return (data.cardNumber as string) ?? (data.phaseName as string) ?? (data.id as string);
    case 'paper':
      return (data.title as string) ?? (data.id as string);
    default:
      return (data.id as string) ?? '?';
  }
}

export function useLineageData(
  rootType: EntityType,
  rootId: string,
  maxDepth: number = 3
): { data: LineageData; loading: boolean; error: string | null } {
  const [data, setData] = useState<LineageData>({ nodes: [], edges: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const user = getAuth().currentUser;
        if (!user) throw new Error('not_authenticated');
        const token = await user.getIdToken();

        const nodes: Map<string, LineageNode> = new Map();
        const edges: LineageEdge[] = [];

        // BFS traversal backward (derivedFrom)
        const queue: Array<{ type: EntityType; id: string; depth: number }> = [
          { type: rootType, id: rootId, depth: 0 }
        ];
        const visited = new Set<string>();

        while (queue.length > 0) {
          const current = queue.shift()!;
          const key = `${current.type}:${current.id}`;
          if (visited.has(key)) continue;
          visited.add(key);
          if (current.depth > maxDepth) continue;

          const entity = await fetchEntity(current.type, current.id, token);
          if (!entity) continue;

          nodes.set(key, {
            id: current.id,
            type: current.type,
            label: inferLabel(current.type, entity),
            depth: current.depth
          });

          // Follow derivedFrom backward
          const derivedFrom = entity.derivedFrom as string[] | undefined;
          if (derivedFrom && current.depth < maxDepth) {
            for (const parentId of derivedFrom) {
              edges.push({
                source: current.id,
                target: parentId,
                relation: 'derivedFrom'
              });
              // Infer parent type by ID prefix (mat_/sam_/exp_/pap_/ref_) or fallback heuristic
              const parentType = inferTypeFromId(parentId, current.type);
              queue.push({
                type: parentType,
                id: parentId,
                depth: current.depth + 1
              });
            }
          }

          // Follow generatedBy (R186-2b: sample.generatedBy = experimentId).
          // Must enqueue the target so its node is fetched + added to `nodes`,
          // otherwise D3 forceLink throws "node not found".
          const generatedBy = entity.generatedBy as string | undefined;
          if (generatedBy && current.depth < maxDepth) {
            edges.push({
              source: current.id,
              target: generatedBy,
              relation: 'generatedBy'
            });
            queue.push({
              type: inferTypeFromId(generatedBy, current.type),
              id: generatedBy,
              depth: current.depth + 1
            });
          }
        }

        if (!cancelled) {
          // R186-2b: drop orphan edges (endpoint not resolved) so D3 forceLink
          // never receives a target/source id missing from nodes.
          const nodeIds = new Set(Array.from(nodes.values()).map((n) => n.id));
          const safeEdges = edges.filter(
            (e) => nodeIds.has(e.source as string) && nodeIds.has(e.target as string)
          );
          setData({ nodes: Array.from(nodes.values()), edges: safeEdges });
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'fetch_failed');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [rootType, rootId, maxDepth]);

  return { data, loading, error };
}

function inferTypeFromId(id: string, contextType: EntityType): EntityType {
  if (id.startsWith('mat_')) return 'material';
  if (id.startsWith('sam_')) return 'sample';
  if (id.startsWith('exp_')) return 'experiment';
  if (id.startsWith('pap_')) return 'paper';
  if (id.startsWith('ref_')) return 'reference';
  // UUID format → likely measurement or analysis based on context
  if (contextType === 'analysis') return 'measurement';
  return 'measurement'; // safest default for UUID-style IDs
}
