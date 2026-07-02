/**
 * AuthBrandPanel — the left column of the auth screen. Transparent (the
 * full-screen DotGrid behind the layout shows through): the Labyra mark +
 * wordmark on top, the tagline (with a forced line break) at the bottom.
 *
 * @phase R350-auth-polish
 */
import { getTranslations } from 'next-intl/server';
import { cn } from '@/lib/utils';
import { HexMark } from './hex-mark';

const DISPLAY = { fontFamily: 'var(--font-display)' } as const;

export async function AuthBrandPanel({ className }: { className?: string }) {
  const t = await getTranslations('auth');
  return (
    <aside className={cn('relative flex-col justify-between p-10', className)}>
      <div className='flex items-center gap-3'>
        <HexMark className='text-foreground size-10' />
        <span className='text-3xl font-semibold tracking-tight' style={DISPLAY}>
          Labyra
        </span>
      </div>

      <blockquote className='space-y-3'>
        <p
          className='max-w-md whitespace-pre-line text-3xl font-medium leading-snug tracking-tight'
          style={DISPLAY}
        >
          {t('brandTagline')}
        </p>
        <footer className='text-muted-foreground font-mono text-xs uppercase tracking-[0.2em]'>
          {t('brandEyebrow')}
        </footer>
      </blockquote>
    </aside>
  );
}
