/**
 * Read-only lab tools — refined to match R160-data-1 schemas.
 * All tools are multi-tenant scoped via ToolContext.tenantId.
 * @phase R160-ai-tools-1
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

  const snap = await q.orderBy('updatedAt', 'desc').get();
  const byStatus: Record<string, number> = {};
  const recent: Array<{
    id: string;
    code: string;
    title: string;
    type: string;
    status: string;
  }> = [];

  for (const doc of snap.docs) {
    const data = doc.data();
    const status = data.status ?? 'unknown';
    byStatus[status] = (byStatus[status] ?? 0) + 1;
    if (recent.length < 10) {
      recent.push({
        id: doc.id,
        code: data.experimentCode ?? doc.id,
        title: data.title ?? 'Untitled',
        type: data.experimentType ?? 'other',
        status
      });
    }
  }

  return {
    count: snap.size,
    filterApplied: filterStatus,
    byStatus,
    recent
  };
}

export const countExperiments: RegisteredTool = {
  name: 'countExperiments',
  description:
    'Count and list experiments in the lab. CALL THIS for any question about experiment numbers, counts, status, or recent experiments. Vietnamese triggers: "thí nghiệm", "experiment đang chạy", "có bao nhiêu experiment", "liệt kê experiments", "experiment gì". Optional status filter (planned/running/completed/failed/cancelled). Returns total count, breakdown by status, and 10 most recently updated with code/title/type/status.',
  parameters: {
    type: 'object',
    properties: {
      status: {
        type: 'string',
        description: 'Optional status filter',
        enum: ['planned', 'running', 'completed', 'failed', 'cancelled']
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

  // 1. Try sampleCode exact match (highest specificity)
  const codeSnap = await sampleRef.where('sampleCode', '==', query).limit(5).get();
  if (!codeSnap.empty) {
    return {
      matches: codeSnap.docs.map((d) => normalizeSample(d.id, d.data())),
      matchedBy: 'sampleCode'
    };
  }

  // 2. Try doc id exact match
  const byIdSnap = await sampleRef.doc(query).get();
  if (byIdSnap.exists) {
    return {
      matches: [normalizeSample(byIdSnap.id, byIdSnap.data() ?? {})],
      matchedBy: 'id'
    };
  }

  // 3. Try name exact match
  const byNameSnap = await sampleRef.where('name', '==', query).limit(5).get();
  if (!byNameSnap.empty) {
    return {
      matches: byNameSnap.docs.map((d) => normalizeSample(d.id, d.data())),
      matchedBy: 'name'
    };
  }

  // 4. Try name prefix (fuzzy)
  const prefixSnap = await sampleRef
    .where('name', '>=', query)
    .where('name', '<=', query + '\uf8ff')
    .limit(5)
    .get();
  return {
    matches: prefixSnap.docs.map((d) => normalizeSample(d.id, d.data())),
    matchedBy: prefixSnap.empty ? 'no_match' : 'name_prefix'
  };
}

function normalizeSample(id: string, data: FirebaseFirestore.DocumentData) {
  return {
    id,
    sampleCode: data.sampleCode ?? id,
    name: data.name ?? 'Untitled',
    status: data.status ?? 'unknown',
    location: data.location ?? null,
    mass: data.mass ?? null,
    volume: data.volume ?? null,
    parentMaterialIds: data.parentMaterialIds ?? []
  };
}

export const findSample: RegisteredTool = {
  name: 'findSample',
  description:
    'Search for samples by code, name, or partial match. CALL THIS when user asks about specific samples by ID, code, or name. Vietnamese triggers: "tìm sample", "sample nào", "mẫu nào", "sample của X". Searches sampleCode first (most specific), then doc ID, then name exact, then name prefix. Returns up to 5 matches with sampleCode, name, status, location, mass/volume, and parent material IDs.',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Sample code (e.g. "S-2026-001") or name to search for'
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
  const category = typeof input.category === 'string' ? input.category : null;

  const db = getAdminFirestoreService();
  let q: FirebaseFirestore.Query = db.collection(`tenants/${ctx.tenantId}/materials`);
  if (category) {
    q = q.where('category', '==', category);
  }
  const snap = await q.orderBy('updatedAt', 'desc').limit(limit).get();

  return {
    materials: snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        name: data.name ?? 'Untitled',
        formula: data.formula ?? null,
        category: data.category ?? 'other',
        cas: data.cas ?? null,
        quantity: data.quantity ?? 0,
        unit: data.unit ?? null,
        location: data.location ?? null,
        hazardLevel: data.hazardLevel ?? 'none',
        supplier: data.supplier ?? null
      };
    }),
    total: snap.size,
    filterApplied: category
  };
}

export const recentMaterials: RegisteredTool = {
  name: 'recentMaterials',
  description:
    'List materials/chemicals/reagents/equipment in the lab inventory. CALL THIS whenever user asks to list, browse, show, see, or count materials. Vietnamese triggers: "liệt kê vật liệu", "có vật liệu gì", "danh sách vật liệu", "vật liệu trong lab", "có bao nhiêu material", "list materials", "có chemicals nào", "có dung môi nào". Optional category filter. Returns id, name, formula, category, cas, quantity+unit, location, hazardLevel, and supplier. Always call this for overview questions even without specific filter.',
  parameters: {
    type: 'object',
    properties: {
      limit: {
        type: 'integer',
        description: 'Number of materials to return (1-50, default 10)'
      },
      category: {
        type: 'string',
        description: 'Optional category filter',
        enum: ['chemical', 'reagent', 'solvent', 'gas', 'consumable', 'equipment', 'other']
      }
    },
    required: []
  },
  handler: recentMaterialsHandler
};
