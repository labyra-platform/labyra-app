'use client';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { useBreadcrumbs, type BreadcrumbItem as BcItem } from '@/hooks/use-breadcrumbs';
import { Icons } from '@/components/icons';
import { useTranslations } from 'next-intl';
import { Fragment } from 'react';

export function Breadcrumbs() {
  const items = useBreadcrumbs();
  const t = useTranslations();

  // Resolve titleKey if present; gracefully fall back to literal title if the
  // key is missing from messages (prevents runtime errors on unknown routes).
  const resolveTitle = (item: BcItem): string => {
    if (!item.titleKey) return item.title;
    // Use .has() to avoid triggering MISSING_MESSAGE error events
    // for auto-generated keys like 'nav.exp-003' from dynamic route segments.
    return t.has(item.titleKey) ? t(item.titleKey) : item.title;
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
