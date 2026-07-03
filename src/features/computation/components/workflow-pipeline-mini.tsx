/**
 * Compact pipeline stepper for the computation list — one coloured dot per unit
 * (vc-relax → scf → bands …) with status from the snapshot. A lightweight
 * stand-in for the full React-Flow DAG, cheap enough to render per table row.
 *
 * @phase R301-computation-list
 */
import {
  IconAlertTriangleFilled,
  IconCircle,
  IconCircleCheckFilled,
  IconLoader2
} from '@tabler/icons-react';
import type { StepDot } from '@/features/computation/workflow-row';
import { formatDuration } from '@/features/computation/workflow-row';
import { cn } from '@/lib/utils';
import type { DftUnitStatus } from '@/types/dft';

function dotColor(status: DftUnitStatus | undefined): string {
  switch (status) {
    case 'completed':
      return 'text-emerald-600 dark:text-emerald-500';
    case 'failed':
      return 'text-destructive';
    case 'running':
      return 'text-blue-600 dark:text-blue-500';
    case 'queued':
      return 'text-amber-600 dark:text-amber-500';
    default:
      return 'text-muted-foreground/40';
  }
}

/** Connector colour between two steps: green once the left step has completed,
 * otherwise a muted rail (mirrors the progress-rail look of the reference). */
function railColor(leftStatus: DftUnitStatus | undefined): string {
  return leftStatus === 'completed' ? 'bg-emerald-500/70' : 'bg-border';
}

function DotIcon({ status }: { status: DftUnitStatus | undefined }) {
  const cls = cn('size-4 shrink-0', dotColor(status));
  switch (status) {
    case 'completed':
      return <IconCircleCheckFilled className={cls} aria-hidden />;
    case 'failed':
      return <IconAlertTriangleFilled className={cls} aria-hidden />;
    case 'running':
      return <IconLoader2 className={cn(cls, 'animate-spin')} aria-hidden />;
    default:
      return <IconCircle className={cls} aria-hidden />;
  }
}

interface Props {
  steps: StepDot[];
  className?: string;
}

export function WorkflowPipelineMini({ steps, className }: Props) {
  if (steps.length === 0) {
    return <span className='text-muted-foreground text-xs'>—</span>;
  }
  const totalSec = steps.reduce((acc, s) => acc + (s.durationSec ?? 0), 0);
  const total = totalSec > 0 ? formatDuration(totalSec) : null;
  return (
    <div className={cn('flex items-center gap-1', className)}>
      {steps.map((s, i) => {
        const dur = formatDuration(s.durationSec);
        const title = dur
          ? `${s.label}: ${s.status ?? 'pending'} · ${dur}`
          : `${s.label}: ${s.status ?? 'pending'}`;
        return (
          <div key={s.id} className='flex items-center gap-1' title={title}>
            {i > 0 ? (
              <span
                className={cn('h-0.5 w-3 rounded-full', railColor(steps[i - 1].status))}
                aria-hidden
              />
            ) : null}
            <DotIcon status={s.status} />
            <span className='text-muted-foreground hidden text-[11px] lg:inline'>
              {s.label}
              {dur ? <span className='text-muted-foreground/70'> {dur}</span> : null}
            </span>
          </div>
        );
      })}
      {total ? (
        <span className='text-muted-foreground/70 ml-1 hidden text-[11px] tabular-nums md:inline'>
          Σ {total}
        </span>
      ) : null}
    </div>
  );
}
