import PageContainer from '@/components/layout/page-container';
import { MaterialForm } from '@/features/materials/components/material-form';

export const metadata = { title: 'New Material' };

export default function NewMaterialPage() {
  return (
    <PageContainer>
      <div className='max-w-3xl mx-auto space-y-6'>
        <header>
          <h1 className='text-2xl font-semibold tracking-tight'>Thêm material mới</h1>
        </header>
        <MaterialForm />
      </div>
    </PageContainer>
  );
}
