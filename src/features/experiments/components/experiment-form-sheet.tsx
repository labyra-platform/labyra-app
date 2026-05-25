'use client';

/**
 * ExperimentFormSheet (R235) — right-side Sheet for quick create/edit.
 * Mirrors BookingFormSheet (R229) / MaterialFormSheet (R233-2).
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
import type { Experiment } from '@/types/experiments';
import { ExperimentForm } from './experiment-form';

interface ExperimentFormSheetProps {
  trigger: ReactNode;
  experimentId?: string;
  defaultValues?: Partial<Experiment>;
}

export function ExperimentFormSheet({
  trigger,
  experimentId,
  defaultValues
}: ExperimentFormSheetProps) {
  const t = useTranslations('experiments');
  const [open, setOpen] = useState(false);
  const isEdit = Boolean(experimentId);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent side='right' className='w-full overflow-y-auto sm:max-w-xl'>
        <SheetHeader>
          <SheetTitle>{isEdit ? t('editPageTitle') : t('addNew')}</SheetTitle>
          <SheetDescription>{t('subtitle')}</SheetDescription>
        </SheetHeader>
        <div className='mt-4'>
          <ExperimentForm
            key={experimentId ?? 'new'}
            experimentId={experimentId}
            defaultValues={defaultValues}
            onSuccess={() => setOpen(false)}
            onCancel={() => setOpen(false)}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
