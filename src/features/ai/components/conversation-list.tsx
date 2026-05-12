'use client';

/**
 * Time-grouped conversation list.
 * @phase R160-ai-2b
 */
import { useConversations } from '@/lib/firestore/queries/ai-conversations';
import { groupConversationsByTime, type TimeGroupKey } from '../lib/group-by-time';
import { ConversationItem } from './conversation-item';
import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';

const GROUP_LABEL_KEY: Record<TimeGroupKey, string> = {
  today: 'groupToday',
  yesterday: 'groupYesterday',
  last7: 'groupLast7Days',
  last30: 'groupLast30Days',
  earlier: 'groupEarlier'
};

export function ConversationList() {
  const t = useTranslations('ai');
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const activeId = searchParams.get('c');

  const { data: conversations, isLoading, isError } = useConversations(100);

  const selectConversation = (id: string) => {
    const url = new URL(window.location.href);
    url.searchParams.set('c', id);
    router.push(url.pathname + url.search);
  };

  const handleDeleted = (deletedId: string) => {
    if (deletedId === activeId) {
      router.push(pathname); // clear URL param
    }
  };

  if (isLoading) {
    return (
      <div className='text-muted-foreground flex items-center justify-center py-8 text-sm'>
        <Loader2 className='mr-2 size-4 animate-spin' />
        {t('loading')}
      </div>
    );
  }

  if (isError) {
    return <div className='text-destructive px-2 py-4 text-sm'>{t('loadError')}</div>;
  }

  if (!conversations || conversations.length === 0) {
    return (
      <div className='text-muted-foreground px-2 py-8 text-center text-sm'>{t('emptyHistory')}</div>
    );
  }

  const groups = groupConversationsByTime(conversations);

  return (
    <div className='space-y-4'>
      {groups.map((group) => (
        <div key={group.key}>
          <h3 className='text-muted-foreground mb-1 px-2 text-xs font-medium uppercase tracking-wide'>
            {t(GROUP_LABEL_KEY[group.key])}
          </h3>
          <div className='space-y-0.5'>
            {group.conversations.map((conv) => (
              <ConversationItem
                key={conv.id}
                conversation={conv}
                isActive={conv.id === activeId}
                onSelect={selectConversation}
                onDeleted={handleDeleted}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
