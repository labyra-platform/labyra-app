'use client';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { useSpectraByExperiment } from '@/lib/firestore/queries/spectra';
import type { SpectrumStatus } from '@/types/spectra';

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

interface SpectraListProps {
  experimentId: string;
}

export function SpectraList({ experimentId }: SpectraListProps) {
  const { spectra, loading } = useSpectraByExperiment(experimentId);
  const locale = useLocale();
  const t = useTranslations('spectra');
  const tType = useTranslations('spectra.type');
  const tStatus = useTranslations('spectra.status');

  if (loading) {
    return <div className='text-muted-foreground py-8 text-center text-sm'>{t('loading')}</div>;
  }

  if (spectra.length === 0) {
    return <div className='text-muted-foreground py-12 text-center text-sm'>{t('empty')}</div>;
  }

  return (
    <div className='rounded-lg border'>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('colFilename')}</TableHead>
            <TableHead>{t('colType')}</TableHead>
            <TableHead>{t('colSize')}</TableHead>
            <TableHead>{t('colStatus')}</TableHead>
            <TableHead>{t('colMeasuredAt')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {spectra.map((s) => (
            <TableRow key={s.id}>
              <TableCell>
                <Link
                  href={`/${locale}/dashboard/spectra/${s.id}`}
                  className='font-medium hover:underline'
                >
                  {s.originalFilename}
                </Link>
              </TableCell>
              <TableCell>{tType(s.spectrumType)}</TableCell>
              <TableCell className='text-muted-foreground tabular-nums'>
                {formatSize(s.sizeBytes)}
              </TableCell>
              <TableCell>
                <Badge className={statusColor[s.status]} variant='secondary'>
                  {tStatus(s.status)}
                </Badge>
              </TableCell>
              <TableCell className='text-muted-foreground'>
                {new Date(s.measuredAt).toLocaleString()}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
