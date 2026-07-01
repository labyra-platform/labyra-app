/**
 * Crystal-structures library page — a reusable bank of computation-ready cells
 * (Mat3ra-style), imported from CIF / POSCAR / Materials Project. Server
 * Component: lists the tenant's structures and projects them to table rows.
 *
 * Path: /[locale]/dashboard/structures
 *
 * @phase R318-crystal-structures
 */
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import PageContainer from '@/components/layout/page-container';
import { ComputationTabs } from '@/features/computation/components/computation-tabs';
import { ImportStructureDialog } from '@/features/crystal-structures/components/import-structure-dialog';
import { StructuresTable } from '@/features/crystal-structures/components/structures-table';
import { toStructureRow } from '@/features/crystal-structures/structure-row';
import { getCurrentTenantId } from '@/lib/auth/server';
import { listCrystalStructures } from '@/lib/firebase/crystal-structures/service';

export const dynamic = 'force-dynamic';

export default async function StructuresPage() {
  const t = await getTranslations('structures');
  const tenantId = await getCurrentTenantId();
  if (!tenantId) notFound();
  const structures = await listCrystalStructures(tenantId);
  const rows = structures.map(toStructureRow);

  return (
    <PageContainer>
      <ComputationTabs rightSlot={<ImportStructureDialog />} />
      {rows.length === 0 ? (
        <div className='text-muted-foreground py-12 text-center text-sm'>{t('empty')}</div>
      ) : (
        <StructuresTable rows={rows} />
      )}
    </PageContainer>
  );
}
