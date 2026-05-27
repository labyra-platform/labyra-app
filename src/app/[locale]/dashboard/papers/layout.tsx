import { PapersWorkspace } from '@/features/papers/components/papers-workspace';

/**
 * Papers layout — hosts the persistent reader workspace (R227).
 *
 * Why a layout (not the page): Next.js does not unmount a layout when navigating
 * between its child routes. By mounting the tab strip + the readers here, they
 * survive navigation between the list (/papers) and individual papers
 * (/papers/[id]). That is what lets:
 *   - the tab strip stay visible even on the list (Edge-style), and
 *   - switching tabs be INSTANT — every open paper's reader stays mounted
 *     (hidden via CSS), so there is no react-pdf remount / reload when you flip
 *     between tabs. Page/zoom/scroll are preserved live in the DOM, not just the
 *     store.
 *
 * `children` is the routed content (the list page, or a thin [id] page that only
 * syncs the active tab). The workspace decides what to show on top.
 */
export default function PapersLayout({ children }: { children: React.ReactNode }) {
  return <PapersWorkspace>{children}</PapersWorkspace>;
}
