'use client';

/**
 * Per-row kebab for a booking (R213). View + Cancel (owner or admin).
 * "Delete" semantics for bookings = cancel (DELETE route = cancelBooking).
 * Guarded by AlertDialog. Cancelled/completed cannot be cancelled again.
 */
import { IconDotsVertical, IconEye, IconX } from '@tabler/icons-react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { getFirebaseAuth } from '@/lib/firebase/client';

export function BookingsRowActions({ id, canCancel }: { id: string; canCancel: boolean }) {
  const t = useTranslations('bookings');
  const router = useRouter();
  const locale = useLocale();
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const handleCancel = async () => {
    setBusy(true);
    try {
      const user = getFirebaseAuth().currentUser;
      if (!user) throw new Error('not_authenticated');
      const token = await user.getIdToken();
      const res = await fetch(`/api/bookings/${id}`, {
        method: 'DELETE',
        headers: { authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error();
      toast.success(t('cancelled'));
    } catch {
      toast.error(t('cancelFailed'));
    } finally {
      setBusy(false);
      setConfirmOpen(false);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={t('actions')}
          disabled={busy}
          className='inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40'
        >
          <IconDotsVertical className='size-4' />
        </DropdownMenuTrigger>
        <DropdownMenuContent align='end'>
          <DropdownMenuItem onClick={() => router.push(`/${locale}/dashboard/bookings/${id}`)}>
            <IconEye className='size-4' />
            {t('view')}
          </DropdownMenuItem>
          {canCancel && (
            <DropdownMenuItem
              onClick={() => setConfirmOpen(true)}
              className='text-destructive focus:text-destructive'
            >
              <IconX className='size-4' />
              {t('cancel')}
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('confirmCancel')}</AlertDialogTitle>
            <AlertDialogDescription>{t('cancelHint')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>{t('keepBooking')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(ev) => {
                ev.preventDefault();
                void handleCancel();
              }}
              disabled={busy}
              className='bg-destructive text-destructive-foreground hover:bg-destructive/90'
            >
              {t('cancel')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
