'use client';

import { usePathname } from 'next/navigation';

import { NotificationCenter } from '@/features/notifications/components/notification-center';
import { useReaderChromeStore } from '@/features/papers/stores/reader-chrome-store';
import { cn } from '@/lib/utils';

import SearchInput from '../search-input';
import { ThemeModeToggle } from '../themes/theme-mode-toggle';
import { Separator } from '../ui/separator';
import { SidebarTrigger } from '../ui/sidebar';
import { BreadcrumbsConditional } from './breadcrumbs-conditional';

export default function Header() {
  const pathname = usePathname() ?? '';
  // Reader route = /…/papers/<id> (the list page /papers has no id segment).
  const onReader = /\/papers\/[^/]+/.test(pathname);
  const collapsed = useReaderChromeStore((s) => s.collapsed);
  // In the reader's compact mode, fold the whole top bar (search + notifications)
  // away so reading is chrome-free; it returns when the reader chrome un-collapses.
  const hidden = onReader && collapsed;

  return (
    <header
      className={cn(
        'bg-background/60 sticky top-0 z-20 flex shrink-0 items-center justify-between gap-2 overflow-hidden backdrop-blur-md transition-all duration-200',
        hidden ? 'h-0 opacity-0' : 'h-16 opacity-100 md:h-14'
      )}
    >
      <div className='flex items-center gap-2 px-4'>
        <SidebarTrigger className='-ml-1' />
        <Separator orientation='vertical' className='mr-2 h-4' />
        <BreadcrumbsConditional />
      </div>
      <div className='flex items-center gap-2 px-4'>
        <div className='hidden md:flex'>
          <SearchInput />
        </div>
        <ThemeModeToggle />
        <NotificationCenter />
      </div>
    </header>
  );
}
