/**
 * Settings layout — the rail on the left, the section on the right.
 *
 * R521: the nav used to sit above the page as a tab strip, so it and the page
 * heading competed for the same top-left corner. Side by side, the rail says
 * where you are and the page says what it is, and neither has to shout.
 *
 * No gap and no padding of its own on the right: PageContainer already brings
 * px-4/md:px-6, and that padding is the gutter. Adding a gap here would stack
 * two separations on top of each other, which is the doubled-spacing bug that
 * §1 keeps warning about.
 *
 * @phase R521 — settings restructure
 */
import type React from 'react';
import { SettingsNav } from '@/features/settings/components/settings-nav';

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className='flex flex-1 flex-col md:flex-row'>
      <div className='shrink-0 px-4 pb-4 md:pr-0 md:pb-0 md:pl-6'>
        <SettingsNav />
      </div>
      {children}
    </div>
  );
}
