/**
 * AI long-term memory types for Labyra (ADR-035).
 *
 * Five-layer memory architecture. M0 declares the data shapes only; chat-pipeline
 * integration lands in M1+. See docs/ai/aimemoryarchitecture.md.
 *
 * Storage placement (ADR-035 decision):
 *  - L3 Procedural (AiPreferences) → TOP-LEVEL `users/{uid}/aiPreferences/{doc}`.
 *    Preferences are personal to the human, not the lab. A researcher in two
 *    tenants keeps one style. This is the ONE intentional exception to the
 *    "everything under tenants/{tid}" invariant — and it is personal, never
 *    scientific data.
 *  - L4 Tenant context (TenantAiContext) → `tenants/{tid}/aiContext/{doc}`.
 *  - L1 Episodic + L2 Semantic → `tenants/{tid}/userMemories/{uid}/...`.
 *    Research knowledge is tenant-scoped; NO cross-tenant pollination
 *    (aimemoryarchitecture.md Part 7 Q2).
 *  - L5 Working scratchpad → inline on AiConversation (see types/ai.ts).
 *
 * @phase R192-mem-m0
 */

/** Master opt-in is OFF by default (ADR-035: opt-in, Trust > Coverage, GDPR-safe). */
export const MEMORY_DEFAULT_ENABLED = false;

/**
 * L3 — Procedural memory (user preferences).
 * Path: users/{uid}/aiPreferences/{settingsDocId}  (top-level, personal)
 */
export interface AiPreferences {
  language: 'vi' | 'en' | 'auto';
  mathNotation: 'latex' | 'unicode' | 'plaintext';
  verbosity: 'concise' | 'normal' | 'detailed';
  /** null = auto-route by intent classifier */
  preferredTier: 1 | 2 | 3 | null;
  tone: 'formal' | 'casual';
  includeReferences: boolean;
  /** Master opt-out for L1 + L2 extraction. Defaults to MEMORY_DEFAULT_ENABLED. */
  enableMemory: boolean;
  updatedAt: number; // epoch ms
}

/**
 * L4 — Tenant-level shared memory (lab house style + glossary).
 * Path: tenants/{tid}/aiContext/{contextDocId}  (single doc; read member / write admin)
 */
export interface TenantAiContext {
  labName: string;
  /** 2–3 sentences describing the lab. */
  labDescription: string;
  /** Auto-derived top-10 most-mentioned materials. */
  commonMaterials: string[];
  /** XRD, FTIR, EIS, ... */
  commonTechniques: string[];
  /** Refs to /tenants/{tid}/equipment ids. */
  commonEquipment: string[];
  /** System-prompt addendum, free text. */
  houseStyle: string;
  /** {"GCD": "galvanostatic charge-discharge", ...} */
  glossary: Record<string, string>;
  updatedAt: number; // epoch ms
  updatedBy: string; // userId of admin who edited
}

/**
 * L2 — Semantic memory (extracted, provenance-backed facts about the user).
 * Path: tenants/{tid}/userMemories/{uid}/facts/{factId}
 */
export interface UserFact {
  id: string;
  /** Controlled vocabulary, e.g. "user.research_focus" (see M2 fact-taxonomy). */
  subject: string;
  /** Value: string | string[] | number | object. */
  object: unknown;
  /** 0–1 from LLM; 1.0 when user explicitly stated/confirmed. */
  confidence: number;
  /** Provenance — message that produced this fact. */
  sourceMessageId: string;
  /** Verbatim user quote backing the fact (anti-hallucination). */
  sourceQuote: string;
  extractedAt: number; // epoch ms
  /** When the user clicked "confirm"; null if unconfirmed. */
  verifiedAt: number | null;
  /** Ref to a newer fact that replaced this one; null if current. */
  supersededBy: string | null;
}

/**
 * L1 — Episodic memory (per-user cross-conversation summary).
 * Path: tenants/{tid}/userMemories/{uid}/episodes/{episodeId}
 */
export interface Episode {
  id: string;
  /** Source conversation. */
  conversationId: string;
  /** 3–5 line LLM-generated summary. */
  summary: string;
  /** Extracted entities (materials, techniques, papers). */
  topics: string[];
  /** e.g. ["WO3 bandgap = 2.8 eV (user confirmed)"] */
  keyFacts: string[];
  /** 1024-dim Voyage embedding of `summary` (vector retrieval). */
  vectorEmbedding: number[];
  messageCount: number;
  createdAt: number; // epoch ms
  endedAt: number; // epoch ms
}
