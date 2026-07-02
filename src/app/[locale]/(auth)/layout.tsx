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
    <div className='grid min-h-screen lg:grid-cols-2'>
      <AuthBrandPanel className='hidden lg:flex' />
      <main className='flex min-w-0 items-center justify-center p-6 lg:p-8'>
        <div className='w-full max-w-sm'>{children}</div>
      </main>
    </div>
  );
}
