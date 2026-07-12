'use client';

/**
 * Reader panel listing the figures extracted from the document (R470). Fetches
 * short-lived signed URLs from /api/papers/[id]/figures and renders each figure;
 * clicking one jumps the PDF to the page it appears on.
 */
import { IconPhoto } from '@tabler/icons-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

import { getFirebaseAuth } from '@/lib/firebase/client';

interface FigureItem {
  name: string;
  page: number;
  mimeType: string;
  url: string;
}

export function FiguresTab({
  paperId,
  onJumpToPage
}: {
  paperId: string;
  onJumpToPage: (page: number, y?: number, highlight?: string) => void;
}) {
  const t = useTranslations('papers');
  const [items, setItems] = useState<FigureItem[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const user = getFirebaseAuth().currentUser;
        if (!user) return;
        const token = await user.getIdToken();
        const res = await fetch(`/api/papers/${paperId}/figures`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { figures?: FigureItem[] };
        if (!cancelled) setItems(data.figures ?? []);
      } catch {
        // ignore — falls through to the empty state
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [paperId]);

  if (!loaded) {
    return (
      <div className='text-muted-foreground min-h-0 flex-1 overflow-y-auto p-4 text-sm'>
        {t('loading')}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className='flex min-h-0 flex-1 flex-col items-center justify-center gap-2 p-6 text-center'>
        <IconPhoto className='text-muted-foreground/40 size-8' />
        <p className='text-sm font-medium'>{t('figuresEmptyTitle')}</p>
        <p className='text-muted-foreground text-xs'>{t('figuresEmptyBody')}</p>
      </div>
    );
  }

  return (
    <div className='min-h-0 flex-1 space-y-3 overflow-y-auto p-3'>
      {items.map((fig) => (
        <button
          key={fig.name}
          type='button'
          onClick={() => onJumpToPage(fig.page)}
          className='hover:border-primary block w-full overflow-hidden rounded-lg border text-left transition-colors'
        >
          {/* Signed external URL — next/image isn't a fit for short-lived links. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={fig.url} alt={fig.name} className='bg-muted w-full' loading='lazy' />
          <div className='text-muted-foreground px-2 py-1.5 text-xs'>
            {fig.page > 0 ? t('figurePageLabel', { page: fig.page }) : fig.name}
          </div>
        </button>
      ))}
    </div>
  );
}
