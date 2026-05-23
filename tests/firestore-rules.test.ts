/**
 * Firestore security-rules tests.
 *
 * Run via:  pnpm test:rules
 * (which wraps:  firebase emulators:exec --only firestore "vitest run tests/firestore-rules.test.ts")
 *
 * Auth contexts use Firebase custom claims (tenantId + role) — same shape as the production
 * Cloud Function that mints them.
 *
 * Two phases:
 *  1. PRE-FIX (current rules): NEGATIVE cases listed below currently SUCCEED — that demonstrates C1.
 *  2. POST-FIX: every NEGATIVE case must be DENIED; every POSITIVE case must still SUCCEED.
 */
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment
} from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

const PROJECT_ID = 'labyra-rules-test';
const TENANT_A = 'tenant-a';
const TENANT_B = 'tenant-b';

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync(resolve(__dirname, '..', 'firestore.rules'), 'utf8'),
      host: '127.0.0.1',
      port: 8080
    }
  });
});

afterAll(async () => {
  if (env) await env.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
});

// Helpers — context per role/tenant
function ctxMember(tenantId: string, uid = `${tenantId}-member`) {
  return env.authenticatedContext(uid, { tenantId, role: 'member' }).firestore();
}
function ctxAdmin(tenantId: string, uid = `${tenantId}-admin`) {
  return env.authenticatedContext(uid, { tenantId, role: 'admin' }).firestore();
}
function ctxSuperadmin(uid = 'super-1') {
  return env.authenticatedContext(uid, { tenantId: 'platform', role: 'superadmin' }).firestore();
}

// withSecurityRulesDisabled is the privileged path for seed writes
async function seed(path: string, data: Record<string, unknown>) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().doc(path).set(data);
  });
}

describe('Firestore rules — POSITIVE (writer can write own-tenant data)', () => {
  it('member CAN write materials', async () => {
    const db = ctxMember(TENANT_A);
    await assertSucceeds(
      db.doc(`tenants/${TENANT_A}/materials/m1`).set({ name: 'WO3', createdAt: Date.now() })
    );
  });
  it('member CAN write samples', async () => {
    const db = ctxMember(TENANT_A);
    await assertSucceeds(
      db.doc(`tenants/${TENANT_A}/samples/s1`).set({ name: 'S-1', createdAt: Date.now() })
    );
  });
  it('member CAN write experiments', async () => {
    const db = ctxMember(TENANT_A);
    await assertSucceeds(
      db.doc(`tenants/${TENANT_A}/experiments/e1`).set({ type: 'XRD', createdAt: Date.now() })
    );
  });
  it('member CAN write spectra', async () => {
    const db = ctxMember(TENANT_A);
    await assertSucceeds(
      db.doc(`tenants/${TENANT_A}/spectra/x1`).set({ spectrumType: 'XRD', createdAt: Date.now() })
    );
  });
  it('member CAN write equipment', async () => {
    const db = ctxMember(TENANT_A);
    await assertSucceeds(
      db.doc(`tenants/${TENANT_A}/equipment/eq1`).set({ name: 'Bruker D8', createdAt: Date.now() })
    );
  });
  it('member CAN write bookings', async () => {
    const db = ctxMember(TENANT_A);
    await assertSucceeds(
      db
        .doc(`tenants/${TENANT_A}/bookings/b1`)
        .set({ equipmentId: 'eq1', startAt: Date.now(), userId: 'u' })
    );
  });
  it('member CAN write aiConversations + messages', async () => {
    const db = ctxMember(TENANT_A);
    await assertSucceeds(
      db.doc(`tenants/${TENANT_A}/aiConversations/c1`).set({ title: 'hi', userId: 'u' })
    );
    await assertSucceeds(
      db.doc(`tenants/${TENANT_A}/aiConversations/c1/messages/m1`).set({ role: 'user', text: 'hi' })
    );
  });
  it('member CAN create an audit log entry', async () => {
    const db = ctxMember(TENANT_A);
    await assertSucceeds(
      db.doc(`tenants/${TENANT_A}/auditLogs/log-new`).set({ event: 'login', at: Date.now() })
    );
  });
});

describe('Firestore rules — NEGATIVE (these MUST be denied — current rules let them through = C1)', () => {
  it('member must NOT write usage (quota bypass risk)', async () => {
    const db = ctxMember(TENANT_A);
    await assertFails(db.doc(`tenants/${TENANT_A}/usage/2026-05`).set({ tokensUsed: 0, usd: 0 }));
  });
  it('member must NOT write aiProvenance (audit forgery)', async () => {
    const db = ctxMember(TENANT_A);
    await assertFails(
      db.doc(`tenants/${TENANT_A}/aiProvenance/p1`).set({ messageId: 'm1', model: 'forged' })
    );
  });
  it('member must NOT update an existing auditLog (immutability)', async () => {
    await seed(`tenants/${TENANT_A}/auditLogs/log1`, { event: 'login', at: 1 });
    const db = ctxMember(TENANT_A);
    await assertFails(db.doc(`tenants/${TENANT_A}/auditLogs/log1`).update({ event: 'tampered' }));
  });
  it('member must NOT delete an existing auditLog (immutability)', async () => {
    await seed(`tenants/${TENANT_A}/auditLogs/log2`, { event: 'login', at: 1 });
    const db = ctxMember(TENANT_A);
    await assertFails(db.doc(`tenants/${TENANT_A}/auditLogs/log2`).delete());
  });
  it('member must NOT write papers (RAG corruption)', async () => {
    const db = ctxMember(TENANT_A);
    await assertFails(
      db.doc(`tenants/${TENANT_A}/papers/p1`).set({ title: 'malicious', doi: 'x' })
    );
  });
  it('member must NOT write paper chunks', async () => {
    const db = ctxMember(TENANT_A);
    await assertFails(db.doc(`tenants/${TENANT_A}/papers/p1/chunks/ch1`).set({ text: 'inj' }));
  });
  it('member must NOT write citations', async () => {
    const db = ctxMember(TENANT_A);
    await assertFails(db.doc(`tenants/${TENANT_A}/citations/c1`).set({ from: 'p1', to: 'p2' }));
  });
  it('member must NOT write analyses', async () => {
    const db = ctxMember(TENANT_A);
    await assertFails(db.doc(`tenants/${TENANT_A}/analyses/a1`).set({ result: 'fake' }));
  });
  it('member must NOT write references', async () => {
    const db = ctxMember(TENANT_A);
    await assertFails(db.doc(`tenants/${TENANT_A}/references/r1`).set({ title: 'x' }));
  });
  it('member must NOT write _costs (server-only)', async () => {
    const db = ctxMember(TENANT_A);
    await assertFails(db.doc(`tenants/${TENANT_A}/_costs/2026-05`).set({ usd: 0 }));
  });
  it('member must NOT write _evals (server-only)', async () => {
    const db = ctxMember(TENANT_A);
    await assertFails(db.doc(`tenants/${TENANT_A}/_evals/e1`).set({ score: 0 }));
  });
  it('member must NOT read _rate_limits (server-only)', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc(`tenants/${TENANT_A}/_rate_limits/k1`).set({ count: 1 });
    });
    const db = ctxMember(TENANT_A);
    await assertFails(db.doc(`tenants/${TENANT_A}/_rate_limits/k1`).get());
  });
  it('member must NOT write _rate_limits (server-only)', async () => {
    const db = ctxMember(TENANT_A);
    await assertFails(db.doc(`tenants/${TENANT_A}/_rate_limits/k1`).set({ count: 999 }));
  });
  it('member must NOT read _idempotency (server-only)', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc(`tenants/${TENANT_A}/_idempotency/k1`).set({ at: 1 });
    });
    const db = ctxMember(TENANT_A);
    await assertFails(db.doc(`tenants/${TENANT_A}/_idempotency/k1`).get());
  });
});

describe('Firestore rules — cross-tenant ISOLATION', () => {
  it('member of A CANNOT read tenant B materials', async () => {
    await seed(`tenants/${TENANT_B}/materials/secret`, { secret: true });
    const db = ctxMember(TENANT_A);
    await assertFails(db.doc(`tenants/${TENANT_B}/materials/secret`).get());
  });
  it('member of A CANNOT write tenant B materials', async () => {
    const db = ctxMember(TENANT_A);
    await assertFails(db.doc(`tenants/${TENANT_B}/materials/m1`).set({ owned: 'A' }));
  });
  it('member of A CANNOT read tenant B aiConversations', async () => {
    await seed(`tenants/${TENANT_B}/aiConversations/c1`, { userId: 'b' });
    const db = ctxMember(TENANT_A);
    await assertFails(db.doc(`tenants/${TENANT_B}/aiConversations/c1`).get());
  });
});

describe('Firestore rules — members subcollection (admin-only write)', () => {
  it('member CANNOT write members', async () => {
    const db = ctxMember(TENANT_A);
    await assertFails(db.doc(`tenants/${TENANT_A}/members/x`).set({ uid: 'x', role: 'member' }));
  });
  it('admin CAN write members', async () => {
    const db = ctxAdmin(TENANT_A);
    await assertSucceeds(db.doc(`tenants/${TENANT_A}/members/x`).set({ uid: 'x', role: 'member' }));
  });
});

describe('Firestore rules — admin-only reads', () => {
  it('admin CAN read auditLogs', async () => {
    await seed(`tenants/${TENANT_A}/auditLogs/log1`, { event: 'login', at: 1 });
    const db = ctxAdmin(TENANT_A);
    await assertSucceeds(db.doc(`tenants/${TENANT_A}/auditLogs/log1`).get());
  });
  it('member CAN read own usage doc (own quota visible)', async () => {
    await seed(`tenants/${TENANT_A}/usage/2026-05`, { tokens: 100 });
    const db = ctxMember(TENANT_A);
    await assertSucceeds(db.doc(`tenants/${TENANT_A}/usage/2026-05`).get());
  });
  it('member CAN read own papers', async () => {
    await seed(`tenants/${TENANT_A}/papers/p1`, { title: 'X' });
    const db = ctxMember(TENANT_A);
    await assertSucceeds(db.doc(`tenants/${TENANT_A}/papers/p1`).get());
  });
});

describe('Firestore rules — superadmin', () => {
  it('superadmin CAN read across tenants', async () => {
    await seed(`tenants/${TENANT_B}/materials/m1`, { name: 'X' });
    const db = ctxSuperadmin();
    await assertSucceeds(db.doc(`tenants/${TENANT_B}/materials/m1`).get());
  });
});

describe('Firestore rules — materialProfiles (global, signed-in read)', () => {
  it('member CAN read materialProfiles', async () => {
    await seed(`materialProfiles/WO3`, { bandgap: 2.8 });
    const db = ctxMember(TENANT_A);
    await assertSucceeds(db.doc('materialProfiles/WO3').get());
  });
  it('member must NOT write materialProfiles (superadmin only)', async () => {
    const db = ctxMember(TENANT_A);
    await assertFails(db.doc('materialProfiles/WO3').set({ bandgap: 9 }));
  });
});

describe('Firestore rules — groups (ADR-034 TEAM-1)', () => {
  it('member CAN read own-tenant groups', async () => {
    await seed(`tenants/${TENANT_A}/groups/g1`, { name: 'Battery', createdAt: Date.now() });
    const db = ctxMember(TENANT_A);
    await assertSucceeds(db.doc(`tenants/${TENANT_A}/groups/g1`).get());
  });

  it('member CANNOT write groups (admin-managed)', async () => {
    const db = ctxMember(TENANT_A);
    await assertFails(
      db.doc(`tenants/${TENANT_A}/groups/g2`).set({ name: 'Catalysis', createdAt: Date.now() })
    );
  });

  it('admin CAN write groups', async () => {
    const db = ctxAdmin(TENANT_A);
    await assertSucceeds(
      db.doc(`tenants/${TENANT_A}/groups/g3`).set({ name: 'Membranes', createdAt: Date.now() })
    );
  });

  it('superadmin CAN read cross-tenant groups', async () => {
    await seed(`tenants/${TENANT_A}/groups/g4`, { name: 'X', createdAt: Date.now() });
    const db = ctxSuperadmin();
    await assertSucceeds(db.doc(`tenants/${TENANT_A}/groups/g4`).get());
  });

  it('other-tenant member CANNOT read tenant-A groups (isolation)', async () => {
    await seed(`tenants/${TENANT_A}/groups/g5`, { name: 'Secret', createdAt: Date.now() });
    const db = ctxMember(TENANT_B);
    await assertFails(db.doc(`tenants/${TENANT_A}/groups/g5`).get());
  });
});

describe('Firestore rules — papers group isolation (ADR-034 TEAM-4a)', () => {
  function ctxGroupMember(tenantId: string, groupId: string, uid = `${tenantId}-${groupId}-m`) {
    return env.authenticatedContext(uid, { tenantId, role: 'member', groupId }).firestore();
  }

  it('member CAN read lab-shared paper', async () => {
    await seed(`tenants/${TENANT_A}/papers/p-shared`, { groupId: 'lab-shared', title: 'S' });
    const db = ctxGroupMember(TENANT_A, 'g-battery');
    await assertSucceeds(db.doc(`tenants/${TENANT_A}/papers/p-shared`).get());
  });

  it('member CAN read own-group paper', async () => {
    await seed(`tenants/${TENANT_A}/papers/p-own`, { groupId: 'g-battery', title: 'O' });
    const db = ctxGroupMember(TENANT_A, 'g-battery');
    await assertSucceeds(db.doc(`tenants/${TENANT_A}/papers/p-own`).get());
  });

  it('member CANNOT read other-group paper (isolation)', async () => {
    await seed(`tenants/${TENANT_A}/papers/p-other`, { groupId: 'g-catalysis', title: 'X' });
    const db = ctxGroupMember(TENANT_A, 'g-battery');
    await assertFails(db.doc(`tenants/${TENANT_A}/papers/p-other`).get());
  });

  it('admin CAN read any-group paper (cross-group visibility)', async () => {
    await seed(`tenants/${TENANT_A}/papers/p-other2`, { groupId: 'g-catalysis', title: 'Y' });
    const db = ctxAdmin(TENANT_A);
    await assertSucceeds(db.doc(`tenants/${TENANT_A}/papers/p-other2`).get());
  });
});
// =====================================================
// AI memory — ADR-035 (M0 foundation)
// =====================================================
// Context helper that also carries a uid (preferences are keyed by auth uid).
function ctxUser(uid: string, tenantId: string, role = 'member') {
  return env.authenticatedContext(uid, { tenantId, role }).firestore();
}

describe('Firestore rules — L3 AiPreferences (top-level, own-user only)', () => {
  it('user CAN read+write OWN preferences', async () => {
    const db = ctxUser('alice', TENANT_A);
    await assertSucceeds(
      db.doc('users/alice/aiPreferences/settings').set({ language: 'vi', updatedAt: Date.now() })
    );
    await assertSucceeds(db.doc('users/alice/aiPreferences/settings').get());
  });

  it('user CANNOT read ANOTHER user preferences', async () => {
    await seed('users/bob/aiPreferences/settings', { language: 'en', updatedAt: 1 });
    const db = ctxUser('alice', TENANT_A);
    await assertFails(db.doc('users/bob/aiPreferences/settings').get());
  });

  it('user CANNOT write ANOTHER user preferences', async () => {
    const db = ctxUser('alice', TENANT_A);
    await assertFails(
      db.doc('users/bob/aiPreferences/settings').set({ language: 'en', updatedAt: Date.now() })
    );
  });

  it('superadmin CANNOT read another user preferences (personal, no platform override)', async () => {
    await seed('users/bob/aiPreferences/settings', { language: 'en', updatedAt: 1 });
    const db = ctxSuperadmin();
    await assertFails(db.doc('users/bob/aiPreferences/settings').get());
  });

  it('unauthenticated CANNOT read preferences', async () => {
    await seed('users/bob/aiPreferences/settings', { language: 'en', updatedAt: 1 });
    const db = env.unauthenticatedContext().firestore();
    await assertFails(db.doc('users/bob/aiPreferences/settings').get());
  });
});

describe('Firestore rules — L4 aiContext (tenant-shared: read member / write admin)', () => {
  it('member CAN read own-tenant aiContext', async () => {
    await seed(`tenants/${TENANT_A}/aiContext/main`, { labName: 'Vật liệu BKU', updatedAt: 1 });
    const db = ctxMember(TENANT_A);
    await assertSucceeds(db.doc(`tenants/${TENANT_A}/aiContext/main`).get());
  });

  it('member CANNOT write aiContext (admin-managed)', async () => {
    const db = ctxMember(TENANT_A);
    await assertFails(
      db.doc(`tenants/${TENANT_A}/aiContext/main`).set({ labName: 'x', updatedAt: Date.now() })
    );
  });

  it('admin CAN write aiContext', async () => {
    const db = ctxAdmin(TENANT_A);
    await assertSucceeds(
      db
        .doc(`tenants/${TENANT_A}/aiContext/main`)
        .set({ labName: 'BKU', updatedAt: Date.now(), updatedBy: `${TENANT_A}-admin` })
    );
  });

  it('other-tenant member CANNOT read tenant-A aiContext (isolation)', async () => {
    await seed(`tenants/${TENANT_A}/aiContext/main`, { labName: 'Secret', updatedAt: 1 });
    const db = ctxMember(TENANT_B);
    await assertFails(db.doc(`tenants/${TENANT_A}/aiContext/main`).get());
  });
});

describe('Firestore rules — L1/L2 userMemories (own-user within tenant only)', () => {
  it('owner CAN write+read OWN facts', async () => {
    const db = ctxUser('alice', TENANT_A);
    await assertSucceeds(
      db
        .doc(`tenants/${TENANT_A}/userMemories/alice/facts/f1`)
        .set({ subject: 'user.research_focus', object: 'WO3', extractedAt: Date.now() })
    );
    await assertSucceeds(db.doc(`tenants/${TENANT_A}/userMemories/alice/facts/f1`).get());
  });

  it('owner CAN write+read OWN episodes', async () => {
    const db = ctxUser('alice', TENANT_A);
    await assertSucceeds(
      db
        .doc(`tenants/${TENANT_A}/userMemories/alice/episodes/e1`)
        .set({ summary: 'WO3 chat', topics: ['WO3'], createdAt: Date.now() })
    );
    await assertSucceeds(db.doc(`tenants/${TENANT_A}/userMemories/alice/episodes/e1`).get());
  });

  it('member CANNOT read ANOTHER user memories in same tenant', async () => {
    await seed(`tenants/${TENANT_A}/userMemories/bob/facts/f1`, { subject: 'x', object: 'y' });
    const db = ctxUser('alice', TENANT_A);
    await assertFails(db.doc(`tenants/${TENANT_A}/userMemories/bob/facts/f1`).get());
  });

  it('admin CANNOT read another member private memories (privacy, not data)', async () => {
    await seed(`tenants/${TENANT_A}/userMemories/bob/facts/f1`, { subject: 'x', object: 'y' });
    const db = ctxAdmin(TENANT_A, 'alice-admin');
    await assertFails(db.doc(`tenants/${TENANT_A}/userMemories/bob/facts/f1`).get());
  });

  it('cross-tenant: user CANNOT read same-uid memories in another tenant', async () => {
    await seed(`tenants/${TENANT_B}/userMemories/alice/facts/f1`, { subject: 'x', object: 'y' });
    const db = ctxUser('alice', TENANT_A);
    await assertFails(db.doc(`tenants/${TENANT_B}/userMemories/alice/facts/f1`).get());
  });

  it('owner CANNOT write memories in a tenant they do not belong to', async () => {
    const db = ctxUser('alice', TENANT_A);
    await assertFails(
      db
        .doc(`tenants/${TENANT_B}/userMemories/alice/facts/f1`)
        .set({ subject: 'x', object: 'y', extractedAt: Date.now() })
    );
  });
});
