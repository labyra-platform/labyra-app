import type { NavGroup } from '@/types';

/**
 * Navigation configuration with RBAC support.
 *
 * R262: restructured to the Labyra IA spec (labyra-ia-sidebar-spec.md) — six
 * groups (Workspace / Data Assets / Lab Resources / Research / Insights /
 * Admin) + Superadmin. Principle: data viewed where it is produced; group
 * labels are NOT entities; names distinguished by nature (Protocol Templates,
 * Spectral Standards) not by suffix. Items whose feature routes are not built
 * yet point at "Coming soon" placeholders so the tree is navigable.
 *
 * RBAC: each item may declare an `access` property — see types/index.ts.
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
        // Experiments = container entity; Protocol/Samples/Measurements/Computation
        // are viewed in context here (data viewed where produced). DFT is NOT a
        // separate tab — it is a job type inside Computation.
        title: 'Experiments',
        titleKey: 'nav.experiments',
        url: '/dashboard/experiments',
        icon: 'experiments',
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
            items: []
          },
          {
            // URL kept as /spectra for backward compat (renamed Spectra→Measurements R164).
            title: 'Measurements',
            titleKey: 'nav.measurements',
            url: '/dashboard/spectra',
            icon: 'spectra',
            items: []
          },
          {
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
    // Group LABEL only (not an entity). Holds imported/standard data + the
    // cross-experiment "view all" entry to Measurements.
    label: 'Data Assets',
    labelKey: 'nav.groups.dataAssets',
    items: [
      {
        title: 'Measurements',
        titleKey: 'nav.measurements',
        url: '/dashboard/data-assets',
        icon: 'dataAssets',
        shortcut: ['d', 'm'],
        items: []
      },
      {
        // Was "Reference cards" — renamed Spectral Standards (reference spectra
        // for comparison: FTIR/XRD/Raman...). Distinct from References (citations).
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
        // Reusable protocol templates (≠ Protocol instance under an Experiment).
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
    label: 'Research',
    labelKey: 'nav.groups.research',
    items: [
      {
        // Citations / BibTeX (≠ Spectral Standards). Frozen citation schema.
        title: 'References',
        titleKey: 'nav.references',
        url: '/dashboard/references',
        icon: 'references',
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
      },
      {
        // "AI generates" hub: Manuscripts + Figure Studio.
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
            items: []
          },
          {
            title: 'Studio',
            titleKey: 'nav.studio',
            url: '/dashboard/studio',
            icon: 'studio',
            items: []
          }
        ]
      }
    ]
  },
  {
    // Provenance cuts across every entity → its own group.
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
        // Project = WHAT (research topic) ⟂ Group = WHO. MVP lives in Admin.
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
