import { getLocale } from 'next-intl/server';
import Link from 'next/link';
import { IconPlus } from '@tabler/icons-react';
import PageContainer from '@/components/layout/page-container';
import { MaterialsTable } from '@/features/materials/components/materials-table';

export const metadata = { title: 'Materials' };

export default async function MaterialsListPage() {
  const locale = await getLocale();
  return (
    <PageContainer>
      <div className='max-w-5xl mx-auto space-y-6'>
        <header className='flex items-center justify-between'>
          <div>
            <h1 className='text-2xl font-semibold tracking-tight'>Materials</h1>
            <p className='text-muted-foreground text-sm mt-1'>
              Quản lý danh sách materials trong lab
            </p>
          </div>
          <Link
            href={`/${locale}/dashboard/materials/new`}
            className='inline-flex items-center gap-2 bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-medium hover:bg-primary/90'
          >
            <IconPlus className='size-4' />
            Thêm mới
          </Link>
        </header>
        <MaterialsTable />
      </div>
    </PageContainer>
  );
}
