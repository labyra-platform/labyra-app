/**
 * Download-workflow-json — exports a run's launchable definition
 * ({structure, global, units}) as a .json file, the symmetric counterpart to
 * the New-computation "Import JSON" tab (paste it back to reuse, edit, or share
 * the setup). Client-side Blob download; no server round-trip.
 *
 * @phase R313-download-workflow
 */
'use client';

import { IconDownload } from '@tabler/icons-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import type { DftWorkflow } from '@/types/dft';

export function DownloadWorkflowJson({ workflow }: { workflow: DftWorkflow }) {
  const t = useTranslations('computation');

  function download() {
    const def = {
      structure: workflow.structure,
      global: workflow.global,
      units: workflow.units
    };
    const blob = new Blob([JSON.stringify(def, null, 2)], {
      type: 'application/json;charset=utf-8'
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${workflow.id}-definition.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <Button variant='outline' size='sm' onClick={download}>
      <IconDownload className='mr-1 size-4' />
      {t('downloadJson')}
    </Button>
  );
}
