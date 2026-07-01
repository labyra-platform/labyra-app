/**
 * Import-structure dialog — build a crystal structure from a Materials Project
 * id, CIF, or POSCAR (worker /dft/structure gateway) and add it to the library.
 *
 * @phase R318-crystal-structures
 */
'use client';

import { IconLoader2, IconPlus } from '@tabler/icons-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { MpSearchPanel } from '@/features/crystal-structures/components/mp-search-panel';
import { useRouter } from '@/i18n/navigation';

type Source = 'mp_id' | 'cif' | 'poscar';

export function ImportStructureDialog() {
  const t = useTranslations('structures');
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState<Source>('mp_id');
  const [mpId, setMpId] = useState('');
  const [cifText, setCifText] = useState('');
  const [poscarText, setPoscarText] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  const filled =
    source === 'mp_id'
      ? mpId.trim() !== ''
      : source === 'cif'
        ? cifText.trim() !== ''
        : poscarText.trim() !== '';
  const canImport = !busy && filled;

  async function submit() {
    if (!canImport) return;
    setBusy(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/structures/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source,
          mpId: mpId.trim() || undefined,
          cifText: cifText || undefined,
          poscarText: poscarText || undefined,
          name: name.trim() || undefined
        })
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setFeedback({ ok: false, text: data.error ?? t('importFailed') });
        return;
      }
      setOpen(false);
      setMpId('');
      setCifText('');
      setPoscarText('');
      setName('');
      router.refresh();
    } catch {
      setFeedback({ ok: false, text: t('importFailed') });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size='sm'>
          <IconPlus className='mr-1 size-4' />
          {t('importTitle')}
        </Button>
      </DialogTrigger>
      <DialogContent className='sm:max-w-2xl'>
        <DialogHeader>
          <DialogTitle>{t('importTitle')}</DialogTitle>
          <DialogDescription>{t('importDescription')}</DialogDescription>
        </DialogHeader>

        <Tabs value={source} onValueChange={(v) => setSource(v as Source)}>
          <TabsList className='grid w-full grid-cols-3'>
            <TabsTrigger value='mp_id'>{t('tabMp')}</TabsTrigger>
            <TabsTrigger value='cif'>CIF</TabsTrigger>
            <TabsTrigger value='poscar'>POSCAR</TabsTrigger>
          </TabsList>

          <TabsContent value='mp_id' className='space-y-3'>
            <div className='space-y-1.5'>
              <Label htmlFor='mp-id'>{t('mpIdLabel')}</Label>
              <Input
                id='mp-id'
                value={mpId}
                onChange={(e) => setMpId(e.target.value)}
                placeholder='mp-1821'
              />
              <p className='text-muted-foreground text-xs'>{t('mpIdHint')}</p>
            </div>
            <div className='space-y-1.5'>
              <Label>{t('mpSearchLabel')}</Label>
              <MpSearchPanel
                selectedId={mpId.trim()}
                onSelect={(id, formula) => {
                  setMpId(id);
                  if (name.trim() === '') setName(formula);
                }}
              />
            </div>
          </TabsContent>

          <TabsContent value='cif' className='space-y-1.5'>
            <Label htmlFor='cif-text'>{t('cifLabel')}</Label>
            <Textarea
              id='cif-text'
              value={cifText}
              onChange={(e) => setCifText(e.target.value)}
              placeholder='data_...'
              className='h-40 font-mono text-xs'
            />
          </TabsContent>

          <TabsContent value='poscar' className='space-y-1.5'>
            <Label htmlFor='poscar-text'>{t('poscarLabel')}</Label>
            <Textarea
              id='poscar-text'
              value={poscarText}
              onChange={(e) => setPoscarText(e.target.value)}
              placeholder={'Mo1 S2\n1.0\n...'}
              className='h-40 font-mono text-xs'
            />
          </TabsContent>
        </Tabs>

        <div className='space-y-1.5'>
          <Label htmlFor='struct-name'>{t('nameLabel')}</Label>
          <Input
            id='struct-name'
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('namePlaceholder')}
          />
        </div>

        {feedback ? (
          <p className={feedback.ok ? 'text-xs text-emerald-600' : 'text-destructive text-xs'}>
            {feedback.text}
          </p>
        ) : null}

        <DialogFooter>
          <Button onClick={submit} disabled={!canImport}>
            {busy ? <IconLoader2 className='mr-1 size-4 animate-spin' /> : null}
            {t('importAction')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
