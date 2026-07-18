'use client';

/**
 * Project detail / overview. Shows the project's details + linked entities.
 * Resolves the project client-side from useProjects (small per-tenant list).
 *
 * @phase R265 — Project overview
 */
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import PageContainer from '@/components/layout/page-container';
import { ProjectOverview } from '@/features/projects/project-overview';
import { useProjects } from '@/features/projects/use-projects';
import { ListSkeleton } from '@/components/ui/list-skeleton';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { IconAlertTriangle } from '@tabler/icons-react';

export default function ProjectDetailPage() {
  const t = useTranslations('projects');
  const params = useParams();
  const id = String(params.id ?? '');
  const { projects, isLoading, isError, refetch } = useProjects();
  const project = projects.find((p) => p.id === id);

  return (
    <PageContainer
      pageTitle={project?.name ?? t('title')}
      pageDescription={project ? t('overviewSubtitle') : ''}
    >
      {isLoading ? (
        <ListSkeleton rows={4} />
      ) : isError ? (
        /* R574: error is a distinct state, resolved before not-found. A failed
           query used to fall through to the not-found block below, which tells
           the user the project was deleted when the load merely broke. Muted
           triangle, not red — a load failure is not a hazard (states §2.3). */
        <div className='flex min-h-[400px] flex-col items-center justify-center gap-3 py-16 text-center'>
          <IconAlertTriangle className='text-muted-foreground size-8' aria-hidden='true' />
          <div>
            <p className='text-sm font-medium'>{t('loadError')}</p>
            <p className='mt-1 text-sm text-muted-foreground'>{t('loadErrorHint')}</p>
          </div>
          <div className='flex gap-2'>
            <Button size='sm' onClick={() => refetch()}>
              {t('retry')}
            </Button>
            <Button asChild size='sm' variant='outline'>
              <Link href='/dashboard/projects'>{t('backToList')}</Link>
            </Button>
          </div>
        </div>
      ) : project ? (
        <ProjectOverview project={project} />
      ) : (
        <div className='flex flex-col items-center justify-center py-16 text-center'>
          <p className='text-sm font-medium'>{t('notFound')}</p>
          <p className='mt-1 text-sm text-muted-foreground'>{t('notFoundHint')}</p>
        </div>
      )}
    </PageContainer>
  );
}
