import PageContainer from '@/components/layout/page-container';
import { Skeleton } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <PageContainer>
      <div className='flex flex-1 flex-col space-y-4'>
        <Skeleton className='h-8 w-56' />
        <Skeleton className='h-4 w-80' />
        <Skeleton className='mt-4 h-[400px] w-full' />
      </div>
    </PageContainer>
  );
}
