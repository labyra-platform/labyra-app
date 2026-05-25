'use client';

/**
 * Edit measurement/spectrum dialog (R207, kebab layer 2).
 * PATCHes /api/measurements/{id}. Edits safe user-owned fields only:
 *   - instrument (free text)
 *   - measuredAt (datetime)
 * System fields (filename, sha256, storage, status) are NOT editable here.
 * Realtime listener refreshes the row on success.
 */
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
import { getFirebaseAuth } from '@/lib/firebase/client';
import { DateTimePicker } from '@/features/bookings/components/datetime-picker';

interface EditSpectrumDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  id: string;
  instrument: string | undefined;
  measuredAt: number | undefined;
}

export function EditSpectrumDialog({
  open,
  onOpenChange,
  id,
  instrument: initialInstrument,
  measuredAt: initialMeasuredAt
}: EditSpectrumDialogProps) {
  const t = useTranslations('spectra');
  const [instrument, setInstrument] = useState(initialInstrument ?? '');
  const [measuredAtMs, setMeasuredAtMs] = useState<number | undefined>(initialMeasuredAt);
  const [submitting, setSubmitting] = useState(false);

  const handleSave = async () => {
    setSubmitting(true);
    try {
      const user = getFirebaseAuth().currentUser;
      if (!user) throw new Error('not_authenticated');
      const token = await user.getIdToken();
      const res = await fetch(`/api/measurements/${id}`, {
        method: 'PATCH',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          instrument: instrument.trim() || undefined,
          ...(measuredAtMs ? { measuredAt: measuredAtMs } : {})
        })
      });
      if (!res.ok) throw new Error(await res.text());
      toast.success(t('toastUpdated'));
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
            <Label htmlFor='spec-instrument'>{t('instrument')}</Label>
            <Input
              id='spec-instrument'
              value={instrument}
              onChange={(e) => setInstrument(e.target.value)}
              maxLength={200}
              placeholder='e.g. Bruker D8 Advance'
            />
          </div>
          <div className='space-y-2'>
            <Label htmlFor='spec-measured'>{t('colMeasuredAt')}</Label>
            <DateTimePicker value={measuredAtMs} onChange={setMeasuredAtMs} />
          </div>
        </div>
        <DialogFooter>
          <Button variant='outline' onClick={() => onOpenChange(false)} disabled={submitting}>
            {t('cancel')}
          </Button>
          <Button onClick={() => void handleSave()} disabled={submitting}>
            {submitting ? t('saving') : t('save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
