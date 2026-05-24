'use client';

/**
 * Per-row kebab actions for a measurement/spectrum (R206, checklist #7 + #5).
 * - View   → navigate to detail
 * - Delete → soft-delete (DELETE = deprecate) + sonner toast with Undo
 *            (Undo = POST .../reactivate). Realtime listener removes/restores
 *            the row automatically, so no manual refetch.
 *
 * Edit is deferred to a later layer (needs an edit dialog + schema form).
 */
import { IconDotsVertical, IconEdit, IconEye, IconTrash } from '@tabler/icons-react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { getFirebaseAuth } from '@/lib/firebase/client';
import { EditSpectrumDialog } from './edit-spectrum-dialog';

async function authToken(): Promise<string> {
  const user = getFirebaseAuth().currentUser;
  if (!user) throw new Error('not_authenticated');
  return user.getIdToken();
}

export function SpectraRowActions({
  id,
  name,
  instrument,
  measuredAt
}: {
  id: string;
  name: string;
  instrument?: string;
  measuredAt?: number;
}) {
  const t = useTranslations('spectra');
  const router = useRouter();
  const locale = useLocale();
  const [busy, setBusy] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const reactivate = async (sid: string) => {
    try {
      const token = await authToken();
      const res = await fetch(`/api/measurements/${sid}/reactivate`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error(await res.text());
      toast.success(t('toastRestored'));
    } catch {
      toast.error(t('toastRestoreFailed'));
    }
  };

  const handleDelete = async () => {
    setBusy(true);
    try {
      const token = await authToken();
      const res = await fetch(`/api/measurements/${id}?reason=user_deleted`, {
        method: 'DELETE',
        headers: { authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error(await res.text());
      toast.success(t('toastDeleted'), {
        action: { label: t('undo'), onClick: () => void reactivate(id) }
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'error');
    } finally {
      setBusy(false);
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
          <DropdownMenuItem onClick={() => router.push(`/${locale}/dashboard/spectra/${id}`)}>
            <IconEye className='size-4' />
            {t('view')}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setEditOpen(true)}>
            <IconEdit className='size-4' />
            {t('edit')}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => void handleDelete()}
            aria-label={`${t('delete')} ${name}`}
            className='text-destructive focus:text-destructive'
          >
            <IconTrash className='size-4' />
            {t('delete')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <EditSpectrumDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        id={id}
        instrument={instrument}
        measuredAt={measuredAt}
      />
    </>
  );
}
