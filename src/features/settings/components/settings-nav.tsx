'use client';

/**
 * Settings rail — vertical nav shared by every /dashboard/settings/* page.
 *
 * R521: was a horizontal tab strip. Six labels in a row survive until the
 * seventh, and a rail has no such limit; more importantly a row cannot show
 * that these items are grouped, and grouping is the point — "Thiết lập" holds
 * the things you configure, and the sections that come later (security, data)
 * are a different kind of answer to a different kind of question.
 *
 * Links, not tabs, so every section stays deep-linkable. Lab Context is
 * admin-only here for the sake of the eye; the guard that matters is
 * server-side (R508) and in the lab-context layout.
 *
 * @phase R521 — settings restructure
 */
import { useTranslations } from 'next-intl';
import { Icons } from '@/components/icons';
import { Link, usePathname } from '@/i18n/navigation';
import { useRole } from '@/lib/auth/use-claims';
import { cn } from '@/lib/utils';

interface SettingsItem {
  key: string;
  href: string;
  icon: keyof typeof Icons;
  adminOnly?: boolean;
}

interface SettingsSection {
  key: string;
  items: SettingsItem[];
}

const SECTIONS: SettingsSection[] = [
  {
    key: 'setup',
    items: [
      { key: 'general', href: '/dashboard/settings/account', icon: 'account' },
      { key: 'ai', href: '/dashboard/settings/ai-preferences', icon: 'sparkles' },
      { key: 'group', href: '/dashboard/settings/group', icon: 'teams' },
      { key: 'notifications', href: '/dashboard/settings/notifications', icon: 'notification' },
      {
        key: 'featureAccess',
        href: '/dashboard/settings/feature-access',
        icon: 'lock',
        adminOnly: true
      },
      {
        key: 'labContext',
        href: '/dashboard/settings/lab-context',
        icon: 'adjustments',
        adminOnly: true
      }
    ]
  }
];

export function SettingsNav() {
  const t = useTranslations('settings.tabs');
  const pathname = usePathname();
  const role = useRole();
  const isAdmin = role === 'admin' || role === 'superadmin';

  const sections = SECTIONS.map((s) => ({
    ...s,
    items: s.items.filter((i) => !i.adminOnly || isAdmin)
  })).filter((s) => s.items.length > 0);

  return (
    <nav aria-label={t('ariaLabel')} className='flex w-full shrink-0 flex-col gap-4 md:w-52'>
      {sections.map((section) => (
        <div key={section.key} className='flex flex-col gap-0.5'>
          <h2 className='text-muted-foreground text-meta px-2.5 pb-1'>
            {t(`sections.${section.key}`)}
          </h2>
          {section.items.map((item) => {
            const Icon = Icons[item.icon];
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.key}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'text-body flex items-center gap-2 rounded-lg px-2.5 py-2 transition-colors',
                  active
                    ? 'bg-muted text-foreground font-medium'
                    : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                )}
              >
                <Icon className='size-4 shrink-0' aria-hidden='true' />
                {t(item.key)}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
