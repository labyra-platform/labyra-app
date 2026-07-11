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
 * R271: wired the mockup-target items whose routes now exist — Protocol +
 * Computation under Experiments ▾, Measurements (all-view) under Data Assets,
 * Protocol Templates under Lab Resources, References + Studio under Research.
 * Still pending real features: Computation ▾ → DFT/MD/ML split (only the
 * combined /computation stub exists today) and Protocol-instance per experiment.
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
        // R266/R271: Experiments ▾ owns its sub-entities (Protocol / Samples /
        // Measurements / Computation). R271b makes the parent itself navigate to
        // the experiments list (label links, a separate chevron toggles), so the
        // old "All experiments" first child is no longer needed.
        title: 'Experiments',
        titleKey: 'nav.experiments',
        url: '/dashboard/experiments',
        icon: 'experiments',
        shortcut: ['e', 'x'],
        isActive: true,
        items: [
          {
            title: 'Protocol',
            titleKey: 'nav.protocol',
            url: '/dashboard/experiments/protocol',
            icon: 'protocol',
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
          },
          {
            // R271: leaf → /computation (DFT/MD/ML combined stub). Becomes ▾ with
            // DFT/MD/ML children once those get their own routes.
            title: 'Computation',
            titleKey: 'nav.computation',
            url: '/dashboard/computation',
            icon: 'computation',
            items: []
          }
        ]
      }
    ]
  },
  {
    // R262: Data Assets = group label (ingested/standard data). Not an entity.
    label: 'Data Assets',
    labelKey: 'nav.groups.dataAssets',
    items: [
      {
        // R271: all-measurements entry (same /spectra list, also reachable scoped
        // under Experiments ▾). Per the IA spec, Data Assets is the lateral
        // "view everything" entry point — no shortcut (avoids the s,p dup).
        title: 'Measurements',
        titleKey: 'nav.measurements',
        url: '/dashboard/spectra',
        icon: 'spectra',
        items: []
      },
      {
        // R262: was "References" — this list is the spectral reference cards
        // (FTIR/XRD standards), renamed to Spectral Standards per the IA spec.
        // URL kept (/reference-cards) to avoid a route rename. icon ti-cards
        // (R266: was 'references' = IconQuote — that quote glyph is for the
        // future References/citations item; standards use the cards glyph).
        title: 'Spectral Standards',
        titleKey: 'nav.spectralStandards',
        url: '/dashboard/reference-cards',
        icon: 'spectralStandards',
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
      },
      {
        // R271: reusable protocol library (R270b) — Lab Resources per the mockup.
        title: 'Protocol Templates',
        titleKey: 'nav.protocolTemplates',
        url: '/dashboard/protocol-templates',
        icon: 'protocolTemplates',
        shortcut: ['p', 't'],
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
        // R271: literature References (citations) — route now exists.
        title: 'References',
        titleKey: 'nav.references',
        url: '/dashboard/references',
        icon: 'references',
        shortcut: ['r', 'e'],
        items: []
      },
      {
        title: 'Documents',
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
          },
          {
            // R271: Figure Studio (R209–R219) now wired under AI Science ▾.
            title: 'Studio',
            titleKey: 'nav.studio',
            url: '/dashboard/studio',
            icon: 'studio',
            shortcut: ['s', 't'],
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
        title: 'Account',
        titleKey: 'nav.accountSettings',
        url: '/dashboard/settings/account',
        icon: 'account',
        shortcut: ['a', 'c'],
        items: []
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
