import { getLocale } from 'next-intl/server';
import Link from 'next/link';
import { IconPlus } from '@tabler/icons-react';
import PageContainer from '@/components/layout/page-container';
import { SamplesTable } from '@/features/samples/components/samples-table';

export const metadata = { title: 'Samples' };

export default async function SamplesListPage() {
  const locale = await getLocale();
  return (
    <PageContainer>
      <div className='max-w-5xl mx-auto space-y-6'>
        <header className='flex items-center justify-between'>
          <div>
            <h1 className='text-2xl font-semibold tracking-tight'>Samples</h1>
            <p className='text-muted-foreground text-sm mt-1'>
              Quản lý danh sách samples trong lab
            </p>
          </div>
          <Link
            href={`/${locale}/dashboard/samples/new`}
            className='inline-flex items-center gap-2 bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-medium hover:bg-primary/90'
          >
            <IconPlus className='size-4' />
            Thêm mới
          </Link>
        </header>
        <SamplesTable />
      </div>
    </PageContainer>
  );
}
