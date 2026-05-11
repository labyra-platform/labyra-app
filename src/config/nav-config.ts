import { NavGroup } from '@/types';

/**
 * Navigation configuration with RBAC support.
 *
 * Groups:
 *   - Workspace: primary research workflow surfaces
 *   - Lab Resources: inventory + booking + lineage views
 *   - AI: AI Assistant (differentiator, intentionally standalone)
 *   - Admin: members + account settings
 *
 * Used for both the sidebar navigation and Cmd+K bar.
 *
 * RBAC: each item may declare an `access` property — see types/index.ts.
 * Examples:
 *   access: { requireOrg: true }
 *   access: { permission: 'org:teams:manage' }
 *   access: { plan: 'pro' }
 *   access: { role: 'admin' }
 */
export const navGroups: NavGroup[] = [
  {
    label: 'Workspace',
    labelKey: 'nav.groups.workspace',
    items: [
      {
        title: 'Dashboard',
        titleKey: 'nav.dashboard',
        url: '/dashboard/overview',
        icon: 'dashboard',
        shortcut: ['d', 'd'],
        items: []
      },
      {
        title: 'Materials',
        titleKey: 'nav.materials',
        url: '/dashboard/materials',
        icon: 'materials',
        shortcut: ['m', 'a'],
        items: []
      },
      {
        title: 'Samples',
        titleKey: 'nav.samples',
        url: '/dashboard/samples',
        icon: 'samples',
        shortcut: ['s', 'a'],
        items: []
      },
      {
        title: 'Experiments',
        titleKey: 'nav.experiments',
        url: '/dashboard/experiments',
        icon: 'experiments',
        shortcut: ['e', 'x'],
        items: []
      },
      {
        title: 'Data Assets',
        titleKey: 'nav.dataAssets',
        url: '/dashboard/data-assets',
        icon: 'dataAssets',
        shortcut: ['d', 'a'],
        items: []
      }
    ]
  },
  {
    label: 'Lab Resources',
    labelKey: 'nav.groups.labResources',
    items: [
      {
        title: 'Chemicals',
        titleKey: 'nav.chemicals',
        url: '/dashboard/chemicals',
        icon: 'chemicals',
        shortcut: ['c', 'h'],
        items: []
      },
      {
        title: 'Equipment',
        titleKey: 'nav.equipment',
        url: '/dashboard/equipment',
        icon: 'equipment',
        shortcut: ['e', 'q'],
        items: []
      },
      {
        title: 'Bookings',
        titleKey: 'nav.bookings',
        url: '/dashboard/bookings',
        icon: 'bookings',
        shortcut: ['b', 'o'],
        items: []
      },
      {
        title: 'Lineage',
        titleKey: 'nav.lineage',
        url: '/dashboard/lineage',
        icon: 'lineage',
        shortcut: ['l', 'i'],
        items: []
      }
    ]
  },
  {
    label: 'AI',
    labelKey: 'nav.groups.ai',
    items: [
      {
        title: 'AI Assistant',
        titleKey: 'nav.aiAssistant',
        url: '/dashboard/ai-assistant',
        icon: 'aiAssistant',
        shortcut: ['a', 'i'],
        items: []
      }
    ]
  },
  {
    label: 'Admin',
    labelKey: 'nav.groups.admin',
    items: [
      {
        title: 'Members',
        titleKey: 'nav.members',
        url: '/dashboard/members',
        icon: 'members',
        shortcut: ['m', 'e'],
        items: []
      },
      {
        title: 'Account',
        titleKey: 'nav.account',
        url: '#',
        icon: 'account',
        isActive: true,
        items: [
          {
            title: 'Notifications',
            titleKey: 'nav.notifications',
            url: '/dashboard/notifications',
            icon: 'notification',
            shortcut: ['n', 'n']
          },
          {
            title: 'Login',
            titleKey: 'nav.login',
            shortcut: ['l', 'l'],
            url: '/',
            icon: 'login'
          }
        ]
      }
    ]
  }
];
