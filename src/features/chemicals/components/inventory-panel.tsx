'use client';

import { getFirebaseAuth } from '@/lib/firebase/client';
import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { ChemicalTransaction } from '@/types/chemical';

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

export function InventoryPanel({
  chemicalId,
  unit,
  onQuantityChange
}: {
  chemicalId: string;
  unit: string;
  onQuantityChange?: (q: number) => void;
}) {
  const t = useTranslations('chemicals.detail');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<ChemicalTransaction[]>([]);

  const loadHistory = useCallback(async () => {
    try {
      const res = await authedFetch(`/api/chemicals/${chemicalId}/transaction`);
      if (res.ok) {
        const data = (await res.json()) as { items: ChemicalTransaction[] };
        setHistory(data.items);
      }
    } catch {
      /* non-fatal */
    }
  }, [chemicalId]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  async function apply(type: 'consume' | 'replenish') {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) return;
    setBusy(true);
    try {
      const res = await authedFetch(`/api/chemicals/${chemicalId}/transaction`, {
        method: 'POST',
        body: JSON.stringify({ type, amount: amt, reason: reason || undefined })
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? 'failed');
      }
      const result = (await res.json()) as { quantity: number };
      onQuantityChange?.(result.quantity);
      setAmount('');
      setReason('');
      toast.success(type === 'consume' ? t('consume') : t('replenish'));
      void loadHistory();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'failed';
      toast.error(msg === 'insufficient_quantity' ? 'Not enough in stock' : 'Transaction failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className='space-y-6'>
      <div className='rounded-lg border p-4'>
        <div className='flex flex-col gap-3 sm:flex-row sm:items-end'>
          <div className='flex-1'>
            <label className='text-muted-foreground mb-1 block text-xs'>
              {t('amount')} ({unit})
            </label>
            <Input
              type='number'
              step='any'
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder='0'
            />
          </div>
          <div className='flex-1'>
            <label className='text-muted-foreground mb-1 block text-xs'>{t('reason')}</label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <div className='flex gap-2'>
            <Button
              variant='outline'
              onClick={() => void apply('consume')}
              disabled={busy || !amount}
            >
              − {t('consume')}
            </Button>
            <Button onClick={() => void apply('replenish')} disabled={busy || !amount}>
              + {t('replenish')}
            </Button>
          </div>
        </div>
      </div>

      <div>
        <h3 className='mb-2 text-sm font-medium'>{t('history')}</h3>
        {history.length === 0 ? (
          <p className='text-muted-foreground text-sm'>{t('noHistory')}</p>
        ) : (
          <ul className='divide-border divide-y rounded-lg border text-sm'>
            {history.map((tx) => (
              <li key={tx.id} className='flex items-center justify-between px-4 py-2'>
                <span className='capitalize'>{tx.type}</span>
                <span className={tx.delta < 0 ? 'text-red-600' : 'text-green-600'}>
                  {tx.delta > 0 ? '+' : ''}
                  {tx.delta} {tx.unit}
                </span>
                <span className='text-muted-foreground text-xs'>
                  {new Date(tx.performedAt).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
