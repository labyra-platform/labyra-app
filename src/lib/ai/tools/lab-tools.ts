/**
 * Read-only lab tools — first iteration.
 * All tools are multi-tenant scoped via ToolContext.tenantId.
 * @phase R160-ai-3c1
 */
import { getAdminFirestoreService } from '@/lib/firebase/admin';
import type { RegisteredTool, ToolContext } from './types';

// ─── countExperiments ─────────────────────────────────────────────
async function countExperimentsHandler(input: Record<string, unknown>, ctx: ToolContext) {
  const db = getAdminFirestoreService();
  const expRef = db.collection(`tenants/${ctx.tenantId}/experiments`);

  let q: FirebaseFirestore.Query = expRef;
  const filterStatus = typeof input.status === 'string' ? input.status : null;
  if (filterStatus) {
    q = q.where('status', '==', filterStatus);
  }

  const snap = await q.get();
  const byStatus: Record<string, number> = {};
  const recentlyUpdated: Array<{ id: string; title: string; status: string }> = [];

  for (const doc of snap.docs) {
    const data = doc.data();
    const status = data.status ?? 'unknown';
    byStatus[status] = (byStatus[status] ?? 0) + 1;
    recentlyUpdated.push({
      id: doc.id,
      title: data.title ?? 'Untitled',
      status
    });
  }

  recentlyUpdated.sort((a, b) => a.id.localeCompare(b.id));
  return {
    count: snap.size,
    filterApplied: filterStatus,
    byStatus,
    recentlyUpdated: recentlyUpdated.slice(0, 10)
  };
}

export const countExperiments: RegisteredTool = {
  name: 'countExperiments',
  description:
    'Count experiments in the lab. CALL THIS whenever user asks about experiment numbers, counts, list of experiments, or experiment status. Vietnamese triggers: "thí nghiệm", "experiment đang chạy", "có bao nhiêu", "liệt kê experiments". Optional status filter (running/completed/draft). Returns total count, breakdown by status, and list of recent experiments.',
  parameters: {
    type: 'object',
    properties: {
      status: {
        type: 'string',
        description: 'Optional status filter',
        enum: ['running', 'completed', 'draft']
      }
    },
    required: []
  },
  handler: countExperimentsHandler
};

// ─── findSample ───────────────────────────────────────────────────
async function findSampleHandler(input: Record<string, unknown>, ctx: ToolContext) {
  const query = typeof input.query === 'string' ? input.query.trim() : '';
  if (!query) {
    return { matches: [], error: 'query parameter is required' };
  }

  const db = getAdminFirestoreService();
  const sampleRef = db.collection(`tenants/${ctx.tenantId}/samples`);

  // Exact-match attempt first (by id or name)
  const byIdSnap = await sampleRef.doc(query).get();
  if (byIdSnap.exists) {
    return {
      matches: [{ id: byIdSnap.id, ...byIdSnap.data() }],
      matchedBy: 'id'
    };
  }

  const byNameSnap = await sampleRef.where('name', '==', query).limit(5).get();
  if (!byNameSnap.empty) {
    return {
      matches: byNameSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
      matchedBy: 'name'
    };
  }

  // Fuzzy: prefix match on name
  const prefixSnap = await sampleRef
    .where('name', '>=', query)
    .where('name', '<=', query + '\uf8ff')
    .limit(5)
    .get();
  return {
    matches: prefixSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
    matchedBy: prefixSnap.empty ? 'no_match' : 'name_prefix'
  };
}

export const findSample: RegisteredTool = {
  name: 'findSample',
  description:
    'Find/lookup a specific sample in the lab by ID or name. CALL THIS when user mentions a sample name or ID. Vietnamese triggers: "tìm sample", "tìm mẫu", "sample [name]". Returns up to 5 matching samples with full details (material, synthesis method, morphology, mass, status, notes).',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Sample ID (e.g. "smp-wo3-ht-001") or name (e.g. "WO3-HT-001")'
      }
    },
    required: ['query']
  },
  handler: findSampleHandler
};

// ─── recentMaterials ──────────────────────────────────────────────
async function recentMaterialsHandler(input: Record<string, unknown>, ctx: ToolContext) {
  const limit =
    typeof input.limit === 'number' && input.limit > 0 && input.limit <= 50 ? input.limit : 10;

  const db = getAdminFirestoreService();
  const matRef = db.collection(`tenants/${ctx.tenantId}/materials`);
  const snap = await matRef.orderBy('createdAt', 'desc').limit(limit).get();

  return {
    materials: snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        name: data.name,
        formula: data.formula,
        category: data.category,
        bandgapEv: data.bandgapEv,
        tags: data.tags ?? []
      };
    }),
    total: snap.size
  };
}

export const recentMaterials: RegisteredTool = {
  name: 'recentMaterials',
  description:
    'List materials/chemicals/compounds available in the lab inventory. CALL THIS whenever user asks to list, browse, show, see, or enumerate materials. Vietnamese triggers: "liệt kê vật liệu", "có vật liệu gì", "danh sách vật liệu", "vật liệu trong lab", "list materials". Returns id, name, formula, category, bandgap, and tags. Always call this when user wants an overview of materials, even without a specific filter.',
  parameters: {
    type: 'object',
    properties: {
      limit: {
        type: 'integer',
        description: 'Number of materials to return (1-50, default 10)'
      }
    },
    required: []
  },
  handler: recentMaterialsHandler
};
