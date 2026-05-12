'use client';

/**
 * Single conversation row in sidebar list. Hover → delete button.
 *
 * V2: outer element is <div role="button"> (not <button>) to avoid
 * nested <button> hydration error from inner delete button.
 *
 * @phase R160-ai-2b-hotfix
 */
import { useState, type KeyboardEvent } from 'react';
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

  const select = () => {
    if (confirming || deleteMutation.isPending) return;
    onSelect(conversation.id);
  };

  const handleKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      select();
    }
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirming) {
      setConfirming(true);
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
    <div
      role='button'
      tabIndex={0}
      onClick={select}
      onKeyDown={handleKey}
      className={cn(
        'group hover:bg-muted relative flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none',
        isActive && 'bg-muted font-medium'
      )}
    >
      <span className='flex-1 truncate'>{conversation.title || t('untitled')}</span>
      <button
        type='button'
        onClick={handleDelete}
        className={cn(
          'shrink-0 rounded p-1 opacity-0 transition-opacity group-hover:opacity-100',
          confirming
            ? 'text-destructive bg-destructive/10 opacity-100'
            : 'hover:bg-destructive/10 hover:text-destructive'
        )}
        title={confirming ? t('confirmDelete') : t('delete')}
        disabled={deleteMutation.isPending}
      >
        <IconTrash className='size-3.5' />
      </button>
    </div>
  );
}
