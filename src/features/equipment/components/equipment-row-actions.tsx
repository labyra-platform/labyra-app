'use client';

/**
 * Per-row kebab for equipment (R212). View + HARD delete with confirm dialog.
 * Equipment has no lifecycleStatus / reactivate route, so delete is permanent —
 * guarded by an AlertDialog (no Undo).
 * BACKLOG: migrate equipment to soft-delete (lifecycleStatus) for parity.
 */
import { IconDotsVertical, IconEye, IconTrash } from '@tabler/icons-react';
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

export function EquipmentRowActions({ id, name }: { id: string; name: string }) {
  const t = useTranslations('equipment');
  const router = useRouter();
  const locale = useLocale();
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const handleDelete = async () => {
    setBusy(true);
    try {
      const user = getFirebaseAuth().currentUser;
      if (!user) throw new Error('not_authenticated');
      const token = await user.getIdToken();
      const res = await fetch(`/api/equipment/${id}`, {
        method: 'DELETE',
        headers: { authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error(await res.text());
      toast.success(t('toastDeleted'));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'error');
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
          <DropdownMenuItem onClick={() => router.push(`/${locale}/dashboard/equipment/${id}`)}>
            <IconEye className='size-4' />
            {t('view')}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => setConfirmOpen(true)}
            className='text-destructive focus:text-destructive'
          >
            <IconTrash className='size-4' />
            {t('delete')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('deleteConfirm')}</AlertDialogTitle>
            <AlertDialogDescription>{t('deleteConfirmHint', { name })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>{t('cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(ev) => {
                ev.preventDefault();
                void handleDelete();
              }}
              disabled={busy}
              className='bg-destructive text-destructive-foreground hover:bg-destructive/90'
            >
              {t('delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
