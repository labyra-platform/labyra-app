'use client';

import { IconTrash } from '@tabler/icons-react';
import { getFirebaseAuth } from '@/lib/firebase/client';
import { useParams, useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { GhsPictogramRow } from '@/components/chemicals/ghs-pictogram';
import PageContainer from '@/components/layout/page-container';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { InventoryPanel } from '@/features/chemicals/components/inventory-panel';
import { useIsAdmin } from '@/lib/auth/use-claims';
import type { Chemical } from '@/types/chemical';

async function authedFetch(path: string, init?: RequestInit): Promise<Response> {
  const user = getFirebaseAuth().currentUser;
  if (!user) throw new Error('not_authenticated');
  const token = await user.getIdToken();
  return fetch(path, {
    ...init,
    headers: { authorization: `Bearer ${token}`, ...init?.headers }
  });
}

export default function ChemicalDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const locale = useLocale();
  const router = useRouter();
  const t = useTranslations('chemicals');
  const tDetail = useTranslations('chemicals.detail');
  const isAdmin = useIsAdmin();
  const [chem, setChem] = useState<Chemical | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await authedFetch(`/api/chemicals/${id}`);
      if (res.ok) setChem((await res.json()) as Chemical);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleDeprecate() {
    if (!confirm('Deprecate this chemical?')) return;
    try {
      const res = await authedFetch(`/api/chemicals/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      toast.success('Deprecated');
      router.push(`/${locale}/dashboard/chemicals`);
    } catch {
      toast.error('Failed');
    }
  }

  if (loading) {
    return (
      <PageContainer pageTitle='…'>
        <div className='text-muted-foreground py-8 text-center text-sm'>{t('loading')}</div>
      </PageContainer>
    );
  }
  if (!chem) {
    return (
      <PageContainer pageTitle='Not found'>
        <div className='text-muted-foreground py-8 text-center text-sm'>Chemical not found.</div>
      </PageContainer>
    );
  }

  return (
    <PageContainer
      pageTitle={chem.name}
      pageDescription={chem.formula ?? chem.chemicalCode}
      pageHeaderAction={
        isAdmin ? (
          <Button variant='ghost' size='sm' onClick={() => void handleDeprecate()}>
            <IconTrash className='size-4' />
            {tDetail('deprecate')}
          </Button>
        ) : undefined
      }
    >
      <div className='max-w-3xl space-y-8'>
        {/* Summary */}
        <div className='grid grid-cols-2 gap-4 md:grid-cols-4'>
          <Stat label={t('table.cas')} value={chem.casNumber ?? '—'} mono />
          <Stat label={t('table.quantity')} value={`${chem.quantity} ${chem.unit}`} />
          <div>
            <div className='text-muted-foreground text-xs'>{t('table.status')}</div>
            <Badge variant='secondary' className='mt-1 capitalize'>
              {chem.status}
            </Badge>
          </div>
          <div>
            <div className='text-muted-foreground text-xs'>{t('table.hazards')}</div>
            <div className='mt-1'>
              <GhsPictogramRow codes={chem.ghsHazards} />
            </div>
          </div>
        </div>

        {chem.hazardStatements && chem.hazardStatements.length > 0 && (
          <div className='text-muted-foreground text-xs'>
            <span className='font-medium'>H-statements:</span> {chem.hazardStatements.join(', ')}
          </div>
        )}

        {/* Inventory */}
        <InventoryPanel
          chemicalId={id}
          unit={chem.unit}
          onQuantityChange={(q) => setChem((c) => (c ? { ...c, quantity: q } : c))}
        />
      </div>
    </PageContainer>
  );
}

function Stat({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className='text-muted-foreground text-xs'>{label}</div>
      <div className={`mt-1 text-sm font-medium ${mono ? 'font-mono' : ''}`}>{value}</div>
    </div>
  );
}
