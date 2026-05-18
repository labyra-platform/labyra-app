'use client';
import { useTranslations } from 'next-intl';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { SpectrumUploadDropzone } from './spectrum-upload-dropzone';

interface SpectrumUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  experimentId: string;
  sampleId: string;
  sampleLabel?: string;
  /** Demo file preloaded. R162-demo-visibility */
  initialDemo?: {
    file: File;
    formula: string;
    anode: string;
    monochromator: string;
  };
}

export function SpectrumUploadDialog({
  open,
  onOpenChange,
  experimentId,
  sampleId,
  sampleLabel,
  initialDemo
}: SpectrumUploadDialogProps) {
  const t = useTranslations('spectra');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='flex max-h-[85vh] max-w-2xl flex-col overflow-hidden'>
        <DialogHeader>
          <DialogTitle>{t('upload')}</DialogTitle>
          <DialogDescription>{t('subtitle')}</DialogDescription>
        </DialogHeader>
        <SpectrumUploadDropzone
          key={initialDemo?.file.name ?? 'default'}
          experimentId={experimentId}
          sampleId={sampleId}
          sampleLabel={sampleLabel}
          onComplete={() => onOpenChange(false)}
          initialDemo={initialDemo}
        />
      </DialogContent>
    </Dialog>
  );
}
