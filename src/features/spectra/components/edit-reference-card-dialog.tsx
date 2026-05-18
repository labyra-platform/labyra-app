/**
 * Edit reference card — PATCH metadata, peaks remain immutable.
 *
 * @phase R162-refcard-edit
 */
// R164-phase-6b: fetch URL migrated /api/reference-cards → /api/references
'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { getFirebaseAuth } from '@/lib/firebase/client';
import type { ReferenceCard } from '@/types/spectra';

interface EditReferenceCardDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  card: ReferenceCard;
  onUpdated?: (updated: ReferenceCard) => void;
}

export function EditReferenceCardDialog({
  open,
  onOpenChange,
  card,
  onUpdated
}: EditReferenceCardDialogProps) {
  const t = useTranslations('referenceCards');
  const [phaseName, setPhaseName] = useState(card.phaseName);
  const [formula, setFormula] = useState(card.formula ?? '');
  // R163-4c-2-narrow-edit: XRD-only fields. Non-XRD cards get empty defaults
  // until 4c-4 introduces per-type edit forms.
  const xrdCard = card.spectrumType === 'xrd' ? card : null;
  const [anode, setAnode] = useState(xrdCard?.anode ?? 'Cu');
  const [spaceGroup, setSpaceGroup] = useState(xrdCard?.spaceGroup ?? '');
  const [notes, setNotes] = useState(card.notes ?? '');
  const [submitting, setSubmitting] = useState(false);

  const handleSave = async () => {
    setSubmitting(true);
    try {
      const user = getFirebaseAuth().currentUser;
      if (!user) throw new Error('not_authenticated');
      const token = await user.getIdToken();
      const res = await fetch(`/api/references/${card.id}`, {
        method: 'PATCH',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          phaseName: phaseName.trim() || undefined,
          formula: formula.trim() || undefined,
          anode: anode.trim() || undefined,
          spaceGroup: spaceGroup.trim() || undefined,
          notes: notes.trim() || undefined
        })
      });
      if (!res.ok) throw new Error(await res.text());
      const updated = (await res.json()) as ReferenceCard;
      toast.success(t('toastUpdated'));
      onUpdated?.(updated);
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('editTitle')}</DialogTitle>
          <DialogDescription>{t('editHint')}</DialogDescription>
        </DialogHeader>
        <div className='space-y-4'>
          <div className='space-y-2'>
            <Label htmlFor='ref-phase'>{t('col.phase')}</Label>
            <Input
              id='ref-phase'
              value={phaseName}
              onChange={(e) => setPhaseName(e.target.value)}
              maxLength={200}
            />
          </div>
          <div className='grid grid-cols-2 gap-3'>
            <div className='space-y-2'>
              <Label htmlFor='ref-formula'>{t('col.formula')}</Label>
              <Input
                id='ref-formula'
                value={formula}
                onChange={(e) => setFormula(e.target.value)}
                maxLength={100}
                placeholder='e.g. WO3'
              />
            </div>
            <div className='space-y-2'>
              <Label htmlFor='ref-anode'>{t('col.anode')}</Label>
              <Input
                id='ref-anode'
                value={anode}
                onChange={(e) => setAnode(e.target.value)}
                maxLength={20}
                placeholder='Cu'
              />
            </div>
          </div>
          <div className='space-y-2'>
            <Label htmlFor='ref-spacegroup'>{t('col.spaceGroup')}</Label>
            <Input
              id='ref-spacegroup'
              value={spaceGroup}
              onChange={(e) => setSpaceGroup(e.target.value)}
              maxLength={50}
              placeholder='e.g. P-1, P21/n'
            />
          </div>
          <div className='space-y-2'>
            <Label htmlFor='ref-notes'>{t('notes')}</Label>
            <Textarea
              id='ref-notes'
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={2000}
              rows={4}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant='outline' onClick={() => onOpenChange(false)} disabled={submitting}>
            {t('cancel')}
          </Button>
          <Button onClick={handleSave} disabled={submitting}>
            {submitting ? t('saving') : t('save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
