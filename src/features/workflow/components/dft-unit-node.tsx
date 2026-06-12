/**
 * DFT unit node — pipeline-style status card (report node-graph 5.1, DFT 10.2/10.3).
 *
 * Header: order + name + status icon (✓ completed / ◐ running / ○ pending|queued /
 * ✗ failed). Running → amber border, failed → destructive border, selected → ring.
 * Body: read-only param preview (e.g. "pw.x · 60 Ry · 6×6×12") + calcType badge.
 * DFT is pipeline-style (status + panel for params), NOT input-on-node. Param
 * editing + Edit/Clone/Output actions arrive with the side panel (slice c).
 *
 * @phase R249-dft-status-card
 */
'use client';

import {
  IconAlertTriangleFilled,
  IconCircle,
  IconCircleCheckFilled,
  IconClock,
  IconLoader2
} from '@tabler/icons-react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Badge } from '@/components/ui/badge';

interface DftNodeData {
  order?: number;
  name: string;
  calcType: string;
  status?: string;
  preview?: string;
}

const STATUS_ICON = {
  completed: { Icon: IconCircleCheckFilled, cls: 'text-emerald-600 dark:text-emerald-400' },
  running: { Icon: IconLoader2, cls: 'text-amber-500 animate-spin' },
  queued: { Icon: IconClock, cls: 'text-muted-foreground' },
  pending: { Icon: IconCircle, cls: 'text-muted-foreground/50' },
  failed: { Icon: IconAlertTriangleFilled, cls: 'text-destructive' }
} as const;

type StatusKey = keyof typeof STATUS_ICON;

function statusKeyOf(s: string | undefined): StatusKey {
  return s != null && s in STATUS_ICON ? (s as StatusKey) : 'pending';
}

export function DftUnitNode({ data, selected }: NodeProps) {
  const d = data as unknown as DftNodeData;
  const key = statusKeyOf(d.status);
  const meta = STATUS_ICON[key];
  const StatusIcon = meta.Icon;

  const cls = [
    'bg-card text-card-foreground w-[208px] rounded-lg border shadow-sm transition-colors',
    selected ? 'ring-primary ring-2' : '',
    key === 'running' ? 'border-amber-400/70' : '',
    key === 'failed' ? 'border-destructive/60' : ''
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={cls}>
      <Handle type='target' position={Position.Left} className='!bg-muted-foreground' />

      <div className='flex items-center gap-2 border-b px-3 py-2'>
        {d.order == null ? null : (
          <span className='bg-muted text-muted-foreground inline-flex size-5 shrink-0 items-center justify-center rounded text-xs tabular-nums'>
            {String(d.order).padStart(2, '0')}
          </span>
        )}
        <span className='flex-1 truncate text-sm font-medium'>{d.name}</span>
        <StatusIcon className={`size-4 shrink-0 ${meta.cls}`} aria-hidden />
      </div>

      <div className='flex items-center justify-between gap-2 px-3 py-1.5'>
        <span className='text-muted-foreground truncate font-mono text-[11px]'>
          {d.preview ?? d.calcType}
        </span>
        <Badge variant='secondary' className='shrink-0 text-[10px]'>
          {d.calcType}
        </Badge>
      </div>

      <Handle type='source' position={Position.Right} className='!bg-muted-foreground' />
    </div>
  );
}
