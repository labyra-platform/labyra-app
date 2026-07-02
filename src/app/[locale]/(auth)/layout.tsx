import type { ReactNode } from 'react';
import { AuthBrandPanel } from '@/features/auth/auth-brand-panel';

/**
 * Auth route group layout — a split screen. Left: Labyra brand panel (crystal
 * lattice, hidden below lg). Right: the auth form ({children}), centered.
 *
 * Routes: /sign-in, /sign-up
 *
 * @phase R346-auth-redesign
 */
export default function AuthLayout({ children }: { children: ReactNode }): React.ReactElement {
  return (
    <div className='flex min-h-screen'>
      <AuthBrandPanel className='hidden lg:flex lg:w-2/3' />
      <main className='flex min-w-0 flex-1 items-center justify-center p-6 sm:p-10'>
        <div className='w-full max-w-sm'>{children}</div>
      </main>
    </div>
  );
}
