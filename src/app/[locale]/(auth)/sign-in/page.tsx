'use client';

import { IconBrandGoogle, IconEye, IconEyeOff, IconLoader2 } from '@tabler/icons-react';
import { useTranslations } from 'next-intl';
import type React from 'react';
import { type FormEvent, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { HexMark } from '@/features/auth/hex-mark';
import { Link, useRouter } from '@/i18n/navigation';
import { establishSession, signInWithEmail, signInWithGoogle } from '@/lib/auth';

const DISPLAY = { fontFamily: 'var(--font-display)' } as const;

export default function SignInPage(): React.ReactElement {
  const router = useRouter();
  const t = useTranslations('auth');
  const tCommon = useTranslations('common');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleEmailSignIn(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const cred = await signInWithEmail(email, password);
      await establishSession(cred);
      router.push('/dashboard');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed');
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleSignIn(): Promise<void> {
    setLoading(true);
    setError(null);
    try {
      const cred = await signInWithGoogle();
      await establishSession(cred);
      router.push('/dashboard');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google sign-in failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className='space-y-8'>
      <div className='flex items-center gap-2 lg:hidden'>
        <HexMark className='size-6' />
        <span className='text-lg font-semibold tracking-tight' style={DISPLAY}>
          Labyra
        </span>
      </div>

      <div className='space-y-1.5'>
        <h1 className='text-2xl font-semibold tracking-tight' style={DISPLAY}>
          {t('signInTitle')}
        </h1>
        <p className='text-muted-foreground text-sm'>{t('signInSubtitle')}</p>
      </div>

      <Button
        type='button'
        variant='outline'
        className='w-full'
        onClick={() => void handleGoogleSignIn()}
        disabled={loading}
      >
        <IconBrandGoogle className='mr-2 size-4' />
        {t('continueWithGoogle')}
      </Button>

      <div className='relative'>
        <div className='absolute inset-0 flex items-center'>
          <span className='w-full border-t' />
        </div>
        <div className='relative flex justify-center text-xs uppercase'>
          <span className='bg-background text-muted-foreground px-2'>{t('or')}</span>
        </div>
      </div>

      <form onSubmit={(e) => void handleEmailSignIn(e)} className='space-y-4'>
        <div className='space-y-1.5'>
          <Label htmlFor='email'>{t('emailLabel')}</Label>
          <Input
            id='email'
            type='email'
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t('emailPlaceholder')}
            required
            autoComplete='email'
          />
        </div>
        <div className='space-y-1.5'>
          <Label htmlFor='password'>{t('passwordLabel')}</Label>
          <div className='relative'>
            <Input
              id='password'
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t('passwordPlaceholder')}
              required
              autoComplete='current-password'
              className='pr-10'
            />
            <button
              type='button'
              onClick={() => setShowPassword((v) => !v)}
              className='text-muted-foreground hover:text-foreground absolute inset-y-0 right-0 flex items-center px-3'
              aria-label={showPassword ? t('hidePassword') : t('showPassword')}
            >
              {showPassword ? <IconEyeOff className='size-4' /> : <IconEye className='size-4' />}
            </button>
          </div>
        </div>
        {error ? (
          <p className='text-destructive text-sm' role='alert'>
            {error}
          </p>
        ) : null}
        <Button type='submit' className='w-full' disabled={loading}>
          {loading ? (
            <>
              <IconLoader2 className='mr-2 size-4 animate-spin' />
              {t('signingIn')}
            </>
          ) : (
            tCommon('signIn')
          )}
        </Button>
      </form>

      <p className='text-muted-foreground text-center text-sm'>
        {t('noAccount')}{' '}
        <Link href='/sign-up' className='text-foreground font-medium hover:underline'>
          {tCommon('signUp')}
        </Link>
      </p>
    </div>
  );
}
