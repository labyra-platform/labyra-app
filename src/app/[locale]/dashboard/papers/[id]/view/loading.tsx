import { IconLoader2 } from '@tabler/icons-react';

export default function Loading() {
  return (
    <div className='flex h-[calc(100vh-4rem)] items-center justify-center'>
      <IconLoader2 className='size-8 animate-spin text-muted-foreground' />
    </div>
  );
}
