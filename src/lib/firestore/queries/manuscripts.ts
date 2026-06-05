'use client';

/**
 * Client-side Firestore CRUD for manuscripts (AI Science). Security is enforced
 * by rules (createdBy == auth.uid); these helpers assume a signed-in user and
 * throw otherwise. The manuscript IS the source of truth — section drafts are
 * written back here after generation (see generate-client).
 *
 * @phase R-aiscience-3
 * @see labyra-ai-science-manuscript-strategy.md §6
 */
import { collection as fsCollection, doc, setDoc, updateDoc } from 'firebase/firestore';
import type {
  Manuscript,
  ManuscriptSection,
  ManuscriptSectionType,
  ManuscriptStatus
} from '@/features/manuscript/types';
import { getFirebaseAuth, getFirebaseFirestore } from '@/lib/firebase/client';

const COLLECTION = 'manuscripts';
const SCHEMA_VERSION = 1;
const DEFAULT_JOURNAL_PROFILE = 'imrad';

function requireUid(): string {
  const uid = getFirebaseAuth().currentUser?.uid;
  if (!uid) throw new Error('Not signed in.');
  return uid;
}

function colPath(tenantId: string): string {
  return `tenants/${tenantId}/${COLLECTION}`;
}

export interface CreateManuscriptInput {
  title: string;
  collectionId: string;
  journalProfileId?: string;
  selectedMeasurementIds?: string[];
  /** R265c: optional link to a Project (Đề tài). */
  projectId?: string;
  /** R267: seed the section pipeline (e.g. lab-report layout for a course). */
  pipelineSections?: ManuscriptSectionType[];
}

/** Create an empty manuscript owned by the current user. Returns the new id. */
export async function createManuscript(
  tenantId: string,
  input: CreateManuscriptInput
): Promise<string> {
  const db = getFirebaseFirestore();
  const owner = requireUid();
  const ref = doc(fsCollection(db, colPath(tenantId)));
  const now = Date.now();
  const payload: Manuscript = {
    id: ref.id,
    tenantId,
    schemaVersion: SCHEMA_VERSION,
    createdBy: owner,
    createdAt: now,
    updatedBy: owner,
    updatedAt: now,
    lifecycleStatus: 'active',
    title: input.title,
    journalProfileId: input.journalProfileId ?? DEFAULT_JOURNAL_PROFILE,
    collectionId: input.collectionId,
    selectedMeasurementIds: input.selectedMeasurementIds ?? [],
    sections: [],
    glossary: [],
    numberRegistry: [],
    status: 'drafting',
    version: 1,
    // R265c: only write projectId when set — Firestore rejects undefined fields.
    ...(input.projectId ? { projectId: input.projectId } : {}),
    // R267: seed section pipeline when the project template specifies one.
    ...(input.pipelineSections && input.pipelineSections.length > 0
      ? { pipelineSections: input.pipelineSections }
      : {})
  };
  await setDoc(ref, payload);
  return ref.id;
}

/** Update top-level fields (title, journal, collection, selected data, status). */
export async function updateManuscriptMeta(
  tenantId: string,
  manuscriptId: string,
  patch: {
    title?: string;
    journalProfileId?: string;
    collectionId?: string;
    selectedMeasurementIds?: string[];
    status?: ManuscriptStatus;
    pipelineSections?: ManuscriptSectionType[];
  }
): Promise<void> {
  const db = getFirebaseFirestore();
  const owner = requireUid();
  await updateDoc(doc(db, `${colPath(tenantId)}/${manuscriptId}`), {
    ...patch,
    updatedAt: Date.now(),
    updatedBy: owner
  });
}

/**
 * Insert or replace a section (keyed by section type) and persist the merged,
 * order-sorted array. Returns the new array so the caller can update local
 * state without a re-read.
 */
export async function upsertManuscriptSection(
  tenantId: string,
  manuscriptId: string,
  currentSections: ManuscriptSection[],
  section: ManuscriptSection
): Promise<ManuscriptSection[]> {
  const db = getFirebaseFirestore();
  const owner = requireUid();
  const next = [...currentSections.filter((s) => s.type !== section.type), section].toSorted(
    (a, b) => a.order - b.order
  );
  await updateDoc(doc(db, `${colPath(tenantId)}/${manuscriptId}`), {
    sections: next,
    updatedAt: Date.now(),
    updatedBy: owner
  });
  return next;
}

/** Soft-delete: mark the manuscript retracted (recoverable; preserves provenance). */
export async function deleteManuscript(tenantId: string, manuscriptId: string): Promise<void> {
  const db = getFirebaseFirestore();
  requireUid();
  await updateDoc(doc(db, `${colPath(tenantId)}/${manuscriptId}`), {
    lifecycleStatus: 'retracted',
    updatedAt: Date.now()
  });
}
