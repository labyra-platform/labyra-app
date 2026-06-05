/**
 * Protocol Templates (Quy trình mẫu) — reusable node-graph procedures. Replaces
 * the previous stub. Lives under Research / Experiments per the IA spec.
 *
 * @phase R270b — Protocol Template UI
 */
import { getTranslations } from 'next-intl/server';
import PageContainer from '@/components/layout/page-container';
import { ProtocolTemplateList } from '@/features/protocol/protocol-template-list';

export default async function ProtocolTemplatesPage() {
  const t = await getTranslations('protocolTemplates');
  return (
    <PageContainer pageTitle={t('title')} pageDescription={t('subtitle')}>
      <ProtocolTemplateList />
    </PageContainer>
  );
}
