/**
 * ProjectsView — manage DFT projects: create a project (name + created date),
 * import structures from the shared crystal-structure store, and jump to compose
 * for a given structure (carrying project + structure context). @phase R376
 */
'use client';

import {
  IconFolder,
  IconFolderPlus,
  IconLoader2,
  IconPlus,
  IconTool,
  IconX,
  IconChevronDown,
  IconChevronRight
} from '@tabler/icons-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Link } from '@/i18n/navigation';
import type { DftProject } from '@/types/dft-project';
import { formatFormula } from '@/lib/utils/format-formula';

interface StructureLite {
  id: string;
  name: string;
  formula?: string;
  mpId?: string;
}

function fmtDate(ms: number | null): string {
  if (ms == null) return '—';
  return new Date(ms).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

/** Format a structure label: subscript the chemical-formula digits, and in the
 * space-group symbol convert only screw-axis notation (P6_3 → P6₃) — Hermann-
 * Mauguin rotation orders like the 6 in "P6/mmm" stay full size. */
function prettyLabel(text: string): string {
  // Split off a trailing "(space group …)" so formula subscripting doesn't touch it.
  return text.replace(/^([^(]*)(\(.*)?$/, (_m, formulaPart: string, rest?: string) => {
    const formula = formatFormula(formulaPart);
    if (!rest) return formula;
    // In the space-group / paren part, only underscore-digits are subscripts.
    const sg = rest.replace(/_([0-9]+)/g, (_x, d: string) =>
      d
        .split('')
        .map((c: string) => '₀₁₂₃₄₅₆₇₈₉'[Number(c)] ?? c)
        .join('')
    );
    return formula + sg;
  });
}
const label = (s: StructureLite) => prettyLabel(s.mpId ? `${s.name} · ${s.mpId}` : s.name);

export function ProjectsView({ structures }: { structures: StructureLite[] }) {
  const t = useTranslations('computation');
  const [projects, setProjects] = useState<DftProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = async () => {
    try {
      const res = await fetch('/api/dft/projects');
      const data = (await res.json()) as { projects?: DftProject[] };
      setProjects(data.projects ?? []);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
  }, []);

  const create = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch('/api/dft/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim() })
      });
      if (res.ok) {
        setNewName('');
        await load();
      }
    } finally {
      setCreating(false);
    }
  };

  const toggleStructure = async (projectId: string, structureId: string, attach: boolean) => {
    await fetch('/api/dft/projects/structures', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, structureId, attach })
    });
    await load();
  };

  const byId = new Map(structures.map((s) => [s.id, s]));

  return (
    <div className='space-y-4'>
      <div className='flex items-end gap-2'>
        <div className='flex-1 space-y-1'>
          <label className='text-sm font-medium'>{t('projectNewLabel')}</label>
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void create();
            }}
            placeholder={t('projectNewPlaceholder')}
            maxLength={80}
          />
        </div>
        <Button onClick={() => void create()} disabled={creating || !newName.trim()}>
          {creating ? (
            <IconLoader2 className='mr-1 size-4 animate-spin' />
          ) : (
            <IconFolderPlus className='mr-1 size-4' />
          )}
          {t('projectCreate')}
        </Button>
      </div>

      {loading ? (
        <div className='text-muted-foreground py-8 text-center text-sm'>
          <IconLoader2 className='mx-auto size-5 animate-spin' />
        </div>
      ) : projects.length === 0 ? (
        <p className='text-muted-foreground py-8 text-center text-sm'>{t('projectEmpty')}</p>
      ) : (
        <div className='space-y-3'>
          {projects.map((p) => {
            const open = expanded === p.id;
            const attached = p.structureIds
              .map((id) => byId.get(id))
              .filter(Boolean) as StructureLite[];
            const available = structures.filter((s) => !p.structureIds.includes(s.id));
            return (
              <div key={p.id} className='rounded-lg border'>
                <button
                  type='button'
                  onClick={() => setExpanded(open ? null : p.id)}
                  className='hover:bg-muted/40 flex w-full items-center gap-2 p-3 text-left transition-colors'
                  aria-expanded={open}
                >
                  {open ? (
                    <IconChevronDown className='text-muted-foreground size-4 shrink-0' />
                  ) : (
                    <IconChevronRight className='text-muted-foreground size-4 shrink-0' />
                  )}
                  <IconFolder className='text-muted-foreground size-4 shrink-0' />
                  <span className='font-medium'>{prettyLabel(p.name)}</span>
                  <span className='text-muted-foreground text-xs'>
                    {t('projectCreatedOn', { date: fmtDate(p.createdAt) })}
                  </span>
                  <span className='text-muted-foreground text-xs'>
                    · {t('projectStructureCount', { n: String(attached.length) })}
                  </span>
                </button>

                {open ? (
                  <div className='space-y-3 border-t p-3'>
                    {attached.length > 0 ? (
                      <div className='space-y-1.5'>
                        {attached.map((s) => (
                          <div
                            key={s.id}
                            className='bg-muted/30 flex items-center justify-between rounded px-2 py-1.5'
                          >
                            <span className='text-sm'>{label(s)}</span>
                            <div className='flex items-center gap-1'>
                              <Button asChild size='sm' variant='outline'>
                                <Link
                                  href={{
                                    pathname: '/dashboard/computation/compose',
                                    query: { project: p.id, structure: s.id }
                                  }}
                                >
                                  <IconTool className='mr-1 size-3.5' />
                                  {t('projectCompose')}
                                </Link>
                              </Button>
                              <Button
                                size='icon'
                                variant='ghost'
                                className='size-7'
                                onClick={() => void toggleStructure(p.id, s.id, false)}
                                aria-label={t('projectRemoveStructure')}
                              >
                                <IconX className='size-4' />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className='text-muted-foreground text-xs'>{t('projectNoStructures')}</p>
                    )}

                    <div className='border-t pt-2'>
                      <p className='text-muted-foreground mb-1.5 text-xs font-medium'>
                        {t('projectAddFromStore')}
                      </p>
                      {structures.length === 0 ? (
                        <Button asChild size='sm' variant='outline'>
                          <Link href='/dashboard/structures'>
                            <IconPlus className='mr-1 size-3.5' />
                            {t('projectImportFirst')}
                          </Link>
                        </Button>
                      ) : available.length === 0 ? (
                        <p className='text-muted-foreground text-xs'>{t('projectAllAdded')}</p>
                      ) : (
                        <div className='flex flex-wrap gap-1.5'>
                          {available.map((s) => (
                            <Button
                              key={s.id}
                              size='sm'
                              variant='outline'
                              onClick={() => void toggleStructure(p.id, s.id, true)}
                            >
                              <IconPlus className='mr-1 size-3.5' />
                              {label(s)}
                            </Button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
