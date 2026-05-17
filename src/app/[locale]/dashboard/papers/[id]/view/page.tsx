import { getTranslations } from 'next-intl/server';
import { PdfViewerIframe } from '@/features/papers/components/pdf-viewer-iframe';

/**
 * PDF viewer page (R178-1b-1 V1: browser-native iframe).
 *
 * Layout uses full viewport minus dashboard chrome — no PageContainer wrapper
 * because PDF reading benefits from maximum vertical space.
 *
 * @phase R178-1b-1
 */
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const t = await getTranslations('papers');
  const { id } = await params;
  return { title: `${t('viewPageTitle')} — ${id.slice(0, 8)}` };
}

export default async function PaperViewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PdfViewerIframe paperId={id} />;
}
