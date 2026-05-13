import PageContainer from '@/components/layout/page-container';
import { ExperimentForm } from '@/features/experiments/components/experiment-form';

export const metadata = { title: 'New Experiment' };

export default function NewExperimentPage() {
  return (
    <PageContainer>
      <div className='max-w-3xl mx-auto space-y-6'>
        <header>
          <h1 className='text-2xl font-semibold tracking-tight'>Thêm experiment mới</h1>
        </header>
        <ExperimentForm />
      </div>
    </PageContainer>
  );
}
