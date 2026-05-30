'use client';
/**
 * Citation filter (R237cp) — controlled.
 *   - Open Access only: keep refs whose cited paper is OA (OpenAlex is_oa).
 *   - Publisher: multi-select (checkbox dropdown) over the publishers actually
 *     present in this paper's references.
 * Replaces the old confidence-chip filter. Both fields come from R237co worker
 * enrichment (targetPublisher / targetIsOpenAccess).
 */
import { IconBuildingStore, IconChevronDown, IconLockOpen } from '@tabler/icons-react';
import { useTranslations } from 'next-intl';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

export interface CitationFilterValue {
  publishers: Set<string>;
  openAccessOnly: boolean;
}

export function createDefaultFilter(): CitationFilterValue {
  return { publishers: new Set(), openAccessOnly: false };
}

export interface PublisherOption {
  name: string;
  count: number;
}

interface Props {
  value: CitationFilterValue;
  onChange: (next: CitationFilterValue) => void;
  publishers: PublisherOption[];
}

export function CitationFilter({ value, onChange, publishers }: Props) {
  const t = useTranslations('papers');

  const togglePublisher = (name: string) => {
    const next = new Set(value.publishers);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    onChange({ ...value, publishers: next });
  };

  const selectedCount = value.publishers.size;

  return (
    <div className='flex flex-wrap items-center gap-1.5'>
      <span className='mr-1 text-xs text-muted-foreground'>{t('filterLabel')}</span>

      {/* Open Access toggle */}
      <button
        type='button'
        onClick={() => onChange({ ...value, openAccessOnly: !value.openAccessOnly })}
        aria-pressed={value.openAccessOnly}
        className={cn(
          'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs transition-colors',
          value.openAccessOnly
            ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
            : 'text-muted-foreground hover:bg-muted/50'
        )}
      >
        <IconLockOpen className='size-3' aria-hidden />
        {t('filterOpenAccess')}
      </button>

      {/* Publisher multi-select */}
      {publishers.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type='button'
              className={cn(
                'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs transition-colors',
                selectedCount > 0
                  ? 'border-primary/40 bg-primary/5 text-foreground'
                  : 'text-muted-foreground hover:bg-muted/50'
              )}
            >
              <IconBuildingStore className='size-3' aria-hidden />
              {selectedCount > 0
                ? t('filterPublisherCount', { count: selectedCount })
                : t('filterPublisher')}
              <IconChevronDown className='size-3' aria-hidden />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align='start' className='max-h-72 w-56 overflow-y-auto'>
            {publishers.map((p) => (
              <DropdownMenuCheckboxItem
                key={p.name}
                checked={value.publishers.has(p.name)}
                onCheckedChange={() => togglePublisher(p.name)}
                onSelect={(e) => e.preventDefault()}
              >
                <span className='flex-1 truncate'>{p.name}</span>
                <span className='ml-2 tabular-nums text-muted-foreground'>{p.count}</span>
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {(value.openAccessOnly || selectedCount > 0) && (
        <button
          type='button'
          onClick={() => onChange(createDefaultFilter())}
          className='text-xs text-muted-foreground underline hover:text-foreground'
        >
          {t('filterClear')}
        </button>
      )}
    </div>
  );
}

/** Pure predicate — apply CitationFilterValue to a single citation. */
export function citationPassesFilter(
  c: { targetPublisher?: string; targetIsOpenAccess?: boolean },
  filter: CitationFilterValue
): boolean {
  if (filter.openAccessOnly && c.targetIsOpenAccess !== true) return false;
  if (filter.publishers.size > 0) {
    const p = (c.targetPublisher ?? '').trim();
    if (!p || !filter.publishers.has(p)) return false;
  }
  return true;
}
