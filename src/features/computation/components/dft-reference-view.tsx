/**
 * DftReferenceView — docs-layout reference for DFT/QE: a sticky sidebar (four top-
 * level sections with in-section anchors), a content pane that switches by section,
 * and a search box that filters parameters. Foundations show a concept summary
 * with an expandable "deeper" block. @phase R394
 */
'use client';

import { IconChevronRight, IconSearch } from '@tabler/icons-react';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { FOUNDATIONS, DFT_TEXTBOOKS } from '@/features/computation/dft-foundations';
import { DFT_CITATIONS, DFT_REFERENCE } from '@/features/computation/dft-reference-data';
import { WORKFLOW_TOPICS } from '@/features/computation/dft-workflow-data';
import { cn } from '@/lib/utils';

type SectionId = 'foundations' | 'parameters' | 'workflow' | 'bibliography';

function scrollToAnchor(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/**
 * Track which of `ids` is the active section as the user scrolls (scroll-spy).
 * The active one is the topmost section whose top has crossed into a band near
 * the top of the viewport. Re-observes when the id set changes (section switch).
 */
function useScrollSpy(ids: string[]): string | null {
  const key = ids.join('|');
  const [active, setActive] = useState<string | null>(ids[0] ?? null);

  useEffect(() => {
    const els = ids
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null);
    if (els.length === 0) {
      setActive(null);
      return;
    }
    setActive(els[0]!.id);
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .toSorted((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length > 0) setActive(visible[0]!.target.id);
      },
      { rootMargin: '-8% 0px -75% 0px', threshold: 0 }
    );
    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
    // key encodes ids; re-run only when the observed set changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return active;
}

/** One theory concept: summary always visible, deeper block collapsible. */
function FoundationBlock({
  id,
  title,
  summary,
  deeper,
  refs,
  deeperLabel
}: {
  id: string;
  title: string;
  summary: React.ReactNode;
  deeper: React.ReactNode;
  refs: string[];
  deeperLabel: string;
}) {
  return (
    <section id={id} className='scroll-mt-4 border-b py-5 last:border-b-0'>
      <h3 className='mb-2 text-lg font-semibold'>{title}</h3>
      <div className='space-y-2 text-sm leading-relaxed'>{summary}</div>
      <Collapsible className='mt-3'>
        <CollapsibleTrigger className='text-primary flex items-center gap-1 text-sm font-medium'>
          <IconChevronRight className='size-4 transition-transform data-[state=open]:rotate-90' />
          {deeperLabel}
        </CollapsibleTrigger>
        <CollapsibleContent className='mt-2 space-y-2 border-l-2 pl-4 text-sm leading-relaxed'>
          {deeper}
          {refs.length > 0 ? (
            <p className='text-muted-foreground pt-1 text-xs'>{refs.join(' · ')}</p>
          ) : null}
        </CollapsibleContent>
      </Collapsible>
    </section>
  );
}

export function DftReferenceView() {
  const t = useTranslations('computation');
  const [section, setSection] = useState<SectionId>('foundations');
  const [q, setQ] = useState('');

  const needle = q.trim().toLowerCase();

  const filteredParams = useMemo(() => {
    if (!needle) return DFT_REFERENCE;
    return DFT_REFERENCE.map((cat) => ({
      ...cat,
      params: cat.params.filter((p) =>
        `${p.keyword} ${p.name} ${p.description} ${p.note ?? ''}`.toLowerCase().includes(needle)
      )
    })).filter((cat) => cat.params.length > 0);
  }, [needle]);

  // A search jumps to the Parameters section (that's what's searchable).
  const activeSection = needle ? 'parameters' : section;

  const NAV: { id: SectionId; label: string; anchors: { id: string; label: string }[] }[] = [
    {
      id: 'foundations',
      label: t('refSecFoundations'),
      anchors: FOUNDATIONS.map((f) => ({ id: f.id, label: f.title }))
    },
    {
      id: 'parameters',
      label: t('refSecParameters'),
      anchors: DFT_REFERENCE.map((c) => ({ id: `param-${c.id}`, label: c.title }))
    },
    {
      id: 'workflow',
      label: t('refSecWorkflow'),
      anchors: WORKFLOW_TOPICS.map((w) => ({ id: w.id, label: w.title }))
    },
    { id: 'bibliography', label: t('refSecBibliography'), anchors: [] }
  ];

  const activeAnchorIds = NAV.find((s) => s.id === activeSection)?.anchors.map((a) => a.id) ?? [];
  const activeAnchor = useScrollSpy(activeAnchorIds);

  return (
    <div className='space-y-4'>
      <div>
        <h1 className='text-xl font-semibold'>{t('referenceTitle')}</h1>
        <p className='text-muted-foreground mt-1 text-sm'>{t('referenceIntro')}</p>
      </div>

      <div className='relative max-w-md'>
        <IconSearch className='text-muted-foreground absolute left-3 top-1/2 size-4 -translate-y-1/2' />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t('referenceSearch')}
          className='pl-9'
        />
      </div>

      <div className='grid gap-6 lg:grid-cols-[220px_1fr]'>
        {/* Sidebar */}
        <nav className='top-4 h-max lg:sticky'>
          <ul className='space-y-1 text-sm'>
            {NAV.map((s) => (
              <li key={s.id}>
                <button
                  type='button'
                  onClick={() => {
                    setQ('');
                    setSection(s.id);
                  }}
                  className={cn(
                    'w-full rounded px-2 py-1.5 text-left font-medium transition-colors',
                    activeSection === s.id
                      ? 'bg-muted text-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {s.label}
                </button>
                {activeSection === s.id && s.anchors.length > 0 ? (
                  <ul className='mt-1 space-y-0.5 border-l pl-3'>
                    {s.anchors.map((a) => (
                      <li key={a.id}>
                        <button
                          type='button'
                          onClick={() => scrollToAnchor(a.id)}
                          className={cn(
                            'block py-0.5 text-left text-xs transition-colors',
                            a.id === activeAnchor
                              ? 'text-foreground font-medium'
                              : 'text-muted-foreground hover:text-foreground'
                          )}
                        >
                          {a.label}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
        </nav>

        {/* Content */}
        <div className='min-w-0'>
          {activeSection === 'foundations' ? (
            <div className='rounded-lg border p-5'>
              {FOUNDATIONS.map((f) => (
                <FoundationBlock key={f.id} {...f} deeperLabel={t('refDeeper')} />
              ))}
            </div>
          ) : null}

          {activeSection === 'parameters' ? (
            <div className='space-y-4'>
              {filteredParams.length === 0 ? (
                <p className='text-muted-foreground py-8 text-center text-sm'>
                  {t('referenceNoMatch')}
                </p>
              ) : (
                filteredParams.map((cat) => (
                  <section
                    key={cat.id}
                    id={`param-${cat.id}`}
                    className='scroll-mt-4 rounded-lg border p-4'
                  >
                    <div className='mb-2 flex flex-wrap items-baseline gap-2'>
                      <h2 className='text-lg font-semibold'>{cat.title}</h2>
                      {cat.namelist ? (
                        <code className='text-muted-foreground font-mono text-xs'>
                          {cat.namelist}
                        </code>
                      ) : null}
                    </div>
                    <p className='text-muted-foreground mb-2 text-sm'>{cat.intro}</p>
                    <div>
                      {cat.params.map((p) => (
                        <div key={p.keyword} className='border-b py-3 last:border-b-0'>
                          <div className='flex flex-wrap items-baseline gap-2'>
                            <code className='bg-muted rounded px-1.5 py-0.5 font-mono text-xs'>
                              {p.keyword}
                            </code>
                            <span className='text-sm font-medium'>{p.name}</span>
                            {p.unit ? (
                              <span className='text-muted-foreground text-xs'>[{p.unit}]</span>
                            ) : null}
                          </div>
                          <p className='text-muted-foreground mt-1 text-sm leading-relaxed'>
                            {p.description}
                          </p>
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
                      ))}
                    </div>
                  </section>
                ))
              )}
            </div>
          ) : null}

          {activeSection === 'workflow' ? (
            <div className='rounded-lg border p-5'>
              {WORKFLOW_TOPICS.map((w) => (
                <section key={w.id} id={w.id} className='scroll-mt-4 border-b py-5 last:border-b-0'>
                  <h3 className='mb-2 text-lg font-semibold'>{w.title}</h3>
                  <div className='space-y-2 text-sm leading-relaxed'>{w.body}</div>
                </section>
              ))}
            </div>
          ) : null}

          {activeSection === 'bibliography' ? (
            <div className='space-y-4'>
              <section className='rounded-lg border p-4'>
                <h2 className='mb-3 text-lg font-semibold'>{t('refTextbooks')}</h2>
                <ul className='ml-5 list-disc space-y-1.5 text-sm'>
                  {DFT_TEXTBOOKS.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              </section>
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
          ) : null}
        </div>
      </div>
    </div>
  );
}
