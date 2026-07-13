'use client';

/**
 * Settings tab nav — link-based tabs shared by every /dashboard/settings/* page
 * (rendered by the settings layout). Visuals mirror shadcn TabsList/TabsTrigger;
 * links keep each tab deep-linkable. Lab Context only shows for admins (the
 * authoritative guard stays server-side + in the lab-context layout).
 *
 * @phase R485 — unified settings
 */
import { useTranslations } from 'next-intl';
import { Icons } from '@/components/icons';
import { Link, usePathname } from '@/i18n/navigation';
import { useRole } from '@/lib/auth/use-claims';
import { cn } from '@/lib/utils';

interface SettingsTab {
  key: string;
  href: string;
  icon: keyof typeof Icons;
  adminOnly?: boolean;
}

const TABS: SettingsTab[] = [
  { key: 'general', href: '/dashboard/settings/account', icon: 'account' },
  { key: 'ai', href: '/dashboard/settings/ai-preferences', icon: 'sparkles' },
  { key: 'group', href: '/dashboard/settings/group', icon: 'teams' },
  { key: 'notifications', href: '/dashboard/settings/notifications', icon: 'notification' },
  {
    key: 'labContext',
    href: '/dashboard/settings/lab-context',
    icon: 'adjustments',
    adminOnly: true
  }
];

export function SettingsNav() {
  const t = useTranslations('settings.tabs');
  const pathname = usePathname();
  const role = useRole();
  const isAdmin = role === 'admin' || role === 'superadmin';

  const visible = TABS.filter((tab) => !tab.adminOnly || isAdmin);

  return (
    <nav
      aria-label={t('ariaLabel')}
      className='bg-muted text-muted-foreground inline-flex h-9 w-fit max-w-full items-center justify-start gap-0.5 overflow-x-auto rounded-lg p-[3px]'
    >
      {visible.map((tab) => {
        const Icon = Icons[tab.icon];
        const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
        return (
          <Link
            key={tab.key}
            href={tab.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'inline-flex h-[calc(100%-1px)] items-center justify-center gap-1.5 rounded-md border border-transparent px-2.5 py-1 text-sm font-medium whitespace-nowrap transition-[color,box-shadow]',
              active
                ? 'bg-background text-foreground dark:border-input dark:bg-input/30 shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Icon className='size-4 shrink-0' aria-hidden='true' />
            {t(tab.key)}
          </Link>
        );
      })}
    </nav>
  );
}
