/**
 * POST /api/material-profiles
 * Seed or update a material knowledge profile.
 * Superadmin only — writes to root /materialProfiles/{formula} collection.
 *
 * GET /api/material-profiles?formula=MoS2
 * Public read for signed-in users.
 *
 * @phase R183-2-material-knowledge-card
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAdminAuthService, getAdminFirestoreService } from '@/lib/firebase/admin';
import { requireSuperadmin as sharedRequireSuperadmin } from '@/lib/auth/superadmin-guard';

// ── Schema ────────────────────────────────────────────────────────────────────

const CitationSchema = z.object({
  doi: z.string(),
  title: z.string().optional(),
  journal: z.string().optional(),
  year: z.number().int().optional(),
  verified: z.boolean().default(false)
});

const SpectralPeakSchema = z.object({
  shift: z.number().optional(), // cm-1 (Raman/FTIR)
  twotheta: z.number().optional(), // degrees (XRD)
  wavelength: z.number().optional(), // nm (UV-Vis/PL)
  energy: z.number().optional(), // eV (PL)
  intensity: z.number().min(0).max(100),
  assignment: z.string().optional(),
  citation: CitationSchema.optional()
});

const SpectralSignatureSchema = z.object({
  peaks: z.array(SpectralPeakSchema).min(1),
  laserWavelength: z.union([z.literal(532), z.literal(785), z.literal(1064)]).optional(),
  notes: z.string().optional(),
  citation: CitationSchema.optional()
});

const ElectronicPropsSchema = z.object({
  bandgapEv: z.number().optional(),
  bandgapType: z.enum(['direct', 'indirect']).optional(),
  bandgapNotes: z.string().optional(),
  conductivityType: z.enum(['metal', 'semiconductor', 'insulator', 'semimetal']).optional(),
  citation: CitationSchema.optional()
});

const MaterialProfileSchema = z.object({
  formula: z.string().regex(/^[A-Z]/, 'Formula must start with capital letter'),
  commonNames: z.array(z.string()).min(1),
  casNumber: z.string().optional(),
  dimensionality: z.enum(['0D', '1D', '2D', '3D']).optional(),
  materialClass: z.string().optional(), // e.g. 'TMD', 'metal oxide', 'perovskite'
  crystalSystem: z.string().optional(),
  spaceGroup: z.string().optional(),
  spaceGroupNumber: z.number().int().optional(),
  latticeParams: z
    .object({
      a: z.number().optional(),
      b: z.number().optional(),
      c: z.number().optional(),
      alpha: z.number().optional(),
      beta: z.number().optional(),
      gamma: z.number().optional()
    })
    .optional(),
  electronicProps: ElectronicPropsSchema.optional(),
  spectralSignatures: z
    .object({
      raman: SpectralSignatureSchema.optional(),
      ftir: SpectralSignatureSchema.optional(),
      xrd: SpectralSignatureSchema.optional(),
      pl: SpectralSignatureSchema.optional(),
      uvvis: SpectralSignatureSchema.optional()
    })
    .optional(),
  physicalProps: z.record(z.string(), z.unknown()).optional(),
  source: z.enum(['manual', 'materials_project', 'literature']).default('manual'),
  mpId: z.string().optional(), // Materials Project ID e.g. mp-2815
  version: z.number().int().default(1)
});

// ── Helpers ───────────────────────────────────────────────────────────────────

// M1: delegate to shared requireSuperadmin (src/lib/auth/superadmin-guard.ts)
async function requireSuperadmin(request: NextRequest) {
  const guard = await sharedRequireSuperadmin(request);
  if (!guard.allowed) throw new Error('forbidden');
  return guard.decoded!;
}

async function requireSignedIn(request: NextRequest) {
  const auth = getAdminAuthService();
  const token = request.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) throw new Error('missing_token');
  return auth.verifyIdToken(token);
}

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    await requireSignedIn(request);
    const formula = request.nextUrl.searchParams.get('formula');
    const db = getAdminFirestoreService();

    if (formula) {
      const doc = await db.collection('materialProfiles').doc(formula).get();
      if (!doc.exists) {
        return NextResponse.json({ error: 'not_found' }, { status: 404 });
      }
      return NextResponse.json({ id: doc.id, ...doc.data() });
    }

    // List all
    const snap = await db.collection('materialProfiles').orderBy('formula').get();
    const profiles = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    return NextResponse.json({ profiles, total: profiles.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    if (msg === 'missing_token')
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ── POST ──────────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    await requireSuperadmin(request);

    const body: unknown = await request.json();
    const parsed = MaterialProfileSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'invalid_input', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const data = parsed.data;
    const db = getAdminFirestoreService();
    const docRef = db.collection('materialProfiles').doc(data.formula);

    await docRef.set(
      {
        ...data,
        updatedAt: new Date().toISOString(),
        createdAt: (await docRef.get()).exists
          ? (await docRef.get()).data()?.createdAt
          : new Date().toISOString()
      },
      { merge: true }
    );

    return NextResponse.json({ id: data.formula, formula: data.formula }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    if (msg === 'missing_token')
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    if (msg === 'forbidden') return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
