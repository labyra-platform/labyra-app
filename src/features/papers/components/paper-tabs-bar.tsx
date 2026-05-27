'use client';

/**
 * PaperTabsBar — horizontal tab strip for the paper reader (R226).
 *
 * Visual hierarchy (single row, no two-level nesting):
 *   - The "Papers" anchor on the left is the PARENT: larger, heavier, with an
 *     icon and a divider separating it from the children. Clicking it returns to
 *     the list. It is not a closeable tab.
 *   - Each open paper is a CHILD tab: smaller, lighter, truncated title, close
 *     button on hover/active. The active child is visually lifted (background +
 *     bottom-border accent) the way editor tabs work.
 *
 * State is entirely in usePaperTabsStore; this component is a pure view.
 */
import { IconFileText, IconLayoutGrid, IconX } from '@tabler/icons-react';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { usePaperTabsStore } from '@/features/papers/stores/paper-tabs-store';

/** Active paperId from /<locale>/dashboard/papers/<id>[/view]; null on the list. */
function paperIdFromPath(pathname: string): string | null {
  const m = pathname.match(/\/dashboard\/papers\/([^/]+)(?:\/view)?\/?$/);
  if (!m || m[1] === 'upload') return null;
  return m[1];
}

export function PaperTabsBar({ locale }: { locale: string }) {
  const t = useTranslations('papers');
  const router = useRouter();
  const pathname = usePathname() ?? '';
  const tabs = usePaperTabsStore((s) => s.tabs);
  const setActive = usePaperTabsStore((s) => s.setActive);
  const closeTab = usePaperTabsStore((s) => s.closeTab);

  // R227c: which tab is active comes from the URL, not the store — so the list
  // route shows the "Papers" parent as active and no child highlighted.
  const routePaperId = paperIdFromPath(pathname);
  const onList = routePaperId === null;

  const goToTab = (paperId: string) => {
    setActive(paperId);
    router.push(`/${locale}/dashboard/papers/${paperId}`);
  };

  const handleClose = (e: React.MouseEvent, paperId: string) => {
    e.stopPropagation();
    const wasActive = routePaperId === paperId;
    closeTab(paperId);
    if (wasActive) {
      const next = usePaperTabsStore.getState().activeTabId;
      router.push(next ? `/${locale}/dashboard/papers/${next}` : `/${locale}/dashboard/papers`);
    }
  };

  return (
    <div className='flex h-11 w-full items-stretch gap-1 border-b bg-muted/30 px-2'>
      {/* PARENT anchor — "Papers". Active (lifted) when on the list route. */}
      <button
        type='button'
        onClick={() => router.push(`/${locale}/dashboard/papers`)}
        aria-current={onList ? 'page' : undefined}
        className={cn(
          'my-1.5 inline-flex items-center gap-2 rounded-md border-b-2 px-3 text-sm font-semibold transition-colors',
          onList
            ? 'border-primary bg-background text-foreground shadow-sm'
            : 'border-transparent text-muted-foreground hover:bg-muted hover:text-foreground'
        )}
        aria-label={t('backToList')}
      >
        <IconLayoutGrid className='size-4' />
        {t('papersTitle')}
      </button>

      {/* divider between parent and children */}
      {tabs.length > 0 && <div className='my-2 w-px shrink-0 bg-border' />}

      {/* CHILD tabs — open papers; flex-shrink so they narrow like Edge as more
          open. Thin vertical separators between inactive tabs give them edges. */}
      <div className='flex min-w-0 flex-1 items-stretch overflow-x-auto'>
        {tabs.map((tab, i) => {
          const active = tab.paperId === routePaperId;
          const prevActive = i > 0 && tabs[i - 1].paperId === routePaperId;
          return (
            <div
              key={tab.paperId}
              role='tab'
              tabIndex={0}
              aria-selected={active}
              onClick={() => goToTab(tab.paperId)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  goToTab(tab.paperId);
                }
              }}
              className={cn(
                'group relative my-1.5 flex min-w-[7rem] max-w-[16rem] flex-1 cursor-pointer items-center gap-1.5 rounded-md border-b-2 px-2.5 text-xs transition-colors',
                // Separator: a thin left divider on inactive tabs, hidden when the
                // tab itself or its left neighbour is active (so the active tab
                // reads as a clean lifted card).
                !active &&
                  !prevActive &&
                  i > 0 &&
                  'before:absolute before:left-0 before:top-1.5 before:bottom-1.5 before:w-px before:bg-border before:content-[""] group-hover:before:opacity-0',
                active
                  ? 'border-primary bg-background font-medium text-foreground shadow-sm'
                  : 'border-transparent text-muted-foreground hover:bg-muted/60 hover:text-foreground'
              )}
            >
              <IconFileText className='size-3.5 shrink-0 opacity-70' />
              <span className='truncate'>{tab.title || t('untitled')}</span>
              <button
                type='button'
                onClick={(e) => handleClose(e, tab.paperId)}
                aria-label={t('closeTab')}
                className={cn(
                  'ml-auto shrink-0 rounded p-0.5 transition-opacity hover:bg-muted',
                  active ? 'opacity-70 hover:opacity-100' : 'opacity-0 group-hover:opacity-60'
                )}
              >
                <IconX className='size-3' />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
