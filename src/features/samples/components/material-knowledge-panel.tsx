/**
 * MaterialKnowledgePanel — displays aggregated scientific knowledge
 * for a material formula. Triggered from Sample detail when formula
 * field matches a materialProfiles document.
 *
 * Each data point shows a CitationChip (verified DOI only).
 * Trust > Coverage: fields without verified citation are hidden.
 *
 * @phase R183-3-material-knowledge-panel
 */
'use client';
import {
  IconAtom,
  IconChevronDown,
  IconChevronUp,
  IconFlask,
  IconWaveSine
} from '@tabler/icons-react';
import { useState } from 'react';
import { CitationChip } from '@/components/citation-chip';
import { Badge } from '@/components/ui/badge';
import { useMaterialProfile } from '@/lib/firestore/queries/material-profiles';
import type { SpectralSignature, SpectralPeak } from '@/types/material-profiles';

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionHeader({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className='flex items-center gap-2 text-sm font-semibold text-foreground mb-2'>
      <span className='text-muted-foreground'>{icon}</span>
      {title}
    </div>
  );
}

function PropRow({
  label,
  value,
  citation
}: {
  label: string;
  value: React.ReactNode;
  citation?: import('@/types/material-profiles').VerifiedCitation;
}) {
  return (
    <div className='flex items-start justify-between gap-4 py-1 border-b border-border/50 last:border-0'>
      <span className='text-xs text-muted-foreground min-w-[120px]'>{label}</span>
      <span className='text-xs text-foreground text-right flex items-center gap-1.5 flex-wrap justify-end'>
        {value}
        <CitationChip citation={citation} />
      </span>
    </div>
  );
}

function PeakTable({ sig, unit }: { sig: SpectralSignature; unit: string }) {
  const sorted = [...sig.peaks].sort((a, b) => (b.intensity ?? 0) - (a.intensity ?? 0));
  return (
    <div className='space-y-1'>
      {sig.notes && <p className='text-xs text-muted-foreground italic mb-2'>{sig.notes}</p>}
      <div className='grid grid-cols-[auto_auto_1fr_auto] gap-x-3 gap-y-0.5 text-xs'>
        <span className='font-medium text-muted-foreground'>{unit}</span>
        <span className='font-medium text-muted-foreground'>Int.</span>
        <span className='font-medium text-muted-foreground'>Assignment</span>
        <span className='font-medium text-muted-foreground'>Ref</span>
        {sorted.map((p: SpectralPeak, i: number) => {
          const pos = p.shift ?? p.twotheta ?? p.wavelength ?? p.energy ?? 0;
          const posStr = p.shift
            ? `${pos} cm⁻¹`
            : p.twotheta
              ? `${pos}°`
              : p.wavelength
                ? `${pos} nm`
                : `${pos} eV`;
          return (
            <>
              <span key={`pos-${i}`} className='font-mono text-foreground'>
                {posStr}
              </span>
              <span key={`int-${i}`} className='text-muted-foreground'>
                {p.intensity}
              </span>
              <span
                key={`asg-${i}`}
                className='text-muted-foreground truncate max-w-[200px]'
                title={p.assignment}
              >
                {p.assignment ?? '—'}
              </span>
              <span key={`ref-${i}`}>
                <CitationChip citation={p.citation} />
              </span>
            </>
          );
        })}
      </div>
      {sig.citation && (
        <div className='pt-1'>
          <CitationChip citation={sig.citation} />
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface MaterialKnowledgePanelProps {
  formula: string;
}

export function MaterialKnowledgePanel({ formula }: MaterialKnowledgePanelProps) {
  const { profile, loading } = useMaterialProfile(formula);
  const [expanded, setExpanded] = useState(true);

  if (loading) {
    return (
      <div className='rounded-lg border border-border bg-muted/30 px-4 py-3'>
        <p className='text-xs text-muted-foreground animate-pulse'>
          Loading knowledge for {formula}...
        </p>
      </div>
    );
  }

  if (!profile) return null;

  const ep = profile.electronicProps;
  const ss = profile.spectralSignatures;
  const lp = profile.latticeParams;

  return (
    <div className='rounded-lg border border-border bg-card shadow-sm overflow-hidden'>
      {/* Header */}
      <button
        type='button'
        onClick={() => setExpanded((v) => !v)}
        className='w-full flex items-center justify-between px-4 py-3 bg-muted/40 hover:bg-muted/60 transition-colors'
      >
        <div className='flex items-center gap-2'>
          <IconAtom className='h-4 w-4 text-primary' />
          <span className='text-sm font-semibold'>{profile.formula}</span>
          <span className='text-xs text-muted-foreground'>{profile.commonNames[0]}</span>
          {profile.dimensionality && (
            <Badge variant='outline' className='text-xs h-5'>
              {profile.dimensionality}
            </Badge>
          )}
          {profile.materialClass && (
            <Badge variant='secondary' className='text-xs h-5'>
              {profile.materialClass}
            </Badge>
          )}
        </div>
        {expanded ? (
          <IconChevronUp className='h-4 w-4 text-muted-foreground' />
        ) : (
          <IconChevronDown className='h-4 w-4 text-muted-foreground' />
        )}
      </button>

      {expanded && (
        <div className='px-4 py-4 space-y-5'>
          {/* Crystal structure */}
          {(profile.crystalSystem || profile.spaceGroup || lp) && (
            <section>
              <SectionHeader icon={<IconAtom className='h-4 w-4' />} title='Crystal Structure' />
              <div className='space-y-0'>
                {profile.crystalSystem && (
                  <PropRow label='Crystal system' value={profile.crystalSystem} />
                )}
                {profile.spaceGroup && (
                  <PropRow
                    label='Space group'
                    value={`${profile.spaceGroup}${profile.spaceGroupNumber ? ` (#${profile.spaceGroupNumber})` : ''}`}
                  />
                )}
                {lp && (
                  <PropRow
                    label='Lattice params'
                    value={[
                      lp.a ? `a=${lp.a} Å` : null,
                      lp.b ? `b=${lp.b} Å` : null,
                      lp.c ? `c=${lp.c} Å` : null,
                      lp.beta ? `β=${lp.beta}°` : null
                    ]
                      .filter(Boolean)
                      .join('  ')}
                  />
                )}
              </div>
            </section>
          )}

          {/* Electronic properties */}
          {ep && (
            <section>
              <SectionHeader
                icon={<IconFlask className='h-4 w-4' />}
                title='Electronic Properties'
              />
              <div className='space-y-0'>
                {ep.bandgapEv !== undefined && (
                  <PropRow
                    label='Band gap'
                    value={`${ep.bandgapEv} eV${ep.bandgapType ? ` (${ep.bandgapType})` : ''}`}
                    citation={ep.citation}
                  />
                )}
                {ep.conductivityType && (
                  <PropRow label='Conductivity' value={ep.conductivityType} />
                )}
                {ep.bandgapNotes && (
                  <p className='text-xs text-muted-foreground italic pt-1'>{ep.bandgapNotes}</p>
                )}
              </div>
            </section>
          )}

          {/* Spectral signatures */}
          {ss && (
            <section>
              <SectionHeader
                icon={<IconWaveSine className='h-4 w-4' />}
                title='Spectral Signatures'
              />
              <div className='space-y-4'>
                {ss.raman && (
                  <div>
                    <p className='text-xs font-medium text-muted-foreground mb-1'>
                      Raman {ss.raman.laserWavelength ? `(λ=${ss.raman.laserWavelength} nm)` : ''}
                    </p>
                    <PeakTable sig={ss.raman} unit='cm⁻¹' />
                  </div>
                )}
                {ss.xrd && (
                  <div>
                    <p className='text-xs font-medium text-muted-foreground mb-1'>XRD</p>
                    <PeakTable sig={ss.xrd} unit='2θ' />
                  </div>
                )}
                {ss.ftir && (
                  <div>
                    <p className='text-xs font-medium text-muted-foreground mb-1'>FTIR</p>
                    <PeakTable sig={ss.ftir} unit='cm⁻¹' />
                  </div>
                )}
                {ss.pl && (
                  <div>
                    <p className='text-xs font-medium text-muted-foreground mb-1'>PL</p>
                    <PeakTable sig={ss.pl} unit='eV' />
                  </div>
                )}
                {ss.uvvis && (
                  <div>
                    <p className='text-xs font-medium text-muted-foreground mb-1'>UV-Vis</p>
                    <PeakTable sig={ss.uvvis} unit='nm' />
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Physical properties */}
          {profile.physicalProps && Object.keys(profile.physicalProps).length > 0 && (
            <section>
              <SectionHeader icon={<IconFlask className='h-4 w-4' />} title='Physical Properties' />
              <div className='space-y-0'>
                {Object.entries(profile.physicalProps).map(([k, v]) => (
                  <PropRow key={k} label={k.replace(/_/g, ' ')} value={String(v)} />
                ))}
              </div>
            </section>
          )}

          {/* Footer */}
          <div className='flex items-center justify-between pt-1 border-t border-border/50'>
            <span className='text-xs text-muted-foreground'>
              Source: {profile.source}
              {profile.mpId ? ` · ${profile.mpId}` : ''}
            </span>
            {profile.mpId && (
              <a
                href={`https://next.materialsproject.org/materials/${profile.mpId}`}
                target='_blank'
                rel='noopener noreferrer'
                className='text-xs text-primary hover:underline'
              >
                Materials Project ↗
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
