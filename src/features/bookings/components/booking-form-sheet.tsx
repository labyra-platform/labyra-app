'use client';

/**
 * BookingFormSheet (R229) — right-side Sheet wrapping BookingForm for quick
 * create/edit without leaving the list. Full detail/edit still lives on the
 * /bookings/[id] page; this is the fast path. Reused across "New booking"
 * (header) and "Edit" (row kebab) via the same component.
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
import type { Booking } from '@/types/bookings';
import { BookingForm } from './booking-form';

interface BookingFormSheetProps {
  trigger: ReactNode;
  bookingId?: string;
  defaultValues?: Partial<Booking>;
}

export function BookingFormSheet({ trigger, bookingId, defaultValues }: BookingFormSheetProps) {
  const t = useTranslations('bookings');
  const [open, setOpen] = useState(false);
  const isEdit = Boolean(bookingId);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent side='right' className='w-full overflow-y-auto sm:max-w-[440px]'>
        <SheetHeader>
          <SheetTitle>{isEdit ? t('editPageTitle') : t('newPageTitle')}</SheetTitle>
          <SheetDescription>{t('subtitle')}</SheetDescription>
        </SheetHeader>
        <div className='mt-4'>
          {/* key forces a fresh form when switching target booking */}
          <BookingForm
            key={bookingId ?? 'new'}
            bookingId={bookingId}
            defaultValues={defaultValues}
            onSuccess={() => setOpen(false)}
            onCancel={() => setOpen(false)}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
