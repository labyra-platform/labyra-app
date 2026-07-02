import type { ReactNode } from 'react';
import { AuthBrandPanel } from '@/features/auth/auth-brand-panel';
import { DotGrid } from '@/features/auth/dot-grid';

/**
 * Auth route group layout — one full-screen interactive DotGrid behind
 * everything, progressively blurred from left toward the form column
 * (mask-image gradient over a backdrop-blur layer). Left: brand (logo +
 * tagline, transparent, hidden below lg). Right: the auth card.
 *
 * @phase R350-auth-polish
 */
export default function AuthLayout({ children }: { children: ReactNode }): React.ReactElement {
  const blurMask = 'linear-gradient(to right, transparent 42%, black 72%)';
  return (
    <div className='relative min-h-screen overflow-hidden'>
      <div className='absolute inset-0'>
        <DotGrid dotSize={5} gap={26} baseColor='#d4d4d8' activeColor='#3f3f46' proximity={130} />
      </div>
      <div
        className='pointer-events-none absolute inset-0 backdrop-blur-[3px]'
        style={{ maskImage: blurMask, WebkitMaskImage: blurMask }}
      />

      <div className='relative grid min-h-screen lg:grid-cols-2'>
        <AuthBrandPanel className='hidden lg:flex' />
        <main className='flex min-w-0 items-center justify-center p-6 lg:p-8'>
          <div className='w-full max-w-sm'>{children}</div>
        </main>
      </div>
    </div>
  );
}
