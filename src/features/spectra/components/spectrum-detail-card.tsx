'use client';
import { IconAlertCircle, IconDownload, IconRefresh } from '@tabler/icons-react';
import { getFirebaseAuth } from '@/lib/firebase/client';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Panel } from '@/components/ui-extra/panel';
import type { SpectrumMetadata, SpectrumStatus } from '@/types/spectra';
import { SciText } from '@/features/spectra/utils/format-units';

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
      const user = getFirebaseAuth().currentUser;
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
      const user = getFirebaseAuth().currentUser;
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
      {/* R514: the two buttons are actions on this panel, so they belong in the
          trailing slot rather than wedged into the heading block. 'Re-analyze'
          and its tooltip were hardcoded English — unlike the deviation panel,
          no translation existed to wire up, so the keys are new. */}
      <Panel
        title={tField('metadata')}
        description={`${tType(spectrum.spectrumType)} · ${tGroup(spectrum.group)}`}
        action={
          <div className='flex shrink-0 gap-2'>
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
              title={tField('reanalyzeTip')}
            >
              <IconRefresh className={`size-4 ${reanalyzing ? 'animate-spin' : ''}`} />
              {reanalyzing ? tField('reanalyzing') : tField('reanalyze')}
            </Button>
          </div>
        }
      >
        <div className='space-y-3'>
          <Row label={tField('status')}>
            <Badge className={statusColor[spectrum.status]} variant='secondary'>
              {tStatus(spectrum.status)}
            </Badge>
          </Row>
          <Row label={tField('originalFilename')}>
            <SciText>{spectrum.originalFilename}</SciText>
          </Row>
          <Row label={tField('size')}>{formatSize(spectrum.sizeBytes)}</Row>
          <Row label={tField('mimeType')}>
            <code className='text-xs'>{spectrum.mimeType}</code>
          </Row>
          <Row label={tField('sha256')}>
            <code className='text-xs break-all'>{spectrum.sha256}</code>
          </Row>
          <Row label={tField('measuredAt')}>{new Date(spectrum.measuredAt).toLocaleString()}</Row>
          {spectrum.instrument && <Row label={tField('instrument')}>{spectrum.instrument}</Row>}
          {spectrum.sampleLabel && (
            <Row label={tField('sample')}>
              <SciText>{spectrum.sampleLabel}</SciText>
            </Row>
          )}
        </div>
      </Panel>

      {spectrum.status === 'failed' && spectrum.errorMessage && (
        // R514: this card's own heading was buried in its body as a bold div.
        // It IS the panel's name — promoting it to the <h2> is what gives the
        // landmark something to be called (§10).
        <Panel title={tField('error')} icon={IconAlertCircle} className='text-destructive'>
          <p className='text-body'>{spectrum.errorMessage}</p>
        </Panel>
      )}

      {spectrum.status === 'uploaded' && (
        <p className='text-muted-foreground text-body'>{tField('analysisPending')}</p>
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
