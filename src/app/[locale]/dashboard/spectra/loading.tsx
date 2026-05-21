import { DataTableSkeleton } from '@/components/ui/table/data-table-skeleton';
import PageContainer from '@/components/layout/page-container';

export default function Loading() {
  return (
    <PageContainer>
      <DataTableSkeleton
        columnCount={5}
        rowCount={8}
        withViewOptions={false}
        withPagination={false}
      />
    </PageContainer>
  );
}
