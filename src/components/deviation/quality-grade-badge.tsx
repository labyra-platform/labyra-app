/**
 * QualityGradeBadge — visual indicator for match quality.
 *
 * Colors are semantic (success/warning/destructive Tailwind tokens, not raw colors).
 *
 * @phase R185-10a
 */
'use client';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface QualityGradeBadgeProps {
  grade: 'excellent' | 'good' | 'fair' | 'poor' | string;
  className?: string;
}

const GRADE_STYLES: Record<string, string> = {
  excellent: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
  good: 'bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/30',
  fair: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30',
  poor: 'bg-destructive/10 text-destructive border-destructive/30'
};

export function QualityGradeBadge({ grade, className }: QualityGradeBadgeProps) {
  const style = GRADE_STYLES[grade] ?? 'bg-muted text-muted-foreground';
  return (
    <Badge
      variant='outline'
      className={cn('font-medium', style, className)}
      aria-label={`Match quality: ${grade}`}
    >
      {grade}
    </Badge>
  );
}
