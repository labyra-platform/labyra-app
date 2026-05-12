'use client';

/**
 * Single conversation row in sidebar list. Hover → delete button.
 * @phase R160-ai-2b
 */
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { IconTrash } from '@tabler/icons-react';
import { useDeleteConversation } from '@/lib/firestore/queries/ai-conversations';
import { useTranslations } from 'next-intl';
import type { AiConversation } from '@/types/ai';

interface Props {
  conversation: AiConversation;
  isActive: boolean;
  onSelect: (id: string) => void;
  onDeleted: (deletedId: string) => void;
}

export function ConversationItem({ conversation, isActive, onSelect, onDeleted }: Props) {
  const t = useTranslations('ai');
  const [confirming, setConfirming] = useState(false);
  const deleteMutation = useDeleteConversation();

  const handleClick = () => {
    if (confirming) return;
    onSelect(conversation.id);
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirming) {
      setConfirming(true);
      // Auto-reset after 3s if not confirmed
      setTimeout(() => setConfirming(false), 3000);
      return;
    }
    try {
      await deleteMutation.mutateAsync(conversation.id);
      onDeleted(conversation.id);
    } catch (err) {
      console.error('delete failed', err);
    } finally {
      setConfirming(false);
    }
  };

  return (
    <button
      type='button'
      onClick={handleClick}
      className={cn(
        'group hover:bg-muted relative flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors',
        isActive && 'bg-muted font-medium'
      )}
    >
      <span className='flex-1 truncate'>{conversation.title || t('untitled')}</span>
      <button
        type='button'
        onClick={handleDelete}
        className={cn(
          'rounded p-1 opacity-0 transition-opacity group-hover:opacity-100',
          confirming
            ? 'text-destructive bg-destructive/10 opacity-100'
            : 'hover:bg-destructive/10 hover:text-destructive'
        )}
        title={confirming ? t('confirmDelete') : t('delete')}
        disabled={deleteMutation.isPending}
      >
        <IconTrash className='size-3.5' />
      </button>
    </button>
  );
}
