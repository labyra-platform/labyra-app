'use client';

import { useEffect } from 'react';

// R192-5: dashboard-level error boundary. Catches any child route that lacks
// its own error.tsx (spectra, reference-cards, experiments, samples, …) so a
// render crash degrades to a friendly retry instead of a blank screen.
export default function DashboardError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface for debugging; replace with logger when src/lib/logger.ts lands.
    console.error('dashboard route error', error);
  }, [error]);

  return (
    <div className='mx-auto max-w-2xl p-12'>
      <div className='border-destructive/20 bg-destructive/5 space-y-3 rounded-lg p-6'>
        <h2 className='font-semibold'>Không tải được trang</h2>
        <p className='text-muted-foreground text-sm'>
          Đã có lỗi khi hiển thị trang này. Dữ liệu có thể đang được xử lý — thử lại trong giây lát.
        </p>
        <button
          type='button'
          onClick={reset}
          className='rounded-md border px-3 py-1.5 text-sm hover:bg-muted'
        >
          Thử lại
        </button>
      </div>
    </div>
  );
}
