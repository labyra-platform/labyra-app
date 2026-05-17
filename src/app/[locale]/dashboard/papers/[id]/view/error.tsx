'use client';

import { IconAlertCircle } from '@tabler/icons-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className='mx-auto max-w-2xl p-12'>
      <Alert variant='destructive'>
        <IconAlertCircle className='size-4' />
        <AlertTitle>Failed to load PDF</AlertTitle>
        <AlertDescription className='mt-2 space-y-3'>
          <p className='text-sm'>{error.message}</p>
          <Button variant='outline' size='sm' onClick={reset}>
            Try again
          </Button>
        </AlertDescription>
      </Alert>
    </div>
  );
}
