'use client';

/**
 * EquipmentFormSheet (R579) — right-side Sheet for quick create/edit.
 * Mirrors ChemicalFormSheet (R236) / BookingFormSheet (R229).
 *
 * The equipment page had only route-based entry (/equipment/new, /[id]); this
 * gives it the same slide-over panel the chemicals page has. EquipmentForm now
 * takes onSuccess/onCancel so the sheet closes instead of navigating, while the
 * routes keep working for anyone landing on them directly.
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
import type { Equipment } from '@/types/equipment';
import { EquipmentForm } from './equipment-form';

interface EquipmentFormSheetProps {
  trigger: ReactNode;
  equipmentId?: string;
  defaultValues?: Partial<Equipment>;
}

export function EquipmentFormSheet({
  trigger,
  equipmentId,
  defaultValues
}: EquipmentFormSheetProps) {
  const t = useTranslations('equipment');
  const [open, setOpen] = useState(false);
  const isEdit = Boolean(equipmentId);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent side='right' className='w-full overflow-y-auto sm:max-w-[440px]'>
        <SheetHeader>
          <SheetTitle>{isEdit ? t('editPageTitle') : t('addNew')}</SheetTitle>
          <SheetDescription>{t('subtitle')}</SheetDescription>
        </SheetHeader>
        <div className='mt-4'>
          <EquipmentForm
            key={equipmentId ?? 'new'}
            equipmentId={equipmentId}
            defaultValues={defaultValues}
            onSuccess={() => setOpen(false)}
            onCancel={() => setOpen(false)}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
