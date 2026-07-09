/**
 * Protocol instance comparison — diff two experiments' runs of the same template.
 * Replaces the earlier stub.
 *
 * @phase R274 — Protocol Instance (diff)
 */
import { getTranslations } from 'next-intl/server';

import PageContainer from '@/components/layout/page-container';
import { ProtocolInstanceDiff } from '@/features/protocol/protocol-instance-diff';

export default async function ExperimentProtocolPage() {
  const t = await getTranslations('protocolTemplates');
  return (
    <PageContainer pageTitle={t('diffTitle')} pageDescription={t('diffSubtitle')}>
      <ProtocolInstanceDiff />
    </PageContainer>
  );
}
