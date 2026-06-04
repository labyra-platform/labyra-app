'use client';

/**
 * Project overview (Benchling-Studies style): the project's details plus the
 * entities linked to it. Collections + manuscripts are filtered client-side
 * from the existing per-user hooks (no extra index). Experiments appear once a
 * tenant-wide read exists (R265c). Entities are linked via projectId (R265c
 * wires the picker into their forms) — until then these sections are empty.
 *
 * @phase R265 — Project overview
 */
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { useManuscripts } from '@/features/manuscript/use-manuscripts';
import { useCollections } from '@/features/papers/collections/use-collections';
import type { Project } from '@/types/project';

function LinkedSection({
  title,
  count,
  empty,
  children
}: {
  title: string;
  count: number;
  empty: string;
  children: ReactNode;
}) {
  return (
    <section className='space-y-2'>
      <h3 className='flex items-center gap-2 text-sm font-medium'>
        {title}
        <span className='rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground'>
          {count}
        </span>
      </h3>
      {count === 0 ? (
        <p className='rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground'>
          {empty}
        </p>
      ) : (
        <ul className='divide-y rounded-lg border'>{children}</ul>
      )}
    </section>
  );
}

export function ProjectOverview({ project }: { project: Project }) {
  const t = useTranslations('projects');
  const { collections } = useCollections();
  const { manuscripts } = useManuscripts();

  const linkedCollections = collections.filter((c) => c.projectId === project.id);
  const linkedManuscripts = manuscripts.filter((m) => m.projectId === project.id);

  return (
    <div className='space-y-6'>
      <section className='space-y-3 rounded-lg border p-4'>
        <div className='flex flex-wrap items-center gap-2'>
          <Badge variant='outline'>{t(`types.${project.type}`)}</Badge>
          <Badge variant={project.status === 'archived' ? 'outline' : 'secondary'}>
            {t(`statuses.${project.status}`)}
          </Badge>
          {project.grantLevel && (
            <Badge variant='outline'>{t(`grantLevels.${project.grantLevel}`)}</Badge>
          )}
        </div>
        {project.description && (
          <p className='text-sm text-muted-foreground'>{project.description}</p>
        )}
        {(project.startDate || project.dueDate || project.grantCode) && (
          <dl className='flex flex-wrap gap-x-8 gap-y-1 text-sm'>
            {project.startDate && (
              <div>
                <dt className='text-xs text-muted-foreground'>{t('startDate')}</dt>
                <dd>{project.startDate}</dd>
              </div>
            )}
            {project.dueDate && (
              <div>
                <dt className='text-xs text-muted-foreground'>{t('dueDate')}</dt>
                <dd>{project.dueDate}</dd>
              </div>
            )}
            {project.grantCode && (
              <div>
                <dt className='text-xs text-muted-foreground'>{t('grantCode')}</dt>
                <dd>{project.grantCode}</dd>
              </div>
            )}
          </dl>
        )}
      </section>

      <LinkedSection
        title={t('linkedCollections')}
        count={linkedCollections.length}
        empty={t('noLinked')}
      >
        {linkedCollections.map((c) => (
          <li key={c.id} className='flex items-center justify-between gap-3 px-4 py-2.5 text-sm'>
            <span className='truncate'>{c.name}</span>
            <span className='shrink-0 text-xs text-muted-foreground'>
              {t('paperCount', { count: c.paperIds.length })}
            </span>
          </li>
        ))}
      </LinkedSection>

      <LinkedSection
        title={t('linkedManuscripts')}
        count={linkedManuscripts.length}
        empty={t('noLinked')}
      >
        {linkedManuscripts.map((m) => (
          <li key={m.id} className='flex items-center justify-between gap-3 px-4 py-2.5 text-sm'>
            <span className='truncate'>{m.title}</span>
            <Badge variant='secondary' className='shrink-0'>
              {m.status}
            </Badge>
          </li>
        ))}
      </LinkedSection>
    </div>
  );
}
