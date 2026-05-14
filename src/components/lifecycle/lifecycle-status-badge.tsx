/**
 * Badge displaying lifecycle status (active/deprecated/retracted).
 *
 * @phase R164-phase-7
 */
'use client';
import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import type { LifecycleStatus } from '@/types/prov-base';

const COLORS: Record<LifecycleStatus, string> = {
  active: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  deprecated: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
  retracted: 'bg-red-500/10 text-red-700 dark:text-red-400'
};

interface LifecycleStatusBadgeProps {
  status: LifecycleStatus;
  className?: string;
}

export function LifecycleStatusBadge({ status, className }: LifecycleStatusBadgeProps) {
  const t = useTranslations('lifecycle.status');
  return (
    <Badge className={[COLORS[status], className].filter(Boolean).join(' ')} variant='secondary'>
      {t(status)}
    </Badge>
  );
}
