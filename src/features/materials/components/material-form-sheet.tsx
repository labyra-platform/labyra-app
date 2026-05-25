'use client';

/**
 * MaterialFormSheet (R233-2) — right-side Sheet wrapping MaterialForm for quick
 * edit/create from the catalog without leaving it. Mirrors BookingFormSheet
 * (R229). Full edit also remains at /materials/[id].
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
import type { Material } from '@/types/materials';
import { MaterialForm } from './material-form';

interface MaterialFormSheetProps {
  trigger: ReactNode;
  materialId?: string;
  defaultValues?: Partial<Material>;
  onSaved?: () => void;
}

export function MaterialFormSheet({
  trigger,
  materialId,
  defaultValues,
  onSaved
}: MaterialFormSheetProps) {
  const t = useTranslations('materials');
  const [open, setOpen] = useState(false);
  const isEdit = Boolean(materialId);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent side='right' className='w-full overflow-y-auto sm:max-w-xl'>
        <SheetHeader>
          <SheetTitle>{isEdit ? t('editPageTitle') : t('addNew')}</SheetTitle>
          <SheetDescription>{t('subtitle')}</SheetDescription>
        </SheetHeader>
        <div className='mt-4'>
          <MaterialForm
            key={materialId ?? 'new'}
            materialId={materialId}
            defaultValues={defaultValues}
            onSuccess={() => {
              setOpen(false);
              onSaved?.();
            }}
            onCancel={() => setOpen(false)}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
