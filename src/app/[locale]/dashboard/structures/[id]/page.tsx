/**
 * Structure detail page — metadata header + interactive 3D viewer (Three.js) with
 * CIF/POSCAR export. Reached by clicking a structure in the library.
 *
 * Path: /[locale]/dashboard/structures/[id]
 *
 * @phase R327-structure-viewer
 */
import { IconArrowLeft } from '@tabler/icons-react';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import PageContainer from '@/components/layout/page-container';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { StructureViewer } from '@/features/crystal-structures/components/structure-viewer';
import { formatSciNode } from '@/features/spectra/utils/format-units';
import { Link } from '@/i18n/navigation';
import { getCurrentTenantId } from '@/lib/auth/server';
import { getCrystalStructure } from '@/lib/firebase/crystal-structures/service';

export const dynamic = 'force-dynamic';

export default async function StructureDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const tenantId = await getCurrentTenantId();
  if (!tenantId) notFound();
  const { id } = await params;
  const cs = await getCrystalStructure(tenantId, id);
  if (!cs) notFound();
  const t = await getTranslations('structures');

  return (
    <PageContainer>
      <div className='space-y-4'>
        <Button asChild variant='ghost' size='sm' className='-ml-2 w-fit'>
          <Link href='/dashboard/structures'>
            <IconArrowLeft className='mr-1 size-4' />
            {t('backToLibrary')}
          </Link>
        </Button>

        <div>
          <h1 className='text-xl font-semibold'>{formatSciNode(cs.name)}</h1>
          <div className='text-muted-foreground mt-1 flex flex-wrap items-center gap-2 text-sm'>
            <Badge variant='outline' className='uppercase'>
              {cs.source}
            </Badge>
            {cs.mpId ? (
              <a
                href={`https://materialsproject.org/materials/${cs.mpId}`}
                target='_blank'
                rel='noopener noreferrer'
                className='text-primary font-mono underline-offset-2 hover:underline'
              >
                {cs.mpId}
              </a>
            ) : null}
            {cs.structure.spaceGroup ? <span>{formatSciNode(cs.structure.spaceGroup)}</span> : null}
            <span>{t('atomCount', { count: cs.structure.nat })}</span>
            {cs.verified ? <Badge variant='secondary'>{t('verified')}</Badge> : null}
          </div>
        </div>

        <StructureViewer structureId={id} />
      </div>
    </PageContainer>
  );
}
