/**
 * NavBack — universal back button using Next.js router.
 *
 * Behavior:
 * - If history > 1: router.back()
 * - Else: navigate to fallback URL
 *
 * @phase R161-nav
 */
'use client';

import { useRouter } from 'next/navigation';
import { IconArrowLeft } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';

interface NavBackProps {
  fallback: string;
  label?: string;
  variant?: 'default' | 'outline' | 'ghost';
}

export function NavBack({ fallback, label = 'Back', variant = 'ghost' }: NavBackProps) {
  const router = useRouter();

  const handleClick = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
    } else {
      router.push(fallback);
    }
  };

  return (
    <Button variant={variant} size='sm' onClick={handleClick} className='gap-1'>
      <IconArrowLeft className='size-4' />
      {label}
    </Button>
  );
}
