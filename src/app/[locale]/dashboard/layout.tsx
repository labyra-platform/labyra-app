import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { OrphanGuard } from '@/components/auth/orphan-guard';
import KBar from '@/components/kbar';
import AppSidebar from '@/components/layout/app-sidebar';
import Header from '@/components/layout/header';
import { InfoSidebarConditional } from '@/components/layout/info-sidebar-conditional';
import { InfobarProvider } from '@/components/ui/infobar';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';

export const metadata: Metadata = {
  title: 'Dashboard | Labyra',
  description: 'Labyra — AI-native lab management.',
  robots: {
    index: false,
    follow: false
  }
};

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  // Persisting the sidebar state in the cookie.
  const cookieStore = await cookies();
  const defaultOpen = cookieStore.get('sidebar_state')?.value === 'true';
  return (
    <KBar>
      <SidebarProvider defaultOpen={defaultOpen}>
        {/* UI-4: skip-link — visible on keyboard focus (WCAG 2.4.1) */}
        <a
          href='#main-content'
          className='sr-only focus:not-sr-only focus:bg-background focus:ring-ring focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded-md focus:border focus:px-3 focus:py-2 focus:ring-2'
        >
          Skip to main content
        </a>
        <AppSidebar />
        <SidebarInset>
          <Header />
          <main id='main-content' className='flex-1'>
            <InfobarProvider defaultOpen={false}>
              <OrphanGuard>{children}</OrphanGuard>
              {/* @r179-7-applied: InfoSidebar hidden on /view pages via client check */}
              <InfoSidebarConditional />
            </InfobarProvider>
          </main>
        </SidebarInset>
      </SidebarProvider>
    </KBar>
  );
}
