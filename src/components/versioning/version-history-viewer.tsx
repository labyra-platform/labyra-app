/**
 * Display version history for a paper or reference with expandable diff view.
 *
 * @phase R164-phase-8-9a
 */
'use client';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { IconHistory, IconChevronRight, IconChevronDown } from '@tabler/icons-react';
import { useVersionHistory, type VersionRecord } from './use-version-history';

interface VersionHistoryViewerProps {
  entity: 'papers' | 'references';
  id: string;
  /** Current version number (to show "current" marker). */
  currentVersion?: number;
}

export function VersionHistoryViewer({ entity, id, currentVersion }: VersionHistoryViewerProps) {
  const t = useTranslations('versioning');
  const { versions, loading, error } = useVersionHistory(entity, id);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (loading) {
    return <div className='text-muted-foreground text-sm py-4'>{t('loading')}</div>;
  }
  if (error) {
    return <div className='text-destructive text-sm py-4'>{t('error', { msg: error })}</div>;
  }
  if (versions.length === 0) {
    return <div className='text-muted-foreground text-sm py-4 italic'>{t('noHistory')}</div>;
  }

  return (
    <div className='space-y-2'>
      <div className='flex items-center gap-2 text-sm font-medium text-muted-foreground'>
        <IconHistory className='h-4 w-4' />
        {t('historyTitle')} ({versions.length})
      </div>
      <div className='border rounded-md divide-y'>
        {versions.map((v) => {
          const isExpanded = expandedId === v.id;
          const isCurrent = currentVersion === v.version;
          return (
            <div key={v.id} className='p-3 hover:bg-muted/40 transition-colors'>
              <button
                type='button'
                onClick={() => setExpandedId(isExpanded ? null : v.id)}
                className='flex items-center justify-between w-full text-left gap-2'
              >
                <div className='flex items-center gap-2 min-w-0'>
                  {isExpanded ? (
                    <IconChevronDown className='h-4 w-4 flex-shrink-0' />
                  ) : (
                    <IconChevronRight className='h-4 w-4 flex-shrink-0' />
                  )}
                  <span className='font-mono text-sm'>v{v.version}</span>
                  {isCurrent && (
                    <span className='text-xs px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'>
                      {t('current')}
                    </span>
                  )}
                  <span className='text-xs text-muted-foreground truncate'>
                    {v.changeNote ?? t('noChangeNote')}
                  </span>
                </div>
                <span className='text-xs text-muted-foreground flex-shrink-0'>
                  {new Date(v.changedAt).toLocaleString()}
                </span>
              </button>
              {isExpanded && <VersionDetail version={v} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function VersionDetail({ version }: { version: VersionRecord }) {
  const t = useTranslations('versioning');
  return (
    <div className='mt-3 ml-6 space-y-2 text-sm'>
      <div className='text-xs text-muted-foreground'>
        {t('changedBy')}: <span className='font-mono'>{version.changedBy}</span>
      </div>
      <details className='text-xs'>
        <summary className='cursor-pointer text-muted-foreground hover:text-foreground'>
          {t('viewContent')}
        </summary>
        <pre className='mt-2 p-2 bg-muted rounded overflow-auto max-h-96 text-[10px]'>
          {JSON.stringify(version.content, null, 2)}
        </pre>
      </details>
    </div>
  );
}
