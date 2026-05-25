'use client';

/**
 * SampleFormSheet (R237) — right-side Sheet for quick create/edit.
 * Wider (sm:max-w-2xl) because the sample form is long (multi-phase
 * composition). Mirrors the other entity form sheets.
 */
import { useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger
} from '@/components/ui/sheet';
import type { Sample } from '@/types/samples';
import { SampleForm } from './sample-form';

interface SampleFormSheetProps {
  trigger: ReactNode;
  sampleId?: string;
  defaultValues?: Partial<Sample>;
}

export function SampleFormSheet({ trigger, sampleId, defaultValues }: SampleFormSheetProps) {
  const t = useTranslations('samples');
  const [open, setOpen] = useState(false);
  const isEdit = Boolean(sampleId);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent side='right' className='w-full overflow-y-auto sm:max-w-2xl'>
        <SheetHeader>
          <SheetTitle>{isEdit ? t('editPageTitle') : t('addNew')}</SheetTitle>
          <SheetDescription>{t('subtitle')}</SheetDescription>
        </SheetHeader>
        <div className='mt-4'>
          <SampleForm
            key={sampleId ?? 'new'}
            sampleId={sampleId}
            defaultValues={defaultValues}
            onSuccess={() => setOpen(false)}
            onCancel={() => setOpen(false)}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
