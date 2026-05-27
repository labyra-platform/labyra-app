import { getTranslations } from 'next-intl/server';
import { PaperReadView } from '@/features/papers/components/paper-read-view';

/**
 * Paper page — R224: split reading view (PDF + collapsible metadata panel),
 * replacing the old separate detail page. The old /view route still works as a
 * standalone full-PDF fallback.
 */
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const t = await getTranslations('papers');
  const { id } = await params;
  return { title: `${t('detailPageTitle')} — ${id.slice(0, 8)}` };
}

export default async function PaperPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PaperReadView paperId={id} />;
}
