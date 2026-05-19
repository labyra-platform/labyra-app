/**
 * HypothesisCard — render one Hypothesis from rules engine.
 *
 * Displays: name, confidence meter, evidence list, citation chip, followup.
 *
 * @phase R185-10a
 */
'use client';

import { IconAlertTriangle, IconBulb, IconInfoCircle } from '@tabler/icons-react';
import { CitationChip } from '@/components/citation-chip';
import { ConfidenceMeter } from '@/components/deviation/confidence-meter';
import { formatFormula } from '@/lib/utils/format-formula';
import type { Hypothesis } from '@/types/deviation-analysis';

interface HypothesisCardProps {
  hypothesis: Hypothesis;
}

const SEVERITY_ICONS = {
  info: IconInfoCircle,
  warning: IconAlertTriangle,
  error: IconAlertTriangle
} as const;

const SEVERITY_STYLES = {
  info: 'border-l-sky-500',
  warning: 'border-l-amber-500',
  error: 'border-l-destructive'
} as const;

export function HypothesisCard({ hypothesis }: HypothesisCardProps) {
  const severity = hypothesis.severity ?? 'info';
  const Icon = SEVERITY_ICONS[severity];
  const borderStyle = SEVERITY_STYLES[severity];

  return (
    <article
      className={`rounded-md border border-border border-l-4 ${borderStyle} bg-card p-4 space-y-3`}
      aria-labelledby={`hyp-${hypothesis.rule_id}`}
    >
      <header className='flex items-start gap-2'>
        <Icon className='h-4 w-4 mt-1 text-muted-foreground shrink-0' aria-hidden='true' />
        <div className='flex-1 min-w-0'>
          <h4 id={`hyp-${hypothesis.rule_id}`} className='text-sm font-medium leading-snug'>
            {formatFormula(hypothesis.name)}
          </h4>
          <p className='text-xs text-muted-foreground mt-0.5'>{hypothesis.rule_id}</p>
        </div>
      </header>

      <div className='space-y-1.5'>
        <div className='flex items-center gap-2'>
          <span className='text-xs text-muted-foreground'>Confidence</span>
          <ConfidenceMeter value={hypothesis.confidence} className='flex-1' />
        </div>
      </div>

      {hypothesis.evidence && hypothesis.evidence.length > 0 && (
        <details className='text-xs'>
          <summary className='cursor-pointer text-muted-foreground hover:text-foreground transition-colors motion-reduce:transition-none'>
            Evidence ({hypothesis.evidence.length})
          </summary>
          <ul className='mt-2 space-y-1 pl-4 list-disc text-foreground/90'>
            {hypothesis.evidence.map((item, i) => (
              <li key={i}>{formatFormula(item)}</li>
            ))}
          </ul>
        </details>
      )}

      {hypothesis.quantitative_estimate && (
        <div className='text-xs bg-muted/40 rounded p-2'>
          <p className='font-medium text-muted-foreground mb-0.5'>Estimate</p>
          <p className='text-foreground/90'>{formatFormula(hypothesis.quantitative_estimate)}</p>
        </div>
      )}

      {hypothesis.suggested_followup && (
        <div className='text-xs border-l-2 border-muted-foreground/30 pl-3'>
          <p className='text-muted-foreground flex items-center gap-1 mb-0.5'>
            <IconBulb className='h-3 w-3' aria-hidden='true' />
            Suggested followup
          </p>
          <p className='text-foreground/90'>{formatFormula(hypothesis.suggested_followup)}</p>
        </div>
      )}

      {hypothesis.citation && (
        <div className='pt-1'>
          <CitationChip citation={hypothesis.citation} />
        </div>
      )}
    </article>
  );
}
