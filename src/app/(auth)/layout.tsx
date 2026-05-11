import type { ReactNode } from 'react';

/**
 * Auth route group layout — centered, no sidebar/header.
 *
 * Routes: /sign-in, /sign-up, /forgot-password
 */
export default function AuthLayout({ children }: { children: ReactNode }): React.ReactElement {
  return (
    <div className='flex min-h-screen items-center justify-center bg-background'>
      <div className='w-full max-w-md p-6'>{children}</div>
    </div>
  );
}
