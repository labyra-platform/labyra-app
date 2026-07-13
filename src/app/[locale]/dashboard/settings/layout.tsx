/**
 * Settings layout — shared tab nav (General / AI / Group / Notifications /
 * Lab Context) above every /dashboard/settings/* page.
 *
 * @phase R485 — unified settings
 */
import type React from 'react';
import { SettingsNav } from '@/features/settings/components/settings-nav';

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className='flex flex-1 flex-col'>
      <div className='px-4 pt-4 md:px-6'>
        <SettingsNav />
      </div>
      {children}
    </div>
  );
}
