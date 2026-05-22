import type { NavGroup } from '@/types';

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
const SUPERADMIN_GROUP: NavGroup = {
  label: 'Superadmin',
  labelKey: 'nav.groups.superadmin',
  items: [
    {
      title: 'Cost Overview',
      titleKey: 'nav.superadminCosts',
      url: '/dashboard/superadmin/costs',
      icon: 'dashboard',
      shortcut: ['s', 'c'],
      items: [],
      access: { role: 'superadmin' }
    },
    {
      title: 'Quality Evals',
      titleKey: 'nav.superadminEvals',
      url: '/dashboard/superadmin/evals',
      icon: 'check',
      shortcut: ['s', 'e'],
      items: [],
      access: { role: 'superadmin' }
    },
    {
      title: 'Cost Drift',
      titleKey: 'nav.superadminDrift',
      url: '/dashboard/superadmin/drift',
      icon: 'alertCircle',
      shortcut: ['s', 'd'],
      items: [],
      access: { role: 'superadmin' }
    }
  ]
};

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
        title: 'Experiments',
        titleKey: 'nav.experiments',
        url: '/dashboard/experiments',
        icon: 'experiments',
        shortcut: ['e', 'x'],
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
        // R165-phase-8-sidebar: renamed Spectra → Measurements (R164). URL kept for backward compat.
        title: 'Measurements',
        titleKey: 'nav.measurements',
        url: '/dashboard/spectra',
        icon: 'spectra',
        shortcut: ['s', 'p'],
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
        // R165-phase-8-sidebar: References entry (R164 — was buried under Spectra UI)
        title: 'References',
        titleKey: 'nav.references',
        url: '/dashboard/reference-cards',
        icon: 'papers',
        shortcut: ['r', 'e'],
        items: []
      },
      {
        title: 'Papers',
        titleKey: 'nav.papers',
        url: '/dashboard/papers',
        icon: 'papers',
        shortcut: ['p', 'a'],
        items: []
      },
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
        title: 'Research Groups',
        titleKey: 'nav.researchGroups',
        url: '/dashboard/groups',
        icon: 'teams',
        shortcut: ['g', 'r'],
        items: [],
        access: { role: 'admin' }
      },
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
          }
        ]
      }
    ]
  },
  SUPERADMIN_GROUP
];
