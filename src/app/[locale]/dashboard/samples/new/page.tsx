import PageContainer from '@/components/layout/page-container';
import { SampleForm } from '@/features/samples/components/sample-form';

export const metadata = { title: 'New Sample' };

export default function NewSamplePage() {
  return (
    <PageContainer>
      <div className='max-w-3xl mx-auto space-y-6'>
        <header>
          <h1 className='text-2xl font-semibold tracking-tight'>Thêm sample mới</h1>
        </header>
        <SampleForm />
      </div>
    </PageContainer>
  );
}
