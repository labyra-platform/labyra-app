'use client';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail
} from '@/components/ui/sidebar';
import { navGroups } from '@/config/nav-config';
import { useMediaQuery } from '@/hooks/use-media-query';
import { useFilteredNavGroups } from '@/hooks/use-nav';
import { Link } from '@/i18n/navigation';
import { Icons } from '../icons';
import { useAuth } from '@/lib/auth/use-auth';
import { signOut } from '@/lib/auth/actions';

export default function AppSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useAuth();
  const email = user?.email ?? '';
  const displayName = user?.displayName ?? email.split('@')[0] ?? 'User';
  const initials =
    displayName
      .split(/[\s@.]+/)
      .map((p) => p[0])
      .filter(Boolean)
      .slice(0, 2)
      .join('')
      .toUpperCase() || 'U';

  async function handleLogout() {
    try {
      await fetch('/api/auth/session', { method: 'DELETE' });
    } catch {
      /* non-fatal */
    }
    await signOut();
    router.replace('/sign-in');
  }
  const { isOpen: _isOpen } = useMediaQuery();
  void _isOpen;
  const filteredGroups = useFilteredNavGroups(navGroups);
  const t = useTranslations();
  const resolveLabel = (key: string | undefined, fallback: string): string =>
    key ? t(key) : fallback;

  React.useEffect(() => {
    // Side effects based on sidebar state changes
  }, []);

  return (
    <Sidebar collapsible='icon'>
      <SidebarHeader />
      <SidebarContent className='overflow-x-hidden'>
        {filteredGroups.map((group) => (
          <SidebarGroup key={group.label || 'ungrouped'} className='py-0'>
            {(group.labelKey || group.label) && (
              <SidebarGroupLabel>{resolveLabel(group.labelKey, group.label)}</SidebarGroupLabel>
            )}
            <SidebarMenu>
              {group.items.map((item) => {
                const Icon = item.icon ? Icons[item.icon] : Icons.logo;
                return item?.items && item?.items?.length > 0 ? (
                  <Collapsible
                    key={item.title}
                    asChild
                    defaultOpen={item.isActive}
                    className='group/collapsible'
                  >
                    <SidebarMenuItem>
                      {item.url && item.url !== '#' ? (
                        // R271b: navigable parent — the label links to the
                        // section index while a separate chevron toggles the
                        // sub-tree (matches the mockup; removes the need for an
                        // "All …" first child).
                        <>
                          <SidebarMenuButton
                            asChild
                            tooltip={resolveLabel(item.titleKey, item.title)}
                            isActive={pathname === item.url}
                          >
                            <Link href={item.url}>
                              {item.icon && <Icon />}
                              <span>{resolveLabel(item.titleKey, item.title)}</span>
                            </Link>
                          </SidebarMenuButton>
                          <CollapsibleTrigger asChild>
                            <SidebarMenuAction>
                              <Icons.chevronRight className='transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90' />
                              <span className='sr-only'>
                                {resolveLabel(item.titleKey, item.title)}
                              </span>
                            </SidebarMenuAction>
                          </CollapsibleTrigger>
                        </>
                      ) : (
                        // Toggle-only parent (no standalone page, e.g. url '#').
                        <CollapsibleTrigger asChild>
                          <SidebarMenuButton
                            tooltip={resolveLabel(item.titleKey, item.title)}
                            isActive={pathname === item.url}
                          >
                            {item.icon && <Icon />}
                            <span>{resolveLabel(item.titleKey, item.title)}</span>
                            <Icons.chevronRight className='ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90' />
                          </SidebarMenuButton>
                        </CollapsibleTrigger>
                      )}
                      <CollapsibleContent>
                        <SidebarMenuSub>
                          {item.items?.map((subItem) => (
                            <SidebarMenuSubItem key={subItem.title}>
                              <SidebarMenuSubButton asChild isActive={pathname === subItem.url}>
                                <Link href={subItem.url}>
                                  <span>{resolveLabel(subItem.titleKey, subItem.title)}</span>
                                </Link>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          ))}
                        </SidebarMenuSub>
                      </CollapsibleContent>
                    </SidebarMenuItem>
                  </Collapsible>
                ) : (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      tooltip={resolveLabel(item.titleKey, item.title)}
                      isActive={pathname === item.url}
                    >
                      <Link href={item.url}>
                        <Icon />
                        <span>{resolveLabel(item.titleKey, item.title)}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  size='lg'
                  className='data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground'
                >
                  <div className='bg-primary/10 text-primary flex size-7 shrink-0 items-center justify-center rounded-md text-xs font-semibold'>
                    {initials}
                  </div>
                  <div className='grid flex-1 text-left text-sm leading-tight'>
                    <span className='truncate font-medium'>{displayName}</span>
                    <span className='text-muted-foreground truncate text-xs'>{email}</span>
                  </div>
                  <Icons.chevronsDown className='ml-auto size-4' />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className='w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg'
                side='bottom'
                align='end'
                sideOffset={4}
              >
                <DropdownMenuLabel className='p-0 font-normal'>
                  <div className='px-2 py-1.5 text-sm'>
                    <div className='font-medium'>{displayName}</div>
                    <div className='text-muted-foreground text-xs'>{email}</div>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => router.push('/dashboard/settings/notifications')}>
                  <Icons.notification className='mr-2 h-4 w-4' />
                  {t('nav.notifications')}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => void handleLogout()}>
                  <Icons.logout className='mr-2 h-4 w-4' />
                  {t('auth.logout')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
