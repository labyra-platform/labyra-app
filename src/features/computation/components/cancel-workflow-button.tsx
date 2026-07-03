/**
 * CancelWorkflowButton — stops a running workflow (or a single unit). Cancelling
 * a Batch job releases its VM and cannot be undone, so the action is behind a
 * confirmation dialog. On success the server-rendered status refreshes.
 *
 * @phase R362-cancel-jobs
 */
'use client';

import { IconLoader2, IconSquareRoundedX } from '@tabler/icons-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { useRouter } from '@/i18n/navigation';

export function CancelWorkflowButton({
  workflowId,
  unitId,
  size = 'sm',
  variant = 'outline'
}: {
  workflowId: string;
  /** Cancel just this unit; omit to cancel the whole workflow. */
  unitId?: string;
  size?: 'sm' | 'icon';
  variant?: 'outline' | 'ghost' | 'destructive';
}) {
  const t = useTranslations('computation');
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  const doCancel = async () => {
    setBusy(true);
    try {
      const res = await fetch('/api/dft/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(unitId ? { workflowId, unitId } : { workflowId })
      });
      if (res.ok) {
        setOpen(false);
        router.refresh();
      }
    } catch {
      // leave the dialog open so the user can retry
    } finally {
      setBusy(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        {size === 'icon' ? (
          <Button variant={variant} size='icon' className='size-7' aria-label={t('cancelJob')}>
            <IconSquareRoundedX className='size-4' />
          </Button>
        ) : (
          <Button variant={variant} size='sm'>
            <IconSquareRoundedX className='mr-1 size-4' />
            {t('cancelJob')}
          </Button>
        )}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {unitId ? t('cancelUnitTitle') : t('cancelWorkflowTitle')}
          </AlertDialogTitle>
          <AlertDialogDescription>{t('cancelConfirm')}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>{t('cancelKeep')}</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              void doCancel();
            }}
            disabled={busy}
            className='bg-destructive text-destructive-foreground hover:bg-destructive/90'
          >
            {busy ? <IconLoader2 className='mr-2 size-4 animate-spin' /> : null}
            {t('cancelConfirmAction')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
