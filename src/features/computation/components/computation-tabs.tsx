/**
 * ComputationTabs — Mat3ra-style section navigation for the computation domain.
 * Route-linked tabs (Jobs / Structures / Compose / Compare) with the active
 * route underlined; an optional right slot holds the page's primary action
 * (e.g. New computation / Import structure), like Mat3ra's CREATE.
 *
 * @phase R322-computation-tabs
 */
'use client';

import { type MouseEvent, useSyncExternalStore } from 'react';

import {
  IconAtom,
  IconCube,
  IconDatabase,
  IconGitCompare,
  IconListDetails,
  IconTools,
  type IconProps,
  IconFolder
} from '@tabler/icons-react';
import { useTranslations } from 'next-intl';
import type { ComponentType, ReactNode } from 'react';
import { Link, usePathname, useRouter } from '@/i18n/navigation';
import {
  getComposeDirty,
  setComposeDirty,
  subscribeComposeDirty
} from '@/features/computation/compose-draft-store';
import { cn } from '@/lib/utils';

interface Tab {
  href: string;
  labelKey: string;
  Icon: ComponentType<IconProps>;
  isActive: (path: string) => boolean;
}

const TABS: Tab[] = [
  {
    href: '/dashboard/computation',
    labelKey: 'jobsTab',
    Icon: IconListDetails,
    isActive: (p) => p.endsWith('/dashboard/computation')
  },
  {
    href: '/dashboard/computation/explore',
    labelKey: 'exploreMpTab',
    Icon: IconAtom,
    isActive: (p) => p.startsWith('/dashboard/computation/explore')
  },
  {
    href: '/dashboard/structures',
    labelKey: 'structuresTitle',
    Icon: IconCube,
    isActive: (p) => p.startsWith('/dashboard/structures')
  },
  {
    href: '/dashboard/computation/pseudo',
    labelKey: 'pseudoTab',
    Icon: IconDatabase,
    isActive: (p) => p.startsWith('/dashboard/computation/pseudo')
  },
  {
    href: '/dashboard/computation/projects',
    labelKey: 'projectsTab',
    Icon: IconFolder,
    isActive: (p) => p.startsWith('/dashboard/computation/projects')
  },
  {
    href: '/dashboard/computation/compose',
    labelKey: 'composeTitle',
    Icon: IconTools,
    isActive: (p) => p.startsWith('/dashboard/computation/compose')
  },
  {
    href: '/dashboard/computation/compare',
    labelKey: 'compareTitle',
    Icon: IconGitCompare,
    isActive: (p) => p.startsWith('/dashboard/computation/compare')
  }
];

export function ComputationTabs({ rightSlot }: { rightSlot?: ReactNode }) {
  const t = useTranslations('computation');
  const pathname = usePathname() ?? '';
  const router = useRouter();
  // Warn before leaving the composer with unsaved edits (client-side navigation
  // does not trigger beforeunload, so intercept the tab click here).
  const dirty = useSyncExternalStore(subscribeComposeDirty, getComposeDirty, () => false);

  const guardedNavigate = (e: MouseEvent<HTMLAnchorElement>, href: string) => {
    if (!dirty) return;
    e.preventDefault();
    if (window.confirm(t('composeLeaveWarn'))) {
      setComposeDirty(false);
      router.push(href);
    }
  };

  return (
    <div className='mb-4 flex items-center justify-between gap-4 border-b'>
      <nav className='flex gap-1 overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'>
        {TABS.map(({ href, labelKey, Icon, isActive }) => {
          const active = isActive(pathname);
          return (
            <Link
              key={href}
              href={href}
              onClick={(e) => guardedNavigate(e, href)}
              className={cn(
                '-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors',
                active
                  ? 'border-primary text-foreground'
                  : 'text-muted-foreground hover:text-foreground border-transparent'
              )}
            >
              <Icon className='size-4' />
              {t(labelKey)}
            </Link>
          );
        })}
      </nav>
      {rightSlot ? <div className='shrink-0 pb-1'>{rightSlot}</div> : null}
    </div>
  );
}
