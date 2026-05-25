'use client';

/**
 * MaterialsCatalog — Hybrid Master-Detail view (R233).
 *
 * Master (left, ~3/10): searchable card grid of materials.
 * Detail (right, ~7/10): selected material — overview + (R233-2) scientific
 * knowledge panel + edit. Selection is held in the URL (?selected=<id>) so it
 * survives reload / back-forward and is shareable.
 *
 * Detail is built from modular <section> blocks so future tabs — 3D crystal
 * viewer, interactive spectral charts, SOP timeline, computer-vision imagery —
 * plug in without restructuring.
 *
 * Responsive: below lg, the master grid is full-width and selecting a card
 * shows the detail (master hidden); a Back control returns to the grid.
 */
import {
  IconArrowLeft,
  IconEdit,
  IconFlask2,
  IconMaximize,
  IconMinimize,
  IconSearch
} from '@tabler/icons-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { LifecycleActions } from '@/components/lifecycle/lifecycle-actions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MaterialKnowledgePanel } from '@/features/samples/components/material-knowledge-panel';
import { useMaterials } from '@/lib/firestore/queries/materials';
import { formatFormula } from '@/lib/utils/format-formula';
import type { Material } from '@/types/materials';
import { MaterialFormSheet } from './material-form-sheet';

export function MaterialsCatalog() {
  const router = useRouter();
  const locale = useLocale();
  const params = useSearchParams();
  const t = useTranslations('materials');
  const tCat = useTranslations('materials.category');
  const { materials, loading } = useMaterials();
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);

  const selectedId = params.get('selected');

  const setSelected = (id: string | null) => {
    const next = new URLSearchParams(params.toString());
    if (id) next.set('selected', id);
    else next.delete('selected');
    router.replace(`/${locale}/dashboard/materials?${next.toString()}`, { scroll: false });
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return materials;
    return materials.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        (m.formula ?? '').toLowerCase().includes(q) ||
        (m.description ?? '').toLowerCase().includes(q)
    );
  }, [materials, query]);

  const selected = materials.find((m) => m.id === selectedId) ?? null;

  if (loading) {
    return <div className='text-muted-foreground py-8 text-center text-sm'>{t('loading')}</div>;
  }

  return (
    <div
      className={
        focused
          ? 'grid grid-cols-1 gap-4'
          : 'grid grid-cols-1 gap-4 lg:grid-cols-[minmax(280px,3fr)_7fr]'
      }
    >
      {/* ── Master ── */}
      <div className={focused ? 'hidden' : selected ? 'hidden lg:block' : 'block'}>
        <div className='relative mb-3'>
          <IconSearch className='text-muted-foreground absolute left-2.5 top-1/2 size-4 -translate-y-1/2' />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('searchPlaceholder')}
            className='pl-8'
            aria-label={t('searchPlaceholder')}
          />
        </div>
        {filtered.length === 0 ? (
          <div className='text-muted-foreground py-12 text-center text-sm'>{t('empty')}</div>
        ) : (
          <ScrollArea className='h-[calc(100vh-220px)] pr-2'>
            <div className='grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-1'>
              {filtered.map((m) => (
                <MaterialCard
                  key={m.id}
                  material={m}
                  active={m.id === selectedId}
                  categoryLabel={tCat(m.category)}
                  onSelect={() => setSelected(m.id)}
                />
              ))}
            </div>
          </ScrollArea>
        )}
      </div>

      {/* ── Detail ── */}
      <div className={selected ? 'block' : 'hidden lg:block'}>
        {selected ? (
          <MaterialDetail
            material={selected}
            categoryLabel={tCat(selected.category)}
            focused={focused}
            onBack={() => setSelected(null)}
            onToggleFocus={() => setFocused((v) => !v)}
          />
        ) : (
          <div className='text-muted-foreground flex h-[calc(100vh-220px)] items-center justify-center rounded-lg border border-dashed text-sm'>
            {t('selectPrompt')}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Master card ───────────────────────────────────────────────────────────────

function MaterialCard({
  material,
  active,
  categoryLabel,
  onSelect
}: {
  material: Material;
  active: boolean;
  categoryLabel: string;
  onSelect: () => void;
}) {
  return (
    <Card
      role='button'
      tabIndex={0}
      aria-label={material.name}
      aria-pressed={active}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
      className={[
        'cursor-pointer p-3 transition-colors',
        'focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-2',
        active ? 'border-primary bg-accent' : 'hover:bg-muted/50'
      ].join(' ')}
    >
      <div className='flex items-start justify-between gap-2'>
        <span className='font-medium leading-tight'>{material.name}</span>
        <Badge variant='secondary' className='shrink-0 text-xs'>
          {categoryLabel}
        </Badge>
      </div>
      {material.formula && (
        <div className='text-muted-foreground mt-1 text-lg font-semibold'>
          {formatFormula(material.formula)}
        </div>
      )}
      {material.description && (
        <p className='text-muted-foreground mt-1 line-clamp-2 text-xs'>{material.description}</p>
      )}
    </Card>
  );
}

// ── Detail (R233-2 — overview + scientific knowledge + edit + focus) ──────────

function MaterialDetail({
  material,
  categoryLabel,
  focused,
  onBack,
  onToggleFocus
}: {
  material: Material;
  categoryLabel: string;
  focused: boolean;
  onBack: () => void;
  onToggleFocus: () => void;
}) {
  const t = useTranslations('materials');
  const hasFormula = Boolean(material.formula && material.formula.trim().length >= 2);

  return (
    <div className='space-y-4'>
      <div className='flex items-center justify-between gap-2'>
        <button
          type='button'
          onClick={onBack}
          className='text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm lg:hidden'
        >
          <IconArrowLeft className='size-4' />
          {t('backToList')}
        </button>
        <div className='ml-auto flex items-center gap-2'>
          <MaterialFormSheet
            materialId={material.id}
            defaultValues={material}
            trigger={
              <Button variant='outline' size='sm'>
                <IconEdit className='mr-1 size-4' />
                {t('form.update')}
              </Button>
            }
          />
          <LifecycleActions
            entity='materials'
            id={material.id}
            status={material.lifecycleStatus ?? 'active'}
            i18nNamespace='materials'
          />
          <Button
            variant='ghost'
            size='icon'
            onClick={onToggleFocus}
            aria-label={focused ? t('exitFocus') : t('focus')}
            className='hidden lg:inline-flex'
          >
            {focused ? <IconMinimize className='size-4' /> : <IconMaximize className='size-4' />}
          </Button>
        </div>
      </div>

      {/* Overview */}
      <section className='rounded-lg border bg-card p-5'>
        <div className='flex items-start justify-between gap-3'>
          <div>
            <h2 className='text-xl font-semibold tracking-tight'>{material.name}</h2>
            {material.formula && (
              <div className='text-muted-foreground mt-1 text-2xl font-bold'>
                {formatFormula(material.formula)}
              </div>
            )}
          </div>
          <Badge variant='secondary'>{categoryLabel}</Badge>
        </div>
        {material.description ? (
          <p className='text-muted-foreground mt-4 text-sm leading-relaxed'>
            {material.description}
          </p>
        ) : (
          <p className='text-muted-foreground mt-4 flex items-center gap-2 text-sm'>
            <IconFlask2 className='size-4' />
            {t('noDescription')}
          </p>
        )}
      </section>

      {/* Scientific knowledge (MaterialProfile by formula). Modular section —
          future 3D viewer / spectral charts / CV imagery plug in alongside. */}
      {hasFormula && (
        <section className='space-y-3'>
          <h3 className='text-sm font-semibold tracking-tight'>{t('scientificData')}</h3>
          <MaterialKnowledgePanel formula={material.formula as string} />
        </section>
      )}
    </div>
  );
}
