/**
 * Lifecycle action buttons for entity detail pages.
 *
 * Shows:
 *   - active → [Deprecate] [Retract...] buttons
 *   - deprecated → [Reactivate] [Retract...] buttons
 *   - retracted → no actions (immutable per ADR-016)
 *
 * @phase R164-phase-7
 */
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { getAuth } from 'firebase/auth';
import { IconArchive, IconAlertOctagon, IconRotateClockwise } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from '@/components/ui/alert-dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import type { LifecycleStatus } from '@/types/prov-base';

interface LifecycleActionsProps {
  /** API path segment, e.g. 'materials', 'samples', 'experiments'. */
  entity:
    | 'materials'
    | 'samples'
    | 'experiments'
    | 'references'
    | 'measurements'
    | 'analyses'
    | 'papers';
  id: string;
  status: LifecycleStatus;
  /** i18n namespace for entity labels (e.g. 'materials'). Defaults to entity. */
  i18nNamespace?: string;
}

export function LifecycleActions({ entity, id, status, i18nNamespace }: LifecycleActionsProps) {
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations('lifecycle');
  const tEntity = useTranslations(i18nNamespace ?? entity);
  const [retractReason, setRetractReason] = useState('');
  const [busy, setBusy] = useState(false);

  async function callApi(method: string, path: string, body?: unknown): Promise<Response> {
    const user = getAuth().currentUser;
    if (!user) throw new Error('not_authenticated');
    const token = await user.getIdToken();
    return fetch(path, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        ...(body ? { 'Content-Type': 'application/json' } : {})
      },
      body: body ? JSON.stringify(body) : undefined
    });
  }

  async function handleDeprecate() {
    setBusy(true);
    try {
      const res = await callApi('DELETE', `/api/${entity}/${id}`);
      if (!res.ok) throw new Error(await res.text());
      toast.success(t('deprecated'));
      router.push(`/${locale}/dashboard/${entity}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('errorGeneric'));
    } finally {
      setBusy(false);
    }
  }

  async function handleRetract() {
    if (!retractReason.trim()) {
      toast.error(t('retractReasonRequired'));
      return;
    }
    setBusy(true);
    try {
      const res = await callApi('POST', `/api/${entity}/${id}/retract`, {
        reason: retractReason.trim()
      });
      if (!res.ok) throw new Error(await res.text());
      toast.success(t('retracted'));
      router.push(`/${locale}/dashboard/${entity}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('errorGeneric'));
    } finally {
      setBusy(false);
    }
  }

  async function handleReactivate() {
    setBusy(true);
    try {
      const res = await callApi('POST', `/api/${entity}/${id}/reactivate`);
      if (!res.ok) {
        if (res.status === 409) throw new Error(t('cannotReactivateRetracted'));
        throw new Error(await res.text());
      }
      toast.success(t('reactivated'));
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('errorGeneric'));
    } finally {
      setBusy(false);
    }
  }

  if (status === 'retracted') {
    // Retracted is immutable — no actions
    return <div className='text-sm text-muted-foreground italic'>{t('retractedNotice')}</div>;
  }

  return (
    <div className='flex flex-wrap gap-2'>
      {status === 'deprecated' && (
        <Button variant='outline' size='sm' onClick={handleReactivate} disabled={busy}>
          <IconRotateClockwise className='mr-2 h-4 w-4' />
          {t('reactivate')}
        </Button>
      )}

      {status === 'active' && (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant='outline' size='sm' disabled={busy}>
              <IconArchive className='mr-2 h-4 w-4' />
              {t('deprecate')}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t('deprecateConfirmTitle')}</AlertDialogTitle>
              <AlertDialogDescription>{t('deprecateConfirmDesc')}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
              <AlertDialogAction onClick={handleDeprecate}>{t('deprecate')}</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant='destructive' size='sm' disabled={busy}>
            <IconAlertOctagon className='mr-2 h-4 w-4' />
            {t('retract')}…
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('retractConfirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('retractConfirmDesc')}</AlertDialogDescription>
          </AlertDialogHeader>
          <div className='space-y-2'>
            <Label htmlFor='retract-reason'>{t('retractReasonLabel')}</Label>
            <Textarea
              id='retract-reason'
              value={retractReason}
              onChange={(e) => setRetractReason(e.target.value)}
              placeholder={t('retractReasonPlaceholder')}
              rows={3}
              maxLength={500}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setRetractReason('')}>
              {t('cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRetract}
              className='bg-destructive text-destructive-foreground hover:bg-destructive/90'
            >
              {t('retract')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
