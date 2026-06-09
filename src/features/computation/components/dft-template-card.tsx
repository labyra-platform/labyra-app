/**
 * DFT template card — read-only preview of a verified workflow preset.
 *
 * Server Component. The "use" action arrives with the Submit tab.
 *
 * @phase R239-computation-tabs
 */
import { getTranslations } from 'next-intl/server';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { DftTemplate } from '@/features/computation/templates';

interface Props {
  template: DftTemplate;
}

export async function DftTemplateCard({ template }: Props) {
  const t = await getTranslations('computation');

  return (
    <Card>
      <CardHeader className='space-y-1'>
        <CardTitle className='flex items-center justify-between gap-2 text-base'>
          {template.name}
          <Badge variant='secondary'>{template.method}</Badge>
        </CardTitle>
        <p className='text-muted-foreground text-xs'>{template.material}</p>
      </CardHeader>
      <CardContent>
        <dl className='text-muted-foreground grid grid-cols-2 gap-x-4 gap-y-1 text-xs'>
          <div>
            {t('template.hubbard')} <span className='text-foreground'>{template.hubbard}</span>
          </div>
          <div>
            {t('template.vdw')} <span className='text-foreground'>{template.vdw ?? '—'}</span>
          </div>
          <div>
            {t('template.cutoff')}{' '}
            <span className='text-foreground tabular-nums'>{template.cutoff}</span>
          </div>
          <div>
            {t('template.kpoints')}{' '}
            <span className='text-foreground tabular-nums'>{template.kGrid}</span>
          </div>
          <div>
            {t('template.steps')}{' '}
            <span className='text-foreground tabular-nums'>{template.unitCount}</span>
          </div>
        </dl>
      </CardContent>
    </Card>
  );
}
