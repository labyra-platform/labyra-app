import { getTranslations } from 'next-intl/server';
import { PaperTabSync } from '@/features/papers/components/paper-tab-sync';

/**
 * Legacy /view route — R227: the split reader (workspace) now provides the PDF
 * view, so this route just syncs/activates the tab like [id]. Kept so old links
 * to /papers/[id]/view still land on the right paper. The workspace renders the
 * reader; this page renders nothing.
 */
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const t = await getTranslations('papers');
  const { id } = await params;
  return { title: `${t('detailPageTitle')} — ${id.slice(0, 8)}` };
}

export default async function PaperViewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PaperTabSync paperId={id} />;
}
