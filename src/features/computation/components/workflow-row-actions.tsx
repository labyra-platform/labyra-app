/**
 * Per-row kebab for a computation job — Open (workspace) + Delete. Delete is a
 * hard delete (DftWorkflow has no lifecycle field), so no Undo is offered.
 *
 * @phase R321-job-kebab-bulk
 */
'use client';

import { IconDotsVertical, IconEye, IconTrash } from '@tabler/icons-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { useRouter } from '@/i18n/navigation';

interface Props {
  id: string;
  name: string;
  onDeleted: () => void;
}

export function WorkflowRowActions({ id, name, onDeleted }: Props) {
  const t = useTranslations('computation');
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function del() {
    if (busy) return;
    setBusy(true);
    try {
      await fetch(`/api/dft/workflows/${id}`, { method: 'DELETE' });
      onDeleted();
    } finally {
      setBusy(false);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant='ghost'
          size='icon'
          className='size-8'
          aria-label={t('rowActions')}
          onClick={(e) => e.stopPropagation()}
        >
          <IconDotsVertical className='size-4' />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align='end' onClick={(e) => e.stopPropagation()}>
        <DropdownMenuItem onClick={() => router.push(`/dashboard/computation/${id}`)}>
          <IconEye className='mr-2 size-4' />
          {t('rowOpen')}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => void del()}
          disabled={busy}
          className='text-destructive focus:text-destructive'
          aria-label={`${t('delete')} ${name}`}
        >
          <IconTrash className='mr-2 size-4' />
          {t('delete')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
