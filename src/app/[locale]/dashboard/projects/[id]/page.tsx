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

export default function ProjectDetailPage() {
  const t = useTranslations('projects');
  const params = useParams();
  const id = String(params.id ?? '');
  const { projects, isLoading } = useProjects();
  const project = projects.find((p) => p.id === id);

  return (
    <PageContainer
      pageTitle={project?.name ?? t('title')}
      pageDescription={project ? t('overviewSubtitle') : ''}
    >
      {isLoading ? (
        <ListSkeleton rows={4} />
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
