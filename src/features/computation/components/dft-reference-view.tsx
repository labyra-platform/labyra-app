/**
 * DftReferenceView — renders the DFT parameter reference: a search box that
 * filters across every parameter, category sections (grouped by namelist/topic),
 * and the primary method citations with DOI links. @phase R393
 */
'use client';

import { IconSearch } from '@tabler/icons-react';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import {
  DFT_CITATIONS,
  DFT_REFERENCE,
  type DftParam
} from '@/features/computation/dft-reference-data';

function ParamRow({ p }: { p: DftParam }) {
  return (
    <div className='border-b py-3 last:border-b-0'>
      <div className='flex flex-wrap items-baseline gap-2'>
        <code className='bg-muted rounded px-1.5 py-0.5 font-mono text-xs'>{p.keyword}</code>
        <span className='text-sm font-medium'>{p.name}</span>
        {p.unit ? <span className='text-muted-foreground text-xs'>[{p.unit}]</span> : null}
      </div>
      <p className='text-muted-foreground mt-1 text-sm leading-relaxed'>{p.description}</p>
      <div className='mt-1.5 flex flex-wrap gap-x-6 gap-y-1 text-xs'>
        {p.typical ? (
          <span>
            <span className='text-muted-foreground'>Typical: </span>
            <span className='font-mono'>{p.typical}</span>
          </span>
        ) : null}
        {p.note ? <span className='text-amber-600'>⚠ {p.note}</span> : null}
      </div>
    </div>
  );
}

export function DftReferenceView() {
  const t = useTranslations('computation');
  const [q, setQ] = useState('');

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return DFT_REFERENCE;
    return DFT_REFERENCE.map((cat) => ({
      ...cat,
      params: cat.params.filter((p) =>
        `${p.keyword} ${p.name} ${p.description} ${p.note ?? ''}`.toLowerCase().includes(needle)
      )
    })).filter((cat) => cat.params.length > 0);
  }, [q]);

  return (
    <div className='mx-auto max-w-4xl space-y-6'>
      <div>
        <h1 className='text-xl font-semibold'>{t('referenceTitle')}</h1>
        <p className='text-muted-foreground mt-1 text-sm'>{t('referenceIntro')}</p>
      </div>

      <div className='relative'>
        <IconSearch className='text-muted-foreground absolute left-3 top-1/2 size-4 -translate-y-1/2' />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t('referenceSearch')}
          className='pl-9'
        />
      </div>

      {filtered.length === 0 ? (
        <p className='text-muted-foreground py-8 text-center text-sm'>{t('referenceNoMatch')}</p>
      ) : (
        filtered.map((cat) => (
          <section key={cat.id} className='rounded-lg border p-4'>
            <div className='mb-2 flex flex-wrap items-baseline gap-2'>
              <h2 className='text-lg font-semibold'>{cat.title}</h2>
              {cat.namelist ? (
                <code className='text-muted-foreground font-mono text-xs'>{cat.namelist}</code>
              ) : null}
            </div>
            <p className='text-muted-foreground mb-2 text-sm'>{cat.intro}</p>
            <div>
              {cat.params.map((p) => (
                <ParamRow key={p.keyword} p={p} />
              ))}
            </div>
          </section>
        ))
      )}

      <section className='rounded-lg border p-4'>
        <h2 className='mb-3 text-lg font-semibold'>{t('referenceCitations')}</h2>
        <ul className='space-y-2'>
          {DFT_CITATIONS.map((c) => (
            <li key={c.label} className='text-sm'>
              <span className='text-muted-foreground'>{c.topic}: </span>
              {c.label}
              {c.doi ? (
                <>
                  {' · '}
                  <a
                    href={`https://doi.org/${c.doi}`}
                    target='_blank'
                    rel='noopener noreferrer'
                    className='text-primary font-mono text-xs underline-offset-2 hover:underline'
                  >
                    {c.doi}
                  </a>
                </>
              ) : null}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
