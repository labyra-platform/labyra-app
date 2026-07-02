/**
 * AuthBrandPanel — the left half of the auth split screen. A light canvas
 * carrying Labyra's identity: the wordmark (top), an interactive DotGrid that
 * reacts to the cursor (the signature), and a tagline (bottom). Server
 * component; DotGrid is a client child.
 *
 * @phase R348-auth-dotgrid
 */
import { getTranslations } from 'next-intl/server';
import { cn } from '@/lib/utils';
import { DotGrid } from './dot-grid';
import { HexMark } from './hex-mark';

const DISPLAY = { fontFamily: 'var(--font-display)' } as const;

export async function AuthBrandPanel({ className }: { className?: string }) {
  const t = await getTranslations('auth');
  return (
    <aside
      className={cn(
        'bg-muted/30 relative flex-col justify-between overflow-hidden border-r p-10',
        className
      )}
    >
      <div className='absolute inset-0'>
        <DotGrid dotSize={5} gap={26} baseColor='#d4d4d8' activeColor='#3f3f46' proximity={130} />
      </div>

      <div className='relative z-10 flex items-center gap-2.5'>
        <HexMark className='text-foreground size-7' />
        <span className='text-xl font-semibold tracking-tight' style={DISPLAY}>
          Labyra
        </span>
      </div>

      <blockquote className='relative z-10 space-y-3'>
        <p className='max-w-md text-2xl font-medium leading-snug tracking-tight' style={DISPLAY}>
          {t('brandTagline')}
        </p>
        <footer className='text-muted-foreground font-mono text-xs uppercase tracking-[0.2em]'>
          {t('brandEyebrow')}
        </footer>
      </blockquote>
    </aside>
  );
}
