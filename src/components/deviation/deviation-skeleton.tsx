/**
 * DeviationSkeleton — loading placeholder for DeviationPanel/CrossSpectrumPanel.
 *
 * @phase R185-10d-2
 */
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export function DeviationSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className='h-5 w-48' />
      </CardHeader>
      <CardContent className='space-y-3'>
        <div className='grid grid-cols-2 sm:grid-cols-4 gap-3'>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className='space-y-1'>
              <Skeleton className='h-3 w-16' />
              <Skeleton className='h-6 w-12' />
            </div>
          ))}
        </div>
        <Skeleton className='h-24 w-full' />
        <Skeleton className='h-32 w-full' />
      </CardContent>
    </Card>
  );
}
