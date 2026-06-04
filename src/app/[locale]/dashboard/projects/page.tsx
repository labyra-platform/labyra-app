import { getTranslations } from 'next-intl/server';
import PageContainer from '@/components/layout/page-container';

export default async function ProjectsPage() {
  const t = await getTranslations('nav');

  return (
    <PageContainer pageTitle={t('projects')} pageDescription='Coming soon'>
      <div className='text-muted-foreground py-12 text-center text-sm'>
        Research projects (topics) — coming soon.
      </div>
    </PageContainer>
  );
}
