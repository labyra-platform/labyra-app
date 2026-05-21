import PageContainer from '@/components/layout/page-container';
import { ListSkeleton } from '@/components/ui/list-skeleton';

export default function Loading() {
  return (
    <PageContainer>
      <ListSkeleton columns={3} rows={8} />
    </PageContainer>
  );
}
