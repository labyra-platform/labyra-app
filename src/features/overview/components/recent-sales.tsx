'use client';

import { Card, CardHeader, CardContent, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useRecentExperiments } from '@/lib/firestore/queries/dashboard';
import { useTranslations } from 'next-intl';

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'outline'> = {
  completed: 'default',
  running: 'secondary',
  planned: 'outline'
};

export function RecentSales() {
  const t = useTranslations('dashboard');
  const { data, isLoading } = useRecentExperiments(5);

  return (
    <Card className='h-full'>
      <CardHeader>
        <CardTitle>{t('recentExperiments')}</CardTitle>
        <CardDescription>{t('recentExperimentsSubtitle')}</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading && <p className='text-muted-foreground text-sm'>Loading…</p>}
        {!isLoading && data.length === 0 && (
          <p className='text-muted-foreground text-sm'>No experiments yet.</p>
        )}
        <div className='space-y-6'>
          {data.map((exp) => (
            <div key={exp.id} className='flex items-start justify-between gap-3'>
              <div className='min-w-0 flex-1 space-y-1'>
                <p className='truncate text-sm leading-none font-medium'>{exp.title}</p>
                <p className='text-muted-foreground text-xs'>
                  {exp.id}
                  {exp.temperature_C !== undefined ? ` · ${exp.temperature_C} °C` : ''}
                </p>
              </div>
              <Badge variant={STATUS_VARIANT[exp.status] ?? 'outline'} className='shrink-0'>
                {exp.status}
              </Badge>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
