'use client';

import { IconTrash } from '@tabler/icons-react';
import { getFirebaseAuth } from '@/lib/firebase/client';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Panel } from '@/components/ui-extra/panel';

async function authedFetch(path: string, init?: RequestInit): Promise<Response> {
  const user = getFirebaseAuth().currentUser;
  if (!user) throw new Error('not_authenticated');
  const token = await user.getIdToken();
  return fetch(path, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      ...(init?.body ? { 'content-type': 'application/json' } : {}),
      ...init?.headers
    }
  });
}

interface Fact {
  id: string;
  subject: string;
  object: unknown;
  sourceQuote: string;
  extractedAt: number;
}

function label(subject: string): string {
  return subject.replace(/^user\./, '').replace(/_/g, ' ');
}

function renderObject(o: unknown): string {
  return typeof o === 'string' ? o : JSON.stringify(o);
}

export function RememberedFacts() {
  const t = useTranslations('settings.memory');
  const [facts, setFacts] = useState<Fact[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const res = await authedFetch('/api/me/facts');
        if (!res.ok) throw new Error(await res.text());
        const data = (await res.json()) as { facts: Fact[] };
        if (active) setFacts(data.facts ?? []);
      } catch {
        // non-fatal
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  async function handleDelete(id: string) {
    setDeleting(id);
    try {
      const res = await authedFetch(`/api/me/facts?id=${encodeURIComponent(id)}`, {
        method: 'DELETE'
      });
      if (!res.ok) throw new Error(await res.text());
      setFacts((prev) => prev.filter((f) => f.id !== id));
      toast.success(t('deleted'));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error');
    } finally {
      setDeleting(null);
    }
  }

  return (
    <Panel title={t('title')} description={t('subtitle')} className='max-w-2xl'>
      {loading ? (
        <div className='bg-muted h-20 w-full animate-pulse rounded' />
      ) : facts.length === 0 ? (
        <p className='text-muted-foreground text-sm'>{t('empty')}</p>
      ) : (
        <ul className='divide-border divide-y'>
          {facts.map((f) => (
            <li key={f.id} className='flex items-start justify-between gap-3 py-3'>
              <div className='min-w-0'>
                <p className='text-sm'>
                  <span className='text-muted-foreground'>{label(f.subject)}:</span>{' '}
                  {renderObject(f.object)}
                </p>
                <p className='text-muted-foreground mt-0.5 truncate text-xs italic'>
                  “{f.sourceQuote}”
                </p>
              </div>
              <Button
                type='button'
                variant='ghost'
                size='icon'
                aria-label={t('delete')}
                disabled={deleting === f.id}
                onClick={() => void handleDelete(f.id)}
              >
                <IconTrash className='size-4' />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
