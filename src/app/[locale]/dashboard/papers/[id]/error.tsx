'use client';

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className='p-12 max-w-2xl mx-auto'>
      <div className='border-destructive/20 bg-destructive/5 rounded-lg p-6 space-y-3'>
        <h2 className='font-semibold'>Something went wrong</h2>
        <p className='text-sm text-muted-foreground'>{error.message}</p>
        <button onClick={reset} className='text-sm underline'>
          Try again
        </button>
      </div>
    </div>
  );
}
