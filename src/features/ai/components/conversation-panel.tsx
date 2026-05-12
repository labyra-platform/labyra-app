'use client';

/**
 * Collapsible left panel containing conversation history list.
 * State persists in localStorage.
 * @phase R160-ai-2b
 */
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  IconLayoutSidebarLeftCollapse,
  IconLayoutSidebarLeftExpand,
  IconPlus
} from '@tabler/icons-react';
import { useTranslations } from 'next-intl';
import { useRouter, usePathname } from 'next/navigation';
import { ConversationList } from './conversation-list';
import { cn } from '@/lib/utils';

const STORAGE_KEY = 'labyra:aiPanel:open';

export function ConversationPanel() {
  const t = useTranslations('ai');
  const router = useRouter();
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored !== null) setIsOpen(stored === 'true');
    setMounted(true);
  }, []);

  const toggle = () => {
    const next = !isOpen;
    setIsOpen(next);
    localStorage.setItem(STORAGE_KEY, String(next));
  };

  const newChat = () => {
    router.push(pathname);
  };

  if (!mounted) {
    return <div className='w-64 shrink-0' aria-hidden />;
  }

  return (
    <aside
      className={cn(
        'flex shrink-0 flex-col border-r bg-card transition-all duration-200',
        isOpen ? 'w-64' : 'w-12'
      )}
    >
      <div
        className={cn(
          'flex items-center border-b p-2',
          isOpen ? 'justify-between gap-2' : 'justify-center'
        )}
      >
        {isOpen ? (
          <>
            <Button
              variant='outline'
              size='sm'
              onClick={newChat}
              className='flex-1 justify-start gap-2'
            >
              <IconPlus className='size-4' />
              {t('newChat')}
            </Button>
            <Button
              variant='ghost'
              size='icon'
              onClick={toggle}
              title={t('collapse')}
              className='shrink-0'
            >
              <IconLayoutSidebarLeftCollapse className='size-4' />
            </Button>
          </>
        ) : (
          <Button variant='ghost' size='icon' onClick={toggle} title={t('expand')}>
            <IconLayoutSidebarLeftExpand className='size-4' />
          </Button>
        )}
      </div>

      {isOpen && (
        <div className='flex-1 overflow-y-auto p-2'>
          <ConversationList />
        </div>
      )}
    </aside>
  );
}
