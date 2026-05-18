'use client';
import { IconAlertCircle, IconDownload, IconRefresh } from '@tabler/icons-react';
import { getAuth } from 'firebase/auth';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { SpectrumMetadata, SpectrumStatus } from '@/types/spectra';

const statusColor: Record<SpectrumStatus, string> = {
  uploaded: 'bg-blue-500/10 text-blue-700 dark:text-blue-400',
  queued: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
  processing: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 animate-pulse',
  analyzed: 'bg-green-500/10 text-green-700 dark:text-green-400',
  failed: 'bg-red-500/10 text-red-700 dark:text-red-400'
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

interface SpectrumDetailCardProps {
  spectrum: SpectrumMetadata;
}

export function SpectrumDetailCard({ spectrum }: SpectrumDetailCardProps) {
  const [reanalyzing, setReanalyzing] = useState(false);

  const handleReanalyze = async () => {
    if (reanalyzing) return;
    setReanalyzing(true);
    try {
      const user = getAuth().currentUser;
      if (!user) throw new Error('Not authenticated');
      const token = await user.getIdToken();
      const res = await fetch(`/api/measurements/${spectrum.id}/reanalyze`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) {
        const errBody = await res.text();
        throw new Error(errBody.slice(0, 200));
      }
      toast.success('Re-analysis queued. Refresh in ~30s to see results.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Re-analyze failed');
    } finally {
      setReanalyzing(false);
    }
  };

  const tType = useTranslations('spectra.type');
  const tStatus = useTranslations('spectra.status');
  const tGroup = useTranslations('spectra.group');
  const tField = useTranslations('spectra.detail');
  const [downloading, setDownloading] = useState(false);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const user = getAuth().currentUser;
      if (!user) throw new Error('not_authenticated');
      const token = await user.getIdToken();
      const res = await fetch(`/api/measurements/${spectrum.id}/signed-download`, {
        headers: { authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error(await res.text());
      const { url } = await res.json();
      window.open(url, '_blank');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className='space-y-4'>
      <Card>
        <CardHeader>
          <div className='flex items-start justify-between gap-4'>
            <div>
              <CardTitle>{tField('metadata')}</CardTitle>
              <CardDescription>
                {tType(spectrum.spectrumType)} · {tGroup(spectrum.group)}
              </CardDescription>
            </div>
            <div className='flex gap-2'>
              <Button onClick={handleDownload} disabled={downloading}>
                <IconDownload className='size-4' />
                {downloading ? tField('preparing') : tField('download')}
              </Button>
              <Button
                variant='outline'
                onClick={handleReanalyze}
                disabled={
                  reanalyzing || spectrum.status === 'queued' || spectrum.status === 'processing'
                }
                title='Re-run analysis with latest worker'
              >
                <IconRefresh className={`size-4 ${reanalyzing ? 'animate-spin' : ''}`} />
                {reanalyzing ? 'Re-analyzing…' : 'Re-analyze'}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className='space-y-3'>
          <Row label={tField('status')}>
            <Badge className={statusColor[spectrum.status]} variant='secondary'>
              {tStatus(spectrum.status)}
            </Badge>
          </Row>
          <Row label={tField('originalFilename')}>{spectrum.originalFilename}</Row>
          <Row label={tField('size')}>{formatSize(spectrum.sizeBytes)}</Row>
          <Row label={tField('mimeType')}>
            <code className='text-xs'>{spectrum.mimeType}</code>
          </Row>
          <Row label={tField('sha256')}>
            <code className='text-xs break-all'>{spectrum.sha256}</code>
          </Row>
          <Row label={tField('measuredAt')}>{new Date(spectrum.measuredAt).toLocaleString()}</Row>
          {spectrum.instrument && <Row label={tField('instrument')}>{spectrum.instrument}</Row>}
          {spectrum.sampleLabel && <Row label={tField('sample')}>{spectrum.sampleLabel}</Row>}
        </CardContent>
      </Card>

      {spectrum.status === 'failed' && spectrum.errorMessage && (
        <Card>
          <CardContent className='pt-6'>
            <div className='flex items-start gap-2 text-destructive'>
              <IconAlertCircle className='size-5 shrink-0 mt-0.5' />
              <div>
                <div className='font-medium'>{tField('error')}</div>
                <div className='text-sm mt-1'>{spectrum.errorMessage}</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {spectrum.status === 'uploaded' && (
        <Card>
          <CardContent className='pt-6 text-sm text-muted-foreground'>
            {tField('analysisPending')}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className='grid grid-cols-3 gap-4'>
      <div className='text-sm text-muted-foreground'>{label}</div>
      <div className='col-span-2 text-sm'>{children}</div>
    </div>
  );
}
