/**
 * Projects (Đề tài) — list + create/edit/archive. Linked entities + timeline
 * overview is R265. Visible to tenant members (writers manage; see firestore
 * rules). Lives under the Admin nav group per the IA spec.
 *
 * @phase R264 — Project entity (MVP UI)
 */
import { getTranslations } from 'next-intl/server';
import PageContainer from '@/components/layout/page-container';
import { ProjectList } from '@/features/projects/project-list';

export default async function ProjectsPage() {
  const t = await getTranslations('projects');
  return (
    <PageContainer pageTitle={t('title')} pageDescription={t('subtitle')}>
      <ProjectList />
    </PageContainer>
  );
}
