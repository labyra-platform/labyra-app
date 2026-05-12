import { getTranslations } from 'next-intl/server';
import PageContainer from '@/components/layout/page-container';
import { UploadDropzone } from '@/features/papers/components/upload-dropzone';

export async function generateMetadata() {
  const t = await getTranslations('papers');
  return {
    title: t('uploadPageTitle')
  };
}

export default async function PaperUploadPage() {
  const t = await getTranslations('papers');
  return (
    <PageContainer>
      <div className='max-w-2xl mx-auto space-y-6'>
        <header className='space-y-1'>
          <h1 className='text-2xl font-semibold tracking-tight'>{t('uploadPageTitle')}</h1>
          <p className='text-muted-foreground text-sm'>{t('uploadPageSubtitle')}</p>
        </header>
        <UploadDropzone />
      </div>
    </PageContainer>
  );
}
