'use client';

/**
 * EchemParamsDialog — capture/edit the electrochemistry measurement conditions
 * (electrode area, reference electrode, pH, reaction, iR-correction, scan rate,
 * n electrons) and re-run analysis with them. This is the "Re-analyze" flow:
 * it changes the SCIENCE (overpotential, Tafel slope, current density), kept
 * deliberately separate from "Edit figure" which only changes aesthetics.
 * @phase R213 (electrochemistry parameters + re-analyze)
 */

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Icons } from '@/components/icons';
import { getFirebaseAuth } from '@/lib/firebase/client';

type EchemType = 'tafel' | 'lsv' | 'cv' | 'eis';

const REFERENCE_ELECTRODES = [
  { value: 'ag/agcl', label: 'Ag/AgCl (sat. KCl)' },
  { value: 'ag/agcl_3m_kcl', label: 'Ag/AgCl (3M KCl)' },
  { value: 'sce', label: 'SCE (sat. calomel)' },
  { value: 'hg/hgo', label: 'Hg/HgO (1M, alkaline)' },
  { value: 'rhe', label: 'RHE' },
  { value: 'she', label: 'SHE / NHE' }
];

export interface EchemParams {
  electrodeArea?: number;
  referenceElectrode?: string;
  pH?: number;
  reaction?: string;
  irCorrected?: boolean;
  scanRate?: number;
  nElectrons?: number;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  measurementId: string;
  spectrumType: EchemType;
  initial?: EchemParams;
  onQueued?: () => void;
}

function numOrUndef(s: string): number | undefined {
  if (s.trim() === '') return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

export function EchemParamsDialog({
  open,
  onOpenChange,
  measurementId,
  spectrumType,
  initial,
  onQueued
}: Props) {
  const [area, setArea] = useState(initial?.electrodeArea?.toString() ?? '');
  const [reference, setReference] = useState(initial?.referenceElectrode ?? '');
  const [ph, setPh] = useState(initial?.pH?.toString() ?? '');
  const [reaction, setReaction] = useState(initial?.reaction ?? '');
  const [irCorrected, setIrCorrected] = useState(initial?.irCorrected ?? false);
  const [scanRate, setScanRate] = useState(initial?.scanRate?.toString() ?? '');
  const [nElectrons, setNElectrons] = useState(initial?.nElectrons?.toString() ?? '');
  const [submitting, setSubmitting] = useState(false);

  // Which conditions matter for which technique.
  const showReaction = spectrumType === 'lsv' || spectrumType === 'tafel';
  const showRefPh = spectrumType === 'lsv' || spectrumType === 'tafel';
  const showIr = spectrumType === 'lsv' || spectrumType === 'tafel';
  const showScanRate = spectrumType === 'cv';
  const showNElectrons = spectrumType === 'cv' || spectrumType === 'eis';

  async function handleSubmit(): Promise<void> {
    setSubmitting(true);
    try {
      const user = getFirebaseAuth().currentUser;
      if (!user) throw new Error('Not authenticated');
      const token = await user.getIdToken();
      const metadata: EchemParams = {
        electrodeArea: numOrUndef(area),
        referenceElectrode: reference || undefined,
        pH: numOrUndef(ph),
        reaction: reaction || undefined,
        irCorrected,
        scanRate: numOrUndef(scanRate),
        nElectrons: numOrUndef(nElectrons)
      };
      const res = await fetch(`/api/measurements/${measurementId}/reanalyze`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ metadata })
      });
      if (!res.ok) throw new Error(await res.text());
      toast.success('Re-analysis queued with new parameters. Results update in ~30s.');
      onQueued?.();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Re-analyze failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-md'>
        <DialogHeader>
          <DialogTitle>Measurement parameters</DialogTitle>
          <DialogDescription>
            Set the experimental conditions, then re-analyze. These change the computed results
            (overpotential, Tafel slope, current density) — not the figure styling.
          </DialogDescription>
        </DialogHeader>

        <div className='space-y-4 py-2'>
          <div className='space-y-1.5'>
            <Label htmlFor='area'>Electrode area (cm²)</Label>
            <Input
              id='area'
              type='number'
              inputMode='decimal'
              placeholder='e.g. 0.196'
              value={area}
              onChange={(e) => setArea(e.target.value)}
            />
            <p className='text-xs text-muted-foreground'>Required for current density (mA/cm²).</p>
          </div>

          {showReaction ? (
            <div className='space-y-1.5'>
              <Label>Reaction</Label>
              <Select value={reaction} onValueChange={setReaction}>
                <SelectTrigger>
                  <SelectValue placeholder='Select HER or OER' />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='her'>HER (hydrogen evolution)</SelectItem>
                  <SelectItem value='oer'>OER (oxygen evolution)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          ) : null}

          {showRefPh ? (
            <div className='grid grid-cols-2 gap-3'>
              <div className='space-y-1.5'>
                <Label>Reference electrode</Label>
                <Select value={reference} onValueChange={setReference}>
                  <SelectTrigger>
                    <SelectValue placeholder='Select' />
                  </SelectTrigger>
                  <SelectContent>
                    {REFERENCE_ELECTRODES.map((r) => (
                      <SelectItem key={r.value} value={r.value}>
                        {r.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className='space-y-1.5'>
                <Label htmlFor='ph'>pH</Label>
                <Input
                  id='ph'
                  type='number'
                  inputMode='decimal'
                  placeholder='e.g. 14'
                  value={ph}
                  onChange={(e) => setPh(e.target.value)}
                />
              </div>
            </div>
          ) : null}

          {showIr ? (
            <div className='flex items-center justify-between rounded-md border p-3'>
              <div className='space-y-0.5'>
                <Label htmlFor='ir'>iR-corrected</Label>
                <p className='text-xs text-muted-foreground'>
                  Enable if the data is already iR-compensated.
                </p>
              </div>
              <Switch id='ir' checked={irCorrected} onCheckedChange={setIrCorrected} />
            </div>
          ) : null}

          {showScanRate ? (
            <div className='space-y-1.5'>
              <Label htmlFor='scan'>Scan rate (V/s)</Label>
              <Input
                id='scan'
                type='number'
                inputMode='decimal'
                placeholder='e.g. 0.05'
                value={scanRate}
                onChange={(e) => setScanRate(e.target.value)}
              />
            </div>
          ) : null}

          {showNElectrons ? (
            <div className='space-y-1.5'>
              <Label htmlFor='ne'>Number of electrons (n)</Label>
              <Input
                id='ne'
                type='number'
                inputMode='numeric'
                placeholder='e.g. 1'
                value={nElectrons}
                onChange={(e) => setNElectrons(e.target.value)}
              />
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant='outline' onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            <Icons.refresh className='mr-1.5 size-4' />
            {submitting ? 'Queuing…' : 'Re-analyze'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
