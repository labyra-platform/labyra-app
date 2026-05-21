'use client';

import { getFirebaseAuth } from '@/lib/firebase/client';
import { useTranslations } from 'next-intl';
/**
 * LineageExplorer — pick entity → render LineageGraph.
 *
 * Fetches entities of selected type from /api/{collection}, lets user pick
 * one, displays graph centered on that entity.
 *
 * @phase R165-phase-7-lineage-page
 */
import { useEffect, useState } from 'react';
import { LineageGraph } from '@/components/lineage/lineage-graph';
import type { EntityType } from '@/components/lineage/use-lineage-data';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';

const ENTITY_TYPES: EntityType[] = [
  'material',
  'sample',
  'experiment',
  'measurement',
  'reference',
  'paper'
];

const COLLECTION_BY_TYPE: Record<EntityType, string> = {
  material: 'materials',
  sample: 'samples',
  experiment: 'experiments',
  measurement: 'measurements',
  analysis: 'analyses',
  reference: 'references',
  paper: 'papers'
};

interface EntityOption {
  id: string;
  label: string;
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
    case 'reference':
      return (data.cardNumber as string) ?? (data.phaseName as string) ?? (data.id as string);
    case 'paper':
      return (data.title as string) ?? (data.id as string);
    default:
      return (data.id as string) ?? '?';
  }
}

export function LineageExplorer() {
  const t = useTranslations('lineage.explorer');
  const [entityType, setEntityType] = useState<EntityType>('material');
  const [entities, setEntities] = useState<EntityOption[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loadingList, setLoadingList] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch list of entities when type changes
  useEffect(() => {
    let cancelled = false;
    setLoadingList(true);
    setError(null);
    setEntities([]);
    setSelectedId(null);
    (async () => {
      try {
        const user = getFirebaseAuth().currentUser;
        if (!user) throw new Error('not_authenticated');
        const token = await user.getIdToken();
        const res = await fetch(`/api/${COLLECTION_BY_TYPE[entityType]}`, {
          headers: { authorization: `Bearer ${token}` }
        });
        if (!res.ok) throw new Error(await res.text());
        const data = (await res.json()) as {
          items?: Record<string, unknown>[];
        };
        const items = data.items ?? [];
        if (!cancelled) {
          const options = items
            .filter((d) => (d as { lifecycleStatus?: string }).lifecycleStatus !== 'retracted')
            .map((d) => ({
              id: d.id as string,
              label: inferLabel(entityType, d)
            }))
            .slice(0, 200); // cap for performance
          setEntities(options);
          if (options.length > 0) setSelectedId(options[0].id);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'fetch_failed');
        }
      } finally {
        if (!cancelled) setLoadingList(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [entityType]);

  return (
    <div className='space-y-6'>
      <div className='grid gap-4 md:grid-cols-2'>
        <div className='space-y-2'>
          <Label htmlFor='entity-type'>{t('entityType')}</Label>
          <Select value={entityType} onValueChange={(v) => setEntityType(v as EntityType)}>
            <SelectTrigger id='entity-type'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ENTITY_TYPES.map((type) => (
                <SelectItem key={type} value={type}>
                  {t(`types.${type}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className='space-y-2'>
          <Label htmlFor='entity-id'>{t('entity')}</Label>
          <Select
            value={selectedId ?? ''}
            onValueChange={setSelectedId}
            disabled={loadingList || entities.length === 0}
          >
            <SelectTrigger id='entity-id'>
              <SelectValue
                placeholder={
                  loadingList
                    ? t('loading')
                    : entities.length === 0
                      ? t('noEntities')
                      : t('selectPlaceholder')
                }
              />
            </SelectTrigger>
            <SelectContent>
              {entities.map((e) => (
                <SelectItem key={e.id} value={e.id}>
                  {e.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {error && (
        <div className='rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive'>
          {t('error', { msg: error })}
        </div>
      )}

      {selectedId && !loadingList && (
        <div className='space-y-2'>
          <h3 className='text-sm font-medium text-muted-foreground'>{t('graphTitle')}</h3>
          <LineageGraph
            rootType={entityType}
            rootId={selectedId}
            maxDepth={3}
            width={900}
            height={600}
          />
        </div>
      )}

      {!loadingList && entities.length === 0 && !error && (
        <div className='rounded-md border bg-muted/30 p-6 text-center text-sm text-muted-foreground'>
          {t('emptyState')}
        </div>
      )}
    </div>
  );
}
