/**
 * AddReferenceCardDialog — Multi-spectrum-type reference card creation.
 *
 * Supports XRD / FTIR / Raman / UV-Vis. User picks type via tabs, pastes
 * text, parses via type-specific parser, fills extra fields, submits.
 *
 * Auto-detect: if pasted text has recognizable header (e.g. "Wavenumber"
 * for FTIR), tab switches automatically.
 *
 * @phase R163-spectra-4c-4b
 */
// R164-phase-6b: fetch URL migrated /api/reference-cards → /api/references
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { parseReferenceCard, type ParsedReferenceCard } from '@/lib/spectra/parse-reference-card';
import {
  parseFTIRReferenceCard,
  parseRamanReferenceCard,
  parseUVVisReferenceCard,
  detectSpectrumType,
  type ParsedMultiReferenceCard
} from '@/lib/spectra/parse-reference-card-multi';
import { getFirebaseAuth } from '@/lib/firebase/client';
import { SciText } from '@/features/spectra/utils/format-units';
import type { SpectrumTypeRefCard } from '@/types/spectra';

interface AddReferenceCardDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: () => void;
}

type AnyParsed = ParsedReferenceCard | ParsedMultiReferenceCard;

export function AddReferenceCardDialog({
  open,
  onOpenChange,
  onCreated
}: AddReferenceCardDialogProps) {
  const t = useTranslations('spectra');
  const [spectrumType, setSpectrumType] = useState<SpectrumTypeRefCard>('xrd');
  const [text, setText] = useState('');
  const [parseError, setParseError] = useState<string | null>(null);
  const [preview, setPreview] = useState<AnyParsed | null>(null);
  // Per-type extra fields
  const [anode, setAnode] = useState('Cu');
  const [spaceGroup, setSpaceGroup] = useState('');
  const [mode, setMode] = useState<'transmittance' | 'absorbance'>('absorbance');
  const [laserWavelength, setLaserWavelength] = useState('532');
  const [solvent, setSolvent] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Auto-detect on text change (debounced effect skipped — fires only on paste/blur)
  const handleTextChange = (val: string) => {
    setText(val);
    setPreview(null);
    setParseError(null);
    // Auto-switch type if header keyword detected
    if (val.length > 20) {
      const detected = detectSpectrumType(val);
      if (detected.type && detected.type !== spectrumType) {
        setSpectrumType(detected.type);
        toast.info(
          t.has('autoDetected')
            ? t('autoDetected', { type: detected.type.toUpperCase() })
            : `Auto-detected: ${detected.type.toUpperCase()}`
        );
      }
    }
  };

  const handleParse = () => {
    setParseError(null);
    setPreview(null);
    try {
      let result: AnyParsed;
      switch (spectrumType) {
        case 'xrd':
          result = parseReferenceCard(text);
          break;
        case 'ftir':
          result = parseFTIRReferenceCard(text);
          break;
        case 'raman':
          result = parseRamanReferenceCard(text);
          break;
        case 'uvvis':
          result = parseUVVisReferenceCard(text);
          break;
      }
      if (result.nPeaks === 0) {
        setParseError(t.has('noPeaksFound') ? t('noPeaksFound') : 'No peaks found — check format');
        return;
      }
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

      // Build payload matching backend discriminated union
      const base = {
        cardNumber: preview.cardNumber,
        phaseName: preview.phaseName,
        formula: preview.formula || undefined,
        notes: notes || undefined,
        peaks: preview.peaks
      };
      let payload: Record<string, unknown>;
      switch (spectrumType) {
        case 'xrd':
          payload = {
            ...base,
            spectrumType: 'xrd',
            anode: anode || undefined,
            spaceGroup: spaceGroup || undefined
          };
          break;
        case 'ftir':
          payload = { ...base, spectrumType: 'ftir', mode };
          break;
        case 'raman':
          payload = {
            ...base,
            spectrumType: 'raman',
            laserWavelength: laserWavelength ? Number(laserWavelength) : undefined
          };
          break;
        case 'uvvis':
          payload = { ...base, spectrumType: 'uvvis', solvent: solvent || undefined };
          break;
      }

      const res = await fetch('/api/references', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload)
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

  // Placeholder text per spectrum type
  const placeholders: Record<SpectrumTypeRefCard, string> = {
    xrd: `PDF-2 33-1387\nWO3 monoclinic\n23.117  3.844  100  002\n23.586  3.768   95  020\n...`,
    ftir: `SiO2 silica IR (Smith 2020)\nWavenumber (cm-1)  Intensity  Assignment\n1080  vs  Si-O stretch\n800   w   Si-O-Si bend\n450   m   O-Si-O bend`,
    raman: `Graphite Raman (Tuinstra 1970)\nRaman shift (cm-1)  Intensity  Assignment\n1580  100  G-band\n1350  80   D-band\n2700  40   2D-band`,
    uvvis: `Anthracene UV-Vis (in ethanol)\nWavelength (nm)  Absorbance  Assignment\n253  1.0   π-π*\n356  0.42  S0-S1\n374  0.51  vibronic`
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
              : 'Paste reference data. Type auto-detected from header — or pick manually.'}
          </DialogDescription>
        </DialogHeader>

        <Tabs
          value={spectrumType}
          onValueChange={(v) => {
            setSpectrumType(v as SpectrumTypeRefCard);
            setPreview(null);
            setParseError(null);
          }}
        >
          <TabsList className='grid grid-cols-4'>
            <TabsTrigger value='xrd'>XRD</TabsTrigger>
            <TabsTrigger value='ftir'>FTIR</TabsTrigger>
            <TabsTrigger value='raman'>Raman</TabsTrigger>
            <TabsTrigger value='uvvis'>UV-Vis</TabsTrigger>
          </TabsList>

          {(['xrd', 'ftir', 'raman', 'uvvis'] as const).map((tabType) => (
            <TabsContent key={tabType} value={tabType} className='space-y-4 mt-4'>
              <div>
                <Label htmlFor={`ref-text-${tabType}`}>
                  {t.has('pasteText') ? t('pasteText') : 'Paste reference text'}
                </Label>
                <Textarea
                  id={`ref-text-${tabType}`}
                  value={text}
                  onChange={(e) => handleTextChange(e.target.value)}
                  placeholder={placeholders[tabType]}
                  rows={8}
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
            </TabsContent>
          ))}
        </Tabs>

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
                <strong>Peaks:</strong> {preview.nPeaks}
              </div>
            </div>

            <div className='max-h-40 overflow-y-auto rounded-md border'>
              <table className='w-full text-xs'>
                <thead className='sticky top-0 bg-muted'>
                  {spectrumType === 'xrd' && (
                    <tr>
                      <th className='px-2 py-1 text-left'>2θ (°)</th>
                      <th className='px-2 py-1 text-left'>d (Å)</th>
                      <th className='px-2 py-1 text-left'>I (%)</th>
                      <th className='px-2 py-1 text-left'>hkl</th>
                    </tr>
                  )}
                  {spectrumType === 'ftir' && (
                    <tr>
                      <th className='px-2 py-1 text-left'>Wavenumber (cm⁻¹)</th>
                      <th className='px-2 py-1 text-left'>I (%)</th>
                      <th className='px-2 py-1 text-left'>Assignment</th>
                    </tr>
                  )}
                  {spectrumType === 'raman' && (
                    <tr>
                      <th className='px-2 py-1 text-left'>Shift (cm⁻¹)</th>
                      <th className='px-2 py-1 text-left'>I (%)</th>
                      <th className='px-2 py-1 text-left'>Assignment</th>
                    </tr>
                  )}
                  {spectrumType === 'uvvis' && (
                    <tr>
                      <th className='px-2 py-1 text-left'>λ (nm)</th>
                      <th className='px-2 py-1 text-left'>I (%)</th>
                      <th className='px-2 py-1 text-left'>Assignment</th>
                    </tr>
                  )}
                </thead>
                <tbody>
                  {preview.peaks.slice(0, 50).map((p, i) => (
                    <tr key={i} className='border-t'>
                      {spectrumType === 'xrd' && 'twoTheta' in p && (
                        <>
                          <td className='px-2 py-1'>{p.twoTheta}</td>
                          <td className='px-2 py-1'>{p.dSpacing ?? '—'}</td>
                          <td className='px-2 py-1'>{p.intensity}</td>
                          <td className='px-2 py-1 font-mono'>{p.hkl ?? '—'}</td>
                        </>
                      )}
                      {spectrumType === 'ftir' && 'wavenumber' in p && (
                        <>
                          <td className='px-2 py-1'>{p.wavenumber}</td>
                          <td className='px-2 py-1'>{p.intensity}</td>
                          <td className='px-2 py-1 font-mono'>{p.assignment ?? '—'}</td>
                        </>
                      )}
                      {spectrumType === 'raman' && 'shift' in p && (
                        <>
                          <td className='px-2 py-1'>{p.shift}</td>
                          <td className='px-2 py-1'>{p.intensity}</td>
                          <td className='px-2 py-1 font-mono'>{p.assignment ?? '—'}</td>
                        </>
                      )}
                      {spectrumType === 'uvvis' && 'wavelength' in p && (
                        <>
                          <td className='px-2 py-1'>{p.wavelength}</td>
                          <td className='px-2 py-1'>{p.intensity}</td>
                          <td className='px-2 py-1 font-mono'>{p.assignment ?? '—'}</td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Type-specific extra fields */}
            <div className='grid grid-cols-2 gap-2 pt-2'>
              {spectrumType === 'xrd' && (
                <>
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
                    <Label htmlFor='spaceGroup'>Space group</Label>
                    <Input
                      id='spaceGroup'
                      value={spaceGroup}
                      onChange={(e) => setSpaceGroup(e.target.value)}
                      placeholder='P21/n'
                      className='h-8 text-xs'
                      maxLength={50}
                    />
                  </div>
                </>
              )}
              {spectrumType === 'ftir' && (
                <div>
                  <Label htmlFor='mode'>Mode</Label>
                  <select
                    id='mode'
                    value={mode}
                    onChange={(e) => setMode(e.target.value as 'transmittance' | 'absorbance')}
                    className='h-8 w-full rounded-md border bg-background text-xs px-2'
                  >
                    <option value='absorbance'>Absorbance</option>
                    <option value='transmittance'>Transmittance</option>
                  </select>
                </div>
              )}
              {spectrumType === 'raman' && (
                <div>
                  <Label htmlFor='laserWavelength'>Laser λ (nm)</Label>
                  <Input
                    id='laserWavelength'
                    type='number'
                    value={laserWavelength}
                    onChange={(e) => setLaserWavelength(e.target.value)}
                    placeholder='532'
                    className='h-8 text-xs'
                  />
                </div>
              )}
              {spectrumType === 'uvvis' && (
                <div>
                  <Label htmlFor='solvent'>Solvent</Label>
                  <Input
                    id='solvent'
                    value={solvent}
                    onChange={(e) => setSolvent(e.target.value)}
                    placeholder='ethanol'
                    className='h-8 text-xs'
                    maxLength={50}
                  />
                </div>
              )}
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
