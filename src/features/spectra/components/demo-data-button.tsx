'use client';

/**
 * Demo data button — appears on empty dropzone state.
 * Strategic intent: cut time-to-first-analysis below 10 min (see INSIGHTS.md).
 *
 * @phase R162-demo-dataset
 */

import { IconFlask, IconLoader2 } from '@tabler/icons-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { SciText } from '@/features/spectra/utils/format-units';
import type { DemoSample } from '@/lib/spectra/load-demo';
import { fetchDemoFile, loadDemoManifest } from '@/lib/spectra/load-demo';

interface DemoDataButtonProps {
  onLoad: (
    file: File,
    prefilled: { formula: string; anode: string; monochromator: string }
  ) => void;
  disabled?: boolean;
}

export function DemoDataButton({ onLoad, disabled }: DemoDataButtonProps) {
  const t = useTranslations('spectra.demo');
  const locale = useLocale();
  const [samples, setSamples] = useState<DemoSample[]>([]);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  useEffect(() => {
    loadDemoManifest()
      .then((manifest) => setSamples(manifest.samples))
      .catch((error: unknown) => {
        console.error('demo manifest load failed', error);
      });
  }, []);

  const handlePick = async (sample: DemoSample) => {
    setLoadingId(sample.id);
    try {
      const file = await fetchDemoFile(sample);
      onLoad(file, {
        formula: sample.formula,
        anode: sample.anode,
        monochromator: sample.monochromator
      });
      toast.success(t('loaded', { name: localizedLabel(sample, locale) }));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'unknown';
      toast.error(t('loadFailed', { reason: message }));
    } finally {
      setLoadingId(null);
    }
  };

  if (samples.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant='outline' size='sm' disabled={disabled || loadingId !== null}>
          {loadingId !== null ? (
            <IconLoader2 className='mr-2 h-4 w-4 animate-spin' />
          ) : (
            <IconFlask className='mr-2 h-4 w-4' />
          )}
          {t('button')}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align='center' className='w-80'>
        <DropdownMenuLabel>{t('menuLabel')}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {samples.map((sample) => (
          <DropdownMenuItem
            key={sample.id}
            onSelect={() => handlePick(sample)}
            disabled={loadingId !== null}
            className='flex flex-col items-start gap-1 py-2'
          >
            {/* R162-batch6-synthetic-badge */}
            <div className='flex items-center gap-2 w-full'>
              <span className='text-sm font-medium flex-1'>{localizedLabel(sample, locale)}</span>
              {sample.formula && (
                <Badge variant='outline' className='font-mono text-xs'>
                  <SciText>{sample.formula}</SciText>
                </Badge>
              )}
              {sample.synthetic && (
                <Badge variant='secondary' className='text-xs'>
                  {t('syntheticBadge')}
                </Badge>
              )}
            </div>
            <span className='text-xs text-muted-foreground'>
              {localizedDescription(sample, locale)}
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function localizedLabel(sample: DemoSample, locale: string): string {
  return locale === 'vi' ? sample.label_vi : sample.label_en;
}

function localizedDescription(sample: DemoSample, locale: string): string {
  return locale === 'vi' ? sample.description_vi : sample.description_en;
}
