/**
 * Edit + Delete buttons for reference card detail page.
 *
 * @phase R162-refcard-edit
 */
// R164-phase-6b: fetch URL migrated /api/reference-cards → /api/references
'use client';

import { IconEdit, IconTrash } from '@tabler/icons-react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { EditReferenceCardDialog } from '@/features/spectra/components/edit-reference-card-dialog';
import { getFirebaseAuth } from '@/lib/firebase/client';
import type { ReferenceCard } from '@/types/spectra';

interface ReferenceCardActionsProps {
  card: ReferenceCard;
}

export function ReferenceCardActions({ card }: ReferenceCardActionsProps) {
  const t = useTranslations('referenceCards');
  const router = useRouter();
  const locale = useLocale();
  const [editOpen, setEditOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!confirm(t('deleteConfirm'))) return;
    setDeleting(true);
    try {
      const user = getFirebaseAuth().currentUser;
      if (!user) throw new Error('not_authenticated');
      const token = await user.getIdToken();
      const res = await fetch(`/api/references/${card.id}`, {
        method: 'DELETE',
        headers: { authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error(await res.text());
      toast.success(t('toastDeleted'));
      router.push(`/${locale}/dashboard/reference-cards`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'error');
      setDeleting(false);
    }
  };

  return (
    <div className='flex items-center gap-2'>
      <Button variant='outline' size='sm' onClick={() => setEditOpen(true)}>
        <IconEdit className='size-4' />
        {t('edit')}
      </Button>
      <Button variant='destructive' size='sm' onClick={handleDelete} disabled={deleting}>
        <IconTrash className='size-4' />
        {deleting ? t('deleting') : t('delete')}
      </Button>
      <EditReferenceCardDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        card={card}
        onUpdated={() => router.refresh()}
      />
    </div>
  );
}
