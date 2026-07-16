'use client';

/**
 * Projects card — the mockup's row-two slot beside attention and members.
 *
 * The dashboard question about a project is not "what exists" (the Projects
 * page answers that) but **which one needs me next**. So this ranks by due
 * date, soonest first, and drops the states that cannot need anything:
 * `completed` and `archived` are finished, and a finished project on a "what's
 * happening" surface is noise wearing a row.
 *
 * A project without a due date sorts last rather than first. Absent is not
 * urgent — and `undefined` compared with a date is exactly the sort of silent
 * NaN that puts the wrong project at the top of a list someone trusts.
 *
 * @phase R533 — dashboard regrid
 */
import { IconFolders } from '@tabler/icons-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { Panel, PanelEmpty, PanelList, PanelRow } from '@/components/ui-extra/panel';
import { Skeleton } from '@/components/ui/skeleton';
import { useProjects } from '@/features/projects/use-projects';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import type { Project, ProjectStatus } from '@/types/project';

const LIVE: ReadonlySet<ProjectStatus> = new Set(['planning', 'active', 'writing']);

/** Later stages read heavier — a project being written is closer to needing you. */
const STATUS_STYLE: Record<string, string> = {
  writing: 'text-foreground font-medium',
  active: 'text-foreground',
  planning: 'text-muted-foreground'
};

function dueRank(p: Project): number {
  return p.dueDate ? Date.parse(p.dueDate) : Number.POSITIVE_INFINITY;
}

export function ProjectsCard() {
  const t = useTranslations('dashboard');
  const tStatus = useTranslations('projects.statuses');
  const format = useFormatter();
  const { projects, isLoading } = useProjects();

  const live = useMemo(
    () =>
      projects
        .filter((p) => LIVE.has(p.status))
        .toSorted((a, b) => dueRank(a) - dueRank(b) || a.name.localeCompare(b.name)),
    [projects]
  );

  return (
    <Panel
      icon={IconFolders}
      title={t('projects.title')}
      action={
        live.length > 0 ? (
          <span className='text-muted-foreground text-meta tabular-nums'>{live.length}</span>
        ) : undefined
      }
    >
      <div className='lb-viewport flex h-[var(--panel-viewport)] flex-col overflow-y-auto'>
        {isLoading ? (
          <div className='space-y-2'>
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className='h-10 w-full' />
            ))}
          </div>
        ) : live.length === 0 ? (
          <PanelEmpty title={t('projects.emptyTitle')} description={t('projects.empty')} />
        ) : (
          <PanelList>
            {live.map((p) => (
              <PanelRow key={p.id}>
                <Link
                  href={`/dashboard/projects/${p.id}`}
                  className='text-body min-w-0 flex-1 truncate hover:underline'
                >
                  {p.name}
                </Link>
                {p.dueDate && (
                  <span className='text-muted-foreground text-meta shrink-0 tabular-nums'>
                    {format.dateTime(new Date(p.dueDate), { day: '2-digit', month: '2-digit' })}
                  </span>
                )}
                <span className={cn('text-meta shrink-0', STATUS_STYLE[p.status] ?? '')}>
                  {tStatus(p.status)}
                </span>
              </PanelRow>
            ))}
          </PanelList>
        )}
      </div>
    </Panel>
  );
}
