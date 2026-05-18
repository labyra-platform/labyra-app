import { getTranslations } from 'next-intl/server';
import { PdfViewer } from '@/features/papers/components/pdf-viewer';

/**
 * PDF viewer page (R179-7b: react-pdf v10 custom toolbar).
 * @r179-7-applied
 *
 * Hides InfoSidebar via dashboard layout's pathname check (URL contains /view).
 */

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const t = await getTranslations('papers');
  const { id } = await params;
  return { title: `${t('viewPageTitle')} — ${id.slice(0, 8)}` };
}

export default async function PaperViewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PdfViewer paperId={id} />;
}
