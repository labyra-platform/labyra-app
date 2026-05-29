'use client';

/**
 * ChemicalFormSheet (R236) — right-side Sheet for quick create/edit.
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
import type { Chemical } from '@/types/chemical';
import { ChemicalForm } from './chemical-form';

interface ChemicalFormSheetProps {
  trigger: ReactNode;
  chemicalId?: string;
  defaultValues?: Partial<Chemical>;
}

export function ChemicalFormSheet({ trigger, chemicalId, defaultValues }: ChemicalFormSheetProps) {
  const t = useTranslations('chemicals');
  const [open, setOpen] = useState(false);
  const isEdit = Boolean(chemicalId);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent side='right' className='w-full overflow-y-auto sm:max-w-[440px]'>
        <SheetHeader>
          <SheetTitle>{isEdit ? t('editPageTitle') : t('addNew')}</SheetTitle>
          <SheetDescription>{t('subtitle')}</SheetDescription>
        </SheetHeader>
        <div className='mt-4'>
          <ChemicalForm
            key={chemicalId ?? 'new'}
            chemicalId={chemicalId}
            defaultValues={defaultValues}
            onSuccess={() => setOpen(false)}
            onCancel={() => setOpen(false)}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
