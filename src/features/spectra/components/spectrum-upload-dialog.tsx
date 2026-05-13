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
}

export function SpectrumUploadDialog({
  open,
  onOpenChange,
  experimentId,
  sampleId,
  sampleLabel
}: SpectrumUploadDialogProps) {
  const t = useTranslations('spectra');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='max-w-2xl'>
        <DialogHeader>
          <DialogTitle>{t('upload')}</DialogTitle>
          <DialogDescription>{t('subtitle')}</DialogDescription>
        </DialogHeader>
        <SpectrumUploadDropzone
          experimentId={experimentId}
          sampleId={sampleId}
          sampleLabel={sampleLabel}
          onComplete={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
