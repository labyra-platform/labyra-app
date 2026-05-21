import PageContainer from '@/components/layout/page-container';
import { Skeleton } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <PageContainer>
      <div className='flex flex-1 flex-col space-y-4'>
        <Skeleton className='h-8 w-48' />
        <div className='grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4'>
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className='h-32 w-full' />
          ))}
        </div>
        <div className='grid grid-cols-1 gap-4 lg:grid-cols-7'>
          <Skeleton className='h-80 lg:col-span-4' />
          <Skeleton className='h-80 lg:col-span-3' />
        </div>
      </div>
    </PageContainer>
  );
}
