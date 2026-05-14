/**
 * AddReferenceCardDialog — Modal to paste + parse + save XRD reference card.
 *
 * Flow:
 * 1. User paste text (HighScore/PDF format)
 * 2. Client-side parse via parseReferenceCard()
 * 3. Preview parsed peaks
 * 4. Submit → POST /api/reference-cards
 *
 * Security: server validates Zod schema; this is UX only.
 *
 * @phase R160-spectra-4a-pdf
 */
'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { parseReferenceCard, type ParsedReferenceCard } from '@/lib/spectra/parse-reference-card';
import { getFirebaseAuth } from '@/lib/firebase/client';
import { SciText } from '@/features/spectra/utils/format-units';

interface AddReferenceCardDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: () => void;
}

export function AddReferenceCardDialog({
  open,
  onOpenChange,
  onCreated
}: AddReferenceCardDialogProps) {
  const t = useTranslations('spectra');
  const [text, setText] = useState('');
  const [parseError, setParseError] = useState<string | null>(null);
  const [preview, setPreview] = useState<ParsedReferenceCard | null>(null);
  const [anode, setAnode] = useState('Cu');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleParse = () => {
    setParseError(null);
    setPreview(null);
    try {
      const result = parseReferenceCard(text);
      setPreview(result);
    } catch (err) {
      setParseError(err instanceof Error ? err.message : 'Parse failed');
    }
  };

  const handleSubmit = async () => {
    if (!preview) return;
    setSubmitting(true);
    try {
      const user = getFirebaseAuth().currentUser;
      if (!user) throw new Error('Not authenticated');
      const token = await user.getIdToken();

      const res = await fetch('/api/reference-cards', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          cardNumber: preview.cardNumber,
          phaseName: preview.phaseName,
          formula: preview.formula || undefined,
          anode,
          peaks: preview.peaks,
          notes: notes || undefined
        })
      });

      if (!res.ok) {
        const errBody = await res.text();
        throw new Error(`Server rejected: ${errBody.slice(0, 200)}`);
      }

      toast.success(t.has('referenceCardSaved') ? t('referenceCardSaved') : 'Reference card saved');
      setText('');
      setPreview(null);
      setNotes('');
      onCreated?.();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='max-w-2xl max-h-[85vh] overflow-y-auto'>
        <DialogHeader>
          <DialogTitle>
            {t.has('addReferenceCard') ? t('addReferenceCard') : 'Add Reference Card'}
          </DialogTitle>
          <DialogDescription>
            {t.has('referenceCardHelp')
              ? t('referenceCardHelp')
              : 'Paste XRD reference card from HighScore Plus or PDF database. Format: "2θ d-spacing intensity hkl" per peak line.'}
          </DialogDescription>
        </DialogHeader>

        <div className='space-y-4'>
          <div>
            <Label htmlFor='ref-text'>
              {t.has('pasteText') ? t('pasteText') : 'Paste reference card text'}
            </Label>
            <Textarea
              id='ref-text'
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={`PDF-2 33-1387
WO3 monoclinic
23.117  3.844  100  002
23.586  3.768   95  020
24.348  3.652   90  200
...`}
              rows={10}
              className='font-mono text-xs'
              maxLength={50_000}
            />
            <div className='mt-2 flex gap-2'>
              <Button type='button' variant='outline' size='sm' onClick={handleParse}>
                {t.has('parsePreview') ? t('parsePreview') : 'Parse & Preview'}
              </Button>
            </div>
            {parseError && (
              <div className='mt-2 rounded-md border border-destructive/50 bg-destructive/10 p-2 text-xs text-destructive'>
                {parseError}
              </div>
            )}
          </div>

          {preview && (
            <div className='rounded-md border bg-card p-3 text-sm space-y-2'>
              <div className='flex flex-wrap gap-x-6 gap-y-1'>
                <div>
                  <strong>Card:</strong> {preview.cardNumber}
                </div>
                <div>
                  <strong>Phase:</strong> <SciText>{preview.phaseName}</SciText>
                </div>
                <div>
                  <strong>Formula:</strong>{' '}
                  {preview.formula ? <SciText>{preview.formula}</SciText> : '—'}
                </div>
                <div>
                  <strong>Schema:</strong> <code className='text-xs'>{preview.schemaDetected}</code>
                </div>
                <div>
                  <strong>Peaks:</strong> {preview.nPeaks}
                </div>
              </div>
              <div className='max-h-40 overflow-y-auto rounded-md border'>
                <table className='w-full text-xs'>
                  <thead className='sticky top-0 bg-muted'>
                    <tr>
                      <th className='px-2 py-1 text-left'>2θ (°)</th>
                      <th className='px-2 py-1 text-left'>d (Å)</th>
                      <th className='px-2 py-1 text-left'>I (%)</th>
                      <th className='px-2 py-1 text-left'>hkl</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.peaks.map((p, i) => (
                      <tr key={`${p.twoTheta}-${i}`} className='border-t'>
                        <td className='px-2 py-1'>{p.twoTheta}</td>
                        <td className='px-2 py-1'>{p.dSpacing ?? '—'}</td>
                        <td className='px-2 py-1'>{p.intensity}</td>
                        <td className='px-2 py-1 font-mono'>{p.hkl ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className='grid grid-cols-2 gap-2 pt-2'>
                <div>
                  <Label htmlFor='anode'>Anode</Label>
                  <Input
                    id='anode'
                    value={anode}
                    onChange={(e) => setAnode(e.target.value)}
                    placeholder='Cu'
                    className='h-8 text-xs'
                    maxLength={4}
                  />
                </div>
                <div>
                  <Label htmlFor='notes'>Notes</Label>
                  <Input
                    id='notes'
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder='Optional'
                    className='h-8 text-xs'
                    maxLength={1000}
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant='outline' onClick={() => onOpenChange(false)} disabled={submitting}>
            {t.has('cancel') ? t('cancel') : 'Cancel'}
          </Button>
          <Button onClick={handleSubmit} disabled={!preview || submitting}>
            {submitting
              ? t.has('saving')
                ? t('saving')
                : 'Saving…'
              : t.has('save')
                ? t('save')
                : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
