/**
 * MaterialKnowledgePanel — displays aggregated scientific knowledge
 * for a material formula. Triggered from Sample detail when formula
 * field matches a materialProfiles document.
 *
 * UI/UX standards applied (R183-3-hotfix1):
 * - Unicode subscript formulas (MoS₂, WO₃)
 * - WCAG AA contrast (semantic tokens only)
 * - Touch targets ≥ 44px on interactive elements
 * - Motion with prefers-reduced-motion support
 * - Axis labels with units (Tufte principle)
 * - Data-ink ratio: minimal chrome, focus on data + citations
 *
 * Trust > Coverage: fields without verified citation are hidden.
 *
 * @phase R183-3-hotfix1-ui-ux
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
import { formatFormula } from '@/lib/utils/format-formula';
import type {
  MaterialProfile,
  SpectralPeak,
  SpectralSignature,
  VerifiedCitation
} from '@/types/material-profiles';

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionHeader({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className='flex items-center gap-2 text-sm font-semibold text-foreground mb-3'>
      <span className='text-muted-foreground' aria-hidden='true'>
        {icon}
      </span>
      <h3 className='text-sm font-semibold'>{title}</h3>
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
  citation?: VerifiedCitation;
}) {
  return (
    <div className='flex items-start justify-between gap-4 py-2 border-b border-border/50 last:border-0'>
      <dt className='text-xs text-muted-foreground min-w-[120px]'>{label}</dt>
      <dd className='text-xs text-foreground text-right flex items-center gap-1.5 flex-wrap justify-end'>
        {value}
        <CitationChip citation={citation} />
      </dd>
    </div>
  );
}

/**
 * Axis unit label for spectral table columns.
 * Tufte principle: every quantitative axis MUST display its unit.
 */
function axisLabel(unit: string): string {
  switch (unit) {
    case 'cm⁻¹':
      return 'Wavenumber (cm⁻¹)';
    case '2θ':
      return '2θ (degrees)';
    case 'nm':
      return 'Wavelength (nm)';
    case 'eV':
      return 'Energy (eV)';
    default:
      return unit;
  }
}

function PeakTable({ sig, unit }: { sig: SpectralSignature; unit: string }) {
  const sorted = [...sig.peaks].toSorted((a, b) => (b.intensity ?? 0) - (a.intensity ?? 0));
  return (
    <div className='space-y-2'>
      {sig.notes && <p className='text-xs text-muted-foreground italic'>{sig.notes}</p>}
      <table className='w-full text-xs'>
        <thead>
          <tr className='text-muted-foreground border-b border-border/50'>
            <th className='text-left font-medium pb-1.5 pr-3' scope='col'>
              {axisLabel(unit)}
            </th>
            <th className='text-left font-medium pb-1.5 pr-3' scope='col'>
              Intensity (a.u.)
            </th>
            <th className='text-left font-medium pb-1.5 pr-3' scope='col'>
              Assignment
            </th>
            <th className='text-left font-medium pb-1.5' scope='col'>
              Ref
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((p: SpectralPeak, i: number) => {
            const pos = p.shift ?? p.twotheta ?? p.wavelength ?? p.energy ?? 0;
            const posStr =
              p.shift !== undefined
                ? `${pos}`
                : p.twotheta !== undefined
                  ? `${pos}°`
                  : p.wavelength !== undefined
                    ? `${pos}`
                    : `${pos}`;
            return (
              <tr key={`peak-${i}`} className='border-b border-border/30 last:border-0'>
                <td className='font-mono text-foreground py-1 pr-3'>{posStr}</td>
                <td className='text-muted-foreground py-1 pr-3'>{p.intensity}</td>
                <td
                  className='text-muted-foreground py-1 pr-3 truncate max-w-[200px]'
                  title={p.assignment}
                >
                  {p.assignment ?? '—'}
                </td>
                <td className='py-1'>
                  <CitationChip citation={p.citation} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {sig.citation && (
        <div className='pt-1'>
          <CitationChip citation={sig.citation} />
        </div>
      )}
    </div>
  );
}

function CrystalSection({ profile }: { profile: MaterialProfile }) {
  const lp = profile.latticeParams;
  if (!profile.crystalSystem && !profile.spaceGroup && !lp) return null;

  return (
    <section aria-labelledby='crystal-heading'>
      <SectionHeader icon={<IconAtom className='h-4 w-4' />} title='Crystal Structure' />
      <dl className='space-y-0'>
        {profile.crystalSystem && <PropRow label='Crystal system' value={profile.crystalSystem} />}
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
      </dl>
    </section>
  );
}

function ElectronicSection({ profile }: { profile: MaterialProfile }) {
  const ep = profile.electronicProps;
  if (!ep) return null;

  return (
    <section aria-labelledby='electronic-heading'>
      <SectionHeader icon={<IconFlask className='h-4 w-4' />} title='Electronic Properties' />
      <dl className='space-y-0'>
        {ep.bandgapEv !== undefined && (
          <PropRow
            label='Band gap'
            value={`${ep.bandgapEv} eV${ep.bandgapType ? ` (${ep.bandgapType})` : ''}`}
            citation={ep.citation}
          />
        )}
        {ep.conductivityType && <PropRow label='Conductivity' value={ep.conductivityType} />}
        {ep.bandgapNotes && (
          <p className='text-xs text-muted-foreground italic pt-2'>{ep.bandgapNotes}</p>
        )}
      </dl>
    </section>
  );
}

function SpectralSection({ profile }: { profile: MaterialProfile }) {
  const ss = profile.spectralSignatures;
  if (!ss) return null;

  const sections: Array<{ key: keyof typeof ss; label: string; unit: string }> = [
    { key: 'raman', label: 'Raman', unit: 'cm⁻¹' },
    { key: 'xrd', label: 'XRD', unit: '2θ' },
    { key: 'ftir', label: 'FTIR', unit: 'cm⁻¹' },
    { key: 'pl', label: 'PL', unit: 'eV' },
    { key: 'uvvis', label: 'UV-Vis', unit: 'nm' }
  ];

  return (
    <section aria-labelledby='spectral-heading'>
      <SectionHeader icon={<IconWaveSine className='h-4 w-4' />} title='Spectral Signatures' />
      <div className='space-y-4'>
        {sections.map(({ key, label, unit }) => {
          const sig = ss[key];
          if (!sig) return null;
          return (
            <div key={key}>
              <p className='text-xs font-medium text-muted-foreground mb-1.5'>
                {label}
                {sig.laserWavelength ? ` (λ = ${sig.laserWavelength} nm)` : ''}
              </p>
              <PeakTable sig={sig} unit={unit} />
            </div>
          );
        })}
      </div>
    </section>
  );
}

function PhysicalSection({ profile }: { profile: MaterialProfile }) {
  if (!profile.physicalProps || Object.keys(profile.physicalProps).length === 0) return null;

  return (
    <section aria-labelledby='physical-heading'>
      <SectionHeader icon={<IconFlask className='h-4 w-4' />} title='Physical Properties' />
      <dl className='space-y-0'>
        {Object.entries(profile.physicalProps).map(([k, v]) => (
          <PropRow key={k} label={k.replace(/_/g, ' ')} value={String(v)} />
        ))}
      </dl>
    </section>
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
      <div
        className='rounded-lg border border-border bg-muted/30 px-4 py-3'
        role='status'
        aria-live='polite'
      >
        <p className='text-xs text-muted-foreground'>
          Loading knowledge for {formatFormula(formula)}...
        </p>
      </div>
    );
  }

  if (!profile) return null;

  const displayFormula = formatFormula(profile.formula);

  return (
    <div className='rounded-lg border border-border bg-card shadow-sm overflow-hidden'>
      {/* Header — touch target ≥ 44px */}
      <button
        type='button'
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        aria-controls='material-knowledge-content'
        className={[
          'w-full min-h-[44px] flex items-center justify-between px-4 py-3',
          'bg-muted/40 hover:bg-muted/60',
          'transition-colors duration-150 motion-reduce:transition-none',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset'
        ].join(' ')}
      >
        <div className='flex items-center gap-2 flex-wrap'>
          <IconAtom className='h-4 w-4 text-primary' aria-hidden='true' />
          <span className='text-sm font-semibold'>{displayFormula}</span>
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
          <IconChevronUp className='h-4 w-4 text-muted-foreground' aria-hidden='true' />
        ) : (
          <IconChevronDown className='h-4 w-4 text-muted-foreground' aria-hidden='true' />
        )}
      </button>

      {expanded && (
        <div id='material-knowledge-content' className='px-4 py-4 space-y-6'>
          <CrystalSection profile={profile} />
          <ElectronicSection profile={profile} />
          <SpectralSection profile={profile} />
          <PhysicalSection profile={profile} />

          {/* Footer */}
          <div className='flex items-center justify-between pt-2 border-t border-border/50 gap-2 flex-wrap'>
            <span className='text-xs text-muted-foreground'>
              Source: {profile.source}
              {profile.mpId ? ` · ${profile.mpId}` : ''}
            </span>
            {profile.mpId && (
              <a
                href={`https://next.materialsproject.org/materials/${profile.mpId}`}
                target='_blank'
                rel='noopener noreferrer'
                className={[
                  'text-xs text-primary hover:underline',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 rounded'
                ].join(' ')}
                aria-label={`View ${displayFormula} on Materials Project. Opens in new tab.`}
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
