'use client';
import { useTranslations } from 'next-intl';
import { Fragment } from 'react';
import { Icons } from '@/components/icons';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { type BreadcrumbItem as BcItem, useBreadcrumbs } from '@/hooks/use-breadcrumbs';
export function Breadcrumbs() {
  const items = useBreadcrumbs();
  const t = useTranslations();
  // Resolve titleKey if present; fall back to the literal title when the key is
  // missing OR resolves to a namespace (object). next-intl's t.has() returns true
  // for namespaces like 'nav.groups', but t() THROWS on them (INSUFFICIENT_PATH) —
  // so a try/catch is required, not a .has() check. Guards every route (deeper
  // nested paths can surface namespace keys).
  const resolveTitle = (item: BcItem): string => {
    if (!item.titleKey || !t.has(item.titleKey)) return item.title;
    try {
      return t(item.titleKey);
    } catch {
      return item.title;
    }
  };
  if (items.length === 0) return null;
  return (
    <Breadcrumb>
      <BreadcrumbList>
        {items.map((item, index) => {
          const label = resolveTitle(item);
          return (
            <Fragment key={item.link}>
              {index !== items.length - 1 && (
                <BreadcrumbItem className='hidden md:block'>
                  <BreadcrumbLink href={item.link}>{label}</BreadcrumbLink>
                </BreadcrumbItem>
              )}
              {index < items.length - 1 && (
                <BreadcrumbSeparator className='hidden md:block'>
                  <Icons.slash />
                </BreadcrumbSeparator>
              )}
              {index === items.length - 1 && <BreadcrumbPage>{label}</BreadcrumbPage>}
            </Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
