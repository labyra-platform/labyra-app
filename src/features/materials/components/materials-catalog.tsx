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
import { IconArrowLeft, IconFlask2, IconSearch } from '@tabler/icons-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useMaterials } from '@/lib/firestore/queries/materials';
import { formatFormula } from '@/lib/utils/format-formula';
import type { Material } from '@/types/materials';

export function MaterialsCatalog() {
  const router = useRouter();
  const locale = useLocale();
  const params = useSearchParams();
  const t = useTranslations('materials');
  const tCat = useTranslations('materials.category');
  const { materials, loading } = useMaterials();
  const [query, setQuery] = useState('');

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
    <div className='grid grid-cols-1 gap-4 lg:grid-cols-[minmax(280px,3fr)_7fr]'>
      {/* ── Master ── */}
      <div className={selected ? 'hidden lg:block' : 'block'}>
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
            onBack={() => setSelected(null)}
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

// ── Detail (R233-1 placeholder — overview only; R233-2 adds knowledge + edit) ──

function MaterialDetail({
  material,
  categoryLabel,
  onBack
}: {
  material: Material;
  categoryLabel: string;
  onBack: () => void;
}) {
  const t = useTranslations('materials');
  return (
    <div className='space-y-4'>
      <button
        type='button'
        onClick={onBack}
        className='text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm lg:hidden'
      >
        <IconArrowLeft className='size-4' />
        {t('backToList')}
      </button>

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
    </div>
  );
}
