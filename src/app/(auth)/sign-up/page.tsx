'use client';

import type React from 'react';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { signUpWithEmail, signInWithGoogle } from '@/lib/auth';

export default function SignUpPage(): React.ReactElement {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleEmailSignUp(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await signUpWithEmail(email, password);
      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-up failed');
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleSignIn(): Promise<void> {
    setLoading(true);
    setError(null);
    try {
      await signInWithGoogle();
      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google sign-in failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className='space-y-6'>
      <div className='text-center'>
        <h1 className='text-2xl font-semibold tracking-tight'>Create your Labyra account</h1>
        <p className='text-sm text-muted-foreground'>Tạo tài khoản để truy cập lab platform</p>
      </div>

      <button
        onClick={handleGoogleSignIn}
        disabled={loading}
        className='w-full rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent disabled:opacity-50'
      >
        Continue with Google
      </button>

      <div className='relative'>
        <div className='absolute inset-0 flex items-center'>
          <span className='w-full border-t' />
        </div>
        <div className='relative flex justify-center text-xs uppercase'>
          <span className='bg-background px-2 text-muted-foreground'>Or</span>
        </div>
      </div>

      <form onSubmit={handleEmailSignUp} className='space-y-4'>
        <input
          type='email'
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder='email@example.com'
          required
          className='w-full rounded-md border border-input bg-background px-3 py-2 text-sm'
        />
        <input
          type='password'
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder='Password (min 8 chars)'
          minLength={8}
          required
          className='w-full rounded-md border border-input bg-background px-3 py-2 text-sm'
        />
        {error && (
          <p className='text-sm text-destructive' role='alert'>
            {error}
          </p>
        )}
        <button
          type='submit'
          disabled={loading}
          className='w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50'
        >
          {loading ? 'Creating account...' : 'Create account'}
        </button>
      </form>

      <p className='text-center text-sm text-muted-foreground'>
        Already have an account?{' '}
        <a href='/sign-in' className='font-medium text-primary hover:underline'>
          Sign in
        </a>
      </p>
    </div>
  );
}
