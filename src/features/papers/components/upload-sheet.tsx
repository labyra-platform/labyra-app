'use client';

/**
 * UploadSheet (R237ap) — right-side Sheet wrapping UploadDropzone so a user can
 * add a paper without leaving the list. Mirrors MaterialFormSheet /
 * BookingFormSheet. The standalone /papers/upload route still exists for direct
 * links and deep navigation.
 *
 * On success it closes the sheet and opens the new paper.
 */
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { type ReactNode, useState } from 'react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger
} from '@/components/ui/sheet';
import { UploadDropzone } from './upload-dropzone';

export function UploadSheet({ trigger }: { trigger: ReactNode }) {
  const t = useTranslations('papers');
  const router = useRouter();
  const locale = useLocale();
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent side='right' className='w-full overflow-y-auto sm:max-w-[440px]'>
        <SheetHeader>
          <SheetTitle>{t('uploadPageTitle')}</SheetTitle>
          <SheetDescription>{t('uploadPageSubtitle')}</SheetDescription>
        </SheetHeader>
        <div className='mt-4'>
          <UploadDropzone
            onUploaded={(paperId) => {
              setOpen(false);
              router.push(`/${locale}/dashboard/papers/${paperId}`);
            }}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
