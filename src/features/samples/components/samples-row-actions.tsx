'use client';

/** Per-row kebab for a sample (R209). View + soft-delete with Undo. */
import { IconDotsVertical, IconEye, IconTrash } from '@tabler/icons-react';
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

async function authToken(): Promise<string> {
  const user = getFirebaseAuth().currentUser;
  if (!user) throw new Error('not_authenticated');
  return user.getIdToken();
}

export function SamplesRowActions({ id, name }: { id: string; name: string }) {
  const t = useTranslations('samples');
  const router = useRouter();
  const locale = useLocale();
  const [busy, setBusy] = useState(false);

  const reactivate = async (sid: string) => {
    try {
      const token = await authToken();
      const res = await fetch(`/api/samples/${sid}/reactivate`, {
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
      const res = await fetch(`/api/samples/${id}?reason=user_deleted`, {
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
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t('actions')}
        disabled={busy}
        className='inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40'
      >
        <IconDotsVertical className='size-4' />
      </DropdownMenuTrigger>
      <DropdownMenuContent align='end'>
        <DropdownMenuItem onClick={() => router.push(`/${locale}/dashboard/samples/${id}`)}>
          <IconEye className='size-4' />
          {t('view')}
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
  );
}
