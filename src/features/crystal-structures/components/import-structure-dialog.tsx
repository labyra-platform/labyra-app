/**
 * Import-structure dialog — build a crystal structure from a Materials Project
 * id, CIF, or POSCAR (worker /dft/structure gateway) and add it to the library.
 *
 * @phase R318-crystal-structures
 */
'use client';

import { IconLoader2, IconPlus, IconUpload } from '@tabler/icons-react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { MpSearchPanel } from '@/features/crystal-structures/components/mp-search-panel';
import { cn } from '@/lib/utils';
import { useRouter } from '@/i18n/navigation';

type Source = 'mp_id' | 'file';
type FileFormat = 'cif' | 'poscar';

export function ImportStructureDialog() {
  const t = useTranslations('structures');
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState<Source>('mp_id');
  const [mpId, setMpId] = useState('');
  const [fileFormat, setFileFormat] = useState<FileFormat>('cif');
  const [fileText, setFileText] = useState('');
  const [fileName, setFileName] = useState('');
  const [dragging, setDragging] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  const filled = source === 'mp_id' ? mpId.trim() !== '' : fileText.trim() !== '';
  const canImport = !busy && filled;

  // Read a dropped/selected file into the text area, and guess the format from
  // its name (POSCAR/CONTCAR/.vasp → poscar; .cif → cif).
  const readFile = (file: File) => {
    setFileName(file.name);
    const lower = file.name.toLowerCase();
    if (lower.endsWith('.cif')) setFileFormat('cif');
    else if (lower.endsWith('.vasp') || lower.includes('poscar') || lower.includes('contcar'))
      setFileFormat('poscar');
    const reader = new FileReader();
    reader.addEventListener('load', () => setFileText(String(reader.result ?? '')));
    reader.readAsText(file);
  };

  async function submit() {
    if (!canImport) return;
    setBusy(true);
    setFeedback(null);
    try {
      const effectiveSource = source === 'mp_id' ? 'mp_id' : fileFormat;
      const res = await fetch('/api/structures/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: effectiveSource,
          mpId: mpId.trim() || undefined,
          cifText: fileFormat === 'cif' ? fileText || undefined : undefined,
          poscarText: fileFormat === 'poscar' ? fileText || undefined : undefined,
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
      setFileText('');
      setFileName('');
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
          <TabsList className='grid w-full grid-cols-2'>
            <TabsTrigger value='mp_id'>{t('tabMp')}</TabsTrigger>
            <TabsTrigger value='file'>{t('tabFile')}</TabsTrigger>
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

          <TabsContent value='file' className='space-y-3'>
            <div className='flex items-center gap-2'>
              <Label className='shrink-0'>{t('fileFormatLabel')}</Label>
              <Select value={fileFormat} onValueChange={(v) => setFileFormat(v as FileFormat)}>
                <SelectTrigger className='w-44'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='cif'>CIF</SelectItem>
                  <SelectItem value='poscar'>POSCAR / VASP</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <label
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                const f = e.dataTransfer.files?.[0];
                if (f) readFile(f);
              }}
              className={cn(
                'flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed px-4 py-6 text-center transition-colors',
                dragging ? 'border-primary bg-primary/5' : 'hover:bg-muted/40'
              )}
            >
              <IconUpload className='text-muted-foreground size-6' />
              <span className='text-sm font-medium'>{t('fileDropTitle')}</span>
              <span className='text-muted-foreground text-xs'>{t('fileDropHint')}</span>
              {fileName ? (
                <span className='text-primary mt-1 font-mono text-xs'>{fileName}</span>
              ) : null}
              <input
                type='file'
                aria-label={t('fileDropTitle')}
                accept='.cif,.vasp,.poscar,.txt,POSCAR,CONTCAR'
                className='hidden'
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) readFile(f);
                }}
              />
            </label>

            <div className='space-y-1.5'>
              <Label htmlFor='file-text'>{t('fileOrPasteLabel')}</Label>
              <Textarea
                id='file-text'
                value={fileText}
                onChange={(e) => {
                  setFileText(e.target.value);
                  if (fileName) setFileName('');
                }}
                placeholder={fileFormat === 'cif' ? 'data_...' : 'POSCAR / VASP'}
                className='h-36 font-mono text-xs'
              />
            </div>
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
