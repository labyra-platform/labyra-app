/**
 * AmbiguousObservationCard — multi-cause observation + discrimination experiments.
 *
 * @phase R185-10c (renders R185-9 output)
 */
'use client';

import { IconAlertCircle, IconFlask, IconInfoCircle } from '@tabler/icons-react';
import { Badge } from '@/components/ui/badge';
import { CitationChip } from '@/components/citation-chip';
import { ConfidenceMeter } from '@/components/deviation/confidence-meter';
import { cn } from '@/lib/utils';
import type { AmbiguousObservation, DiscriminationExperiment } from '@/types/deviation-analysis';

interface AmbiguousObservationCardProps {
  observation: AmbiguousObservation;
}

const SEVERITY_CONFIG = {
  info: {
    Icon: IconInfoCircle,
    border: 'border-sky-500/30',
    bg: 'bg-sky-500/5',
    text: 'text-sky-700 dark:text-sky-300'
  },
  warning: {
    Icon: IconAlertCircle,
    border: 'border-amber-500/30',
    bg: 'bg-amber-500/5',
    text: 'text-amber-700 dark:text-amber-300'
  },
  error: {
    Icon: IconAlertCircle,
    border: 'border-destructive/30',
    bg: 'bg-destructive/5',
    text: 'text-destructive'
  }
} as const;

function ExperimentRow({ exp }: { exp: DiscriminationExperiment }) {
  return (
    <li className='space-y-1.5 pl-2'>
      <div className='flex items-center gap-2 flex-wrap'>
        <IconFlask className='h-3.5 w-3.5 text-muted-foreground' aria-hidden='true' />
        <span className='font-medium text-sm'>{exp.technique}</span>
        {exp.citation_doi && (
          <CitationChip
            citation={{
              doi: exp.citation_doi,
              journal: '',
              year: 0,
              title: '',
              verified: true
            }}
          />
        )}
      </div>
      <p className='text-xs text-foreground/80 leading-snug pl-5'>{exp.measurement}</p>
      {Object.keys(exp.expected_outcomes).length > 0 && (
        <details className='pl-5'>
          <summary className='cursor-pointer text-xs text-muted-foreground hover:text-foreground transition-colors motion-reduce:transition-none'>
            Expected outcomes
          </summary>
          <dl className='mt-1.5 grid grid-cols-1 gap-1 text-xs'>
            {Object.entries(exp.expected_outcomes).map(([rule, outcome]) => (
              <div key={rule} className='flex gap-2'>
                <dt className='font-mono text-muted-foreground shrink-0'>{rule}:</dt>
                <dd className='text-foreground/80'>{outcome}</dd>
              </div>
            ))}
          </dl>
        </details>
      )}
    </li>
  );
}

export function AmbiguousObservationCard({ observation }: AmbiguousObservationCardProps) {
  const cfg = SEVERITY_CONFIG[observation.severity];
  const Icon = cfg.Icon;

  return (
    <article
      className={cn('rounded-md border p-4 space-y-3', cfg.border, cfg.bg)}
      aria-labelledby={`amb-${observation.observation_id}`}
    >
      <header className='flex items-start gap-2'>
        <Icon className={cn('h-4 w-4 mt-0.5 shrink-0', cfg.text)} aria-hidden='true' />
        <div className='flex-1 min-w-0'>
          <h4
            id={`amb-${observation.observation_id}`}
            className={cn('text-sm font-medium', cfg.text)}
          >
            {observation.description}
          </h4>
          <p className='text-xs text-muted-foreground mt-0.5 capitalize'>
            Severity: {observation.severity}
          </p>
        </div>
        <Badge variant='outline' className='text-xs shrink-0'>
          {observation.candidates.length} causes
        </Badge>
      </header>

      <section aria-label='Candidate causes' className='space-y-2'>
        <p className='text-xs font-medium text-muted-foreground'>
          Candidate causes (re-scored with multi-spectrum evidence)
        </p>
        <div className='space-y-2'>
          {observation.candidates.map((c) => (
            <div
              key={c.rule_id}
              className='rounded border border-border/50 bg-card p-2.5 space-y-1.5'
            >
              <div className='flex items-center justify-between gap-2 flex-wrap'>
                <p className='text-sm font-medium'>{c.name}</p>
                <span className='text-xs font-mono text-muted-foreground'>{c.rule_id}</span>
              </div>
              <ConfidenceMeter value={c.score} />
              {c.evidence.length > 0 && (
                <ul className='text-xs space-y-0.5 pl-4 list-disc text-foreground/80'>
                  {c.evidence.slice(0, 2).map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
              )}
              {c.citation_doi && (
                <CitationChip
                  citation={{
                    doi: c.citation_doi,
                    journal: '',
                    year: 0,
                    title: '',
                    verified: true
                  }}
                />
              )}
            </div>
          ))}
        </div>
      </section>

      {observation.discrimination_experiments.length > 0 && (
        <section aria-label='Discrimination experiments' className='space-y-2 pt-1'>
          <p className='text-xs font-medium text-muted-foreground'>
            Discrimination experiments ({observation.discrimination_experiments.length})
          </p>
          <ul className='space-y-3'>
            {observation.discrimination_experiments.map((exp, i) => (
              <ExperimentRow key={i} exp={exp} />
            ))}
          </ul>
        </section>
      )}

      {observation.notes.length > 0 && (
        <div className='text-xs text-muted-foreground space-y-0.5 pt-1'>
          {observation.notes.map((n, i) => (
            <p key={i}>• {n}</p>
          ))}
        </div>
      )}
    </article>
  );
}
