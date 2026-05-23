'use client';
import { useTranslations } from 'next-intl';
import { IconShieldCheck, IconLoader2, IconAlertTriangle } from '@tabler/icons-react';
import { useState } from 'react';
import { getFirebaseAuth } from '@/lib/firebase/client';
import { cn } from '@/lib/utils';

type Verdict = 'supported' | 'partially_supported' | 'unsupported' | 'contradicted';

interface AuditFinding {
  claim: string;
  type: string;
  verdict: Verdict;
  confidence: number;
  reasoning: string;
}
interface AuditResult {
  findings: AuditFinding[];
  overallConfidence: number;
  supportedCount: number;
  unsupportedCount: number;
  contradictedCount: number;
}

const VERDICT_STYLE: Record<Verdict, string> = {
  supported: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  partially_supported: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  unsupported: 'bg-orange-500/10 text-orange-600 dark:text-orange-400',
  contradicted: 'bg-red-500/10 text-red-600 dark:text-red-400'
};

async function authToken(): Promise<string> {
  const user = getFirebaseAuth().currentUser;
  if (!user) throw new Error('not_authenticated');
  return user.getIdToken();
}

export function AuditPanel({
  messageId,
  conversationId
}: {
  messageId: string;
  conversationId: string;
}) {
  const t = useTranslations('ai.audit');
  const [audit, setAudit] = useState<AuditResult | null>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'running' | 'error'>('idle');
  const [loaded, setLoaded] = useState(false);

  // Load cached audit on first expand.
  async function loadCached() {
    if (loaded) return;
    setState('loading');
    try {
      const token = await authToken();
      const res = await fetch(
        `/api/messages/${messageId}/audit?conversationId=${encodeURIComponent(conversationId)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const data = await res.json();
      if (data.audit) setAudit(data.audit as AuditResult);
      setState('idle');
    } catch {
      setState('error');
    } finally {
      setLoaded(true);
    }
  }

  async function runAudit() {
    setState('running');
    try {
      const token = await authToken();
      const res = await fetch(`/api/messages/${messageId}/audit`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId })
      });
      if (!res.ok) {
        setState('error');
        return;
      }
      setAudit((await res.json()) as AuditResult);
      setState('idle');
    } catch {
      setState('error');
    }
  }

  // Trigger cached load when mounted.
  if (!loaded && state === 'idle') {
    void loadCached();
  }

  return (
    <div className='mt-2 rounded-lg border bg-background/40 p-3 text-xs'>
      {state === 'loading' && (
        <span className='text-muted-foreground flex items-center gap-1.5'>
          <IconLoader2 className='size-3.5 animate-spin' /> {t('loading')}
        </span>
      )}

      {state === 'error' && (
        <span className='text-destructive flex items-center gap-1.5'>
          <IconAlertTriangle className='size-3.5' /> {t('error')}
        </span>
      )}

      {state !== 'loading' && !audit && state !== 'running' && (
        <button
          type='button'
          onClick={runAudit}
          className='text-muted-foreground hover:text-foreground flex items-center gap-1.5'
        >
          <IconShieldCheck className='size-3.5' /> {t('runAudit')}
        </button>
      )}

      {state === 'running' && (
        <span className='text-muted-foreground flex items-center gap-1.5'>
          <IconLoader2 className='size-3.5 animate-spin' /> {t('running')}
        </span>
      )}

      {audit && (
        <div className='space-y-2'>
          <div className='flex flex-wrap items-center gap-2'>
            <span className='font-medium'>{t('title')}</span>
            <span className='text-emerald-600 dark:text-emerald-400'>
              {t('supported', { n: audit.supportedCount })}
            </span>
            <span className='text-orange-600 dark:text-orange-400'>
              {t('unsupported', { n: audit.unsupportedCount })}
            </span>
            <span className='text-red-600 dark:text-red-400'>
              {t('contradicted', { n: audit.contradictedCount })}
            </span>
            <span className='text-muted-foreground ml-auto'>
              {t('overall', { pct: Math.round(audit.overallConfidence * 100) })}
            </span>
          </div>
          <ul className='space-y-1.5'>
            {audit.findings.map((f, i) => (
              <li key={i} className='rounded-md border bg-background p-2'>
                <div className='flex items-center gap-2'>
                  <span
                    className={cn(
                      'rounded px-1.5 py-0.5 text-[10px] font-medium',
                      VERDICT_STYLE[f.verdict]
                    )}
                  >
                    {t(`verdict.${f.verdict}`)}
                  </span>
                  <span className='text-muted-foreground'>
                    {t('confidence', { pct: Math.round(f.confidence * 100) })}
                  </span>
                </div>
                <p className='mt-1 font-medium'>{f.claim}</p>
                <p className='text-muted-foreground mt-0.5'>{f.reasoning}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
