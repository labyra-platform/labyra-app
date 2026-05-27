import { getTranslations } from 'next-intl/server';
import { PaperTabSync } from '@/features/papers/components/paper-tab-sync';

/**
 * Paper page — R227: thin sync page. The actual reader is rendered by the papers
 * layout's PapersWorkspace (kept mounted across navigation for instant tab
 * switching). This page only needs to register/activate the tab for this id so
 * the workspace shows it. Deep-links and reloads work because the sync runs on
 * mount.
 */
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const t = await getTranslations('papers');
  const { id } = await params;
  return { title: `${t('detailPageTitle')} — ${id.slice(0, 8)}` };
}

export default async function PaperPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PaperTabSync paperId={id} />;
}
