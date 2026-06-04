import type { NavGroup } from '@/types';

/**
 * Navigation configuration with RBAC support.
 *
 * Groups (R262 — IA spec):
 *   - Workspace:     primary research workflow surfaces
 *   - Data Assets:   ingested / standard data (Spectral Standards). Group label
 *                    only — measurements/DFT output are viewed where they are
 *                    produced, not dumped here.
 *   - Lab Resources: reusable lab inventory + booking
 *   - Research:      Papers (RAG), AI Assistant, AI Science (Manuscripts)
 *   - Insights:      cross-cutting provenance (Lineage)
 *   - Admin:         groups, preferences, members, account
 *
 * Used for both the sidebar navigation and Cmd+K bar.
 *
 * RBAC: each item may declare an `access` property — see types/index.ts.
 * Examples:
 *   access: { requireOrg: true }
 *   access: { permission: 'org:teams:manage' }
 *   access: { plan: 'pro' }
 *   access: { role: 'admin' }
 *
 * DEFERRED (need new routes — see ia-sidebar-spec): Experiments nesting
 * (Protocol/Samples/Measurements/Computation→DFT), Protocol Templates, Studio,
 * Projects, References (citations), Measurements all-view under Data Assets.
 */
const SUPERADMIN_GROUP: NavGroup = {
  label: 'Superadmin',
  labelKey: 'nav.groups.superadmin',
  items: [
    {
      title: 'Cost Overview',
      titleKey: 'nav.superadminCosts',
      url: '/dashboard/superadmin/costs',
      icon: 'costOverview',
      shortcut: ['s', 'c'],
      items: [],
      access: { role: 'superadmin' }
    },
    {
      title: 'Quality Evals',
      titleKey: 'nav.superadminEvals',
      url: '/dashboard/superadmin/evals',
      icon: 'evals',
      shortcut: ['s', 'e'],
      items: [],
      access: { role: 'superadmin' }
    },
    {
      title: 'Cost Drift',
      titleKey: 'nav.superadminDrift',
      url: '/dashboard/superadmin/drift',
      icon: 'costDrift',
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
        // R164: renamed Spectra → Measurements. URL kept (/spectra) for back-compat.
        title: 'Measurements',
        titleKey: 'nav.measurements',
        url: '/dashboard/spectra',
        icon: 'spectra',
        shortcut: ['s', 'p'],
        items: []
      }
    ]
  },
  {
    // R262: Data Assets = group label (ingested/standard data). Not an entity.
    label: 'Data Assets',
    labelKey: 'nav.groups.dataAssets',
    items: [
      {
        // R262: was "References" — this list is the spectral reference cards
        // (FTIR/XRD standards), renamed to Spectral Standards per the IA spec.
        // URL kept (/reference-cards) to avoid a route rename. icon ti-cards.
        title: 'Spectral Standards',
        titleKey: 'nav.spectralStandards',
        url: '/dashboard/reference-cards',
        icon: 'references',
        shortcut: ['s', 's'],
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
      }
    ]
  },
  {
    // R262: "Research workspace" → "Research".
    label: 'Research',
    labelKey: 'nav.groups.research',
    items: [
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
      },
      {
        title: 'AI Science',
        titleKey: 'nav.aiScience',
        url: '/dashboard/manuscripts',
        icon: 'aiScience',
        isActive: true,
        items: [
          {
            title: 'Manuscripts',
            titleKey: 'nav.manuscripts',
            url: '/dashboard/manuscripts',
            icon: 'manuscripts',
            shortcut: ['m', 's'],
            items: []
          }
        ]
      }
    ]
  },
  {
    // R262: Insights = cross-cutting provenance (Lineage moved out of Lab Resources).
    label: 'Insights',
    labelKey: 'nav.groups.insights',
    items: [
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
    label: 'Admin',
    labelKey: 'nav.groups.admin',
    items: [
      {
        // R264: Project entity (Đề tài). MVP lives in Admin; v2 = switcher.
        title: 'Projects',
        titleKey: 'nav.projects',
        url: '/dashboard/projects',
        icon: 'projects',
        shortcut: ['p', 'r'],
        items: []
      },
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
        title: 'AI Preferences',
        titleKey: 'nav.aiPreferences',
        url: '/dashboard/settings/ai-preferences',
        icon: 'settings',
        shortcut: ['a', 'p'],
        items: []
      },
      {
        title: 'Lab Context',
        titleKey: 'nav.labContext',
        url: '/dashboard/settings/lab-context',
        icon: 'adjustments',
        shortcut: ['l', 'c'],
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
