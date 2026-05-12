> **Source**: Inherited verbatim from `labbook-bku` (Phase B, R138 era).
> Labyra-specific deviations (Next.js Route Handlers vs Cloud Functions,
> sub-collection tenant model, recharts vs Tremor) are tracked in
> `docs/ai/LABYRA_MAPPING.md` (planned). Until that exists, refer to
> `docs/ARCHITECTURE.md` Section 5 for the current Labyra AI overview.

---

# LabBook BKU — AI Architecture

> **Status (May 9 2026, post R138)**: Phase A done, Phase B.1-B.3 done, Phase B.4+ planned.
> This document captures the original design vision (v2.0, R110-R114 era) plus implementation
> reality from Phase B (R130-R138). Design sections describe intended behavior; reality
> sections (5.4, 5.5) describe what was actually built. Roadmap (Section 17) reflects current
> status.
>
> For module integration with the rest of the app, see `ARCHITECTURE.md` Section 🤖 (R138e).

**Version**: 2.0
**Last updated**: 2026-05-07
**Status**: Active (Round 105 foundation applied)
**Owner**: nAM (superadmin)

> **Major changes from v1.0** (2026-05-07 morning):
> - Adopted **Hybrid TS + Python** architecture (Cloud Run for materials informatics)
> - Code structure migrated to `src/ts/ai/` (TypeScript strict partial, repo already TS)
> - **6 analyzer groups × 24 subfolders** (structural, optical, electrochemistry, photoelectrochemistry, surface, microscopy)
> - Service reuse strategy: AI module wraps existing `src/ts/services/{parsers,plot}/`
> - Materials informatics libraries integrated: pymatgen, ASE, MatSciBERT, lmfit, impedance.py
> - Roadmap expanded: 95 → 220 rounds across Phase A → E
> - Phase C split into C-1 (optical/structural), C-2 (electrochemistry), C-3 (PEC)

---

## Table of Contents

1. [Vision](#1-vision)
2. [Three-Tier Architecture](#2-three-tier-architecture)
3. [Hybrid TS + Python Architecture](#3-hybrid-ts--python-architecture)
4. [Service Reuse Strategy](#4-service-reuse-strategy)
5. [Agentic RAG Pipeline](#5-agentic-rag-pipeline)
6. [Anti-Hallucination — 9 Layers](#6-anti-hallucination--9-layers)
7. [Self-Learning Strategy](#7-self-learning-strategy)
8. [Provenance Chain](#8-provenance-chain)
9. [Voice Integration](#9-voice-integration)
10. [Document Processing Pipeline](#10-document-processing-pipeline)
11. [Workbench (UI)](#11-workbench-ui)
12. [Materials Informatics Libraries](#12-materials-informatics-libraries)
13. [Tech Stack Summary](#13-tech-stack-summary)
14. [Cost Projection](#14-cost-projection)
15. [Security & Privacy](#15-security--privacy)
16. [Evaluation Strategy](#16-evaluation-strategy)
17. [Implementation Roadmap](#17-implementation-roadmap)
18. [Risk & Mitigation](#18-risk--mitigation)
19. [Decision Log](#19-decision-log)

---

## 1. Vision

LabBook BKU AI là một **hệ sinh thái AI Research Platform** chuyên cho lab vật liệu 2D/TMDs (WS₂, WO₃, MoS₂, BiVO₄, perovskites...) với 6 mục tiêu cốt lõi:

1. **Quản trị thông minh** — truy vấn database lab, kiểm soát compliance Nghị định 24/2026, điều phối thực nghiệm
2. **Phân tích khoa học chuyên sâu** — đọc phổ XRD/Raman/UV-Vis/PL/FTIR/PEC/EIS/XPS/EDS ở mức nhà nghiên cứu thực thụ
3. **Suy luận và định hướng** — Agentic RAG trên 1000+ paper + lab history, đề xuất thí nghiệm tối ưu
4. **Hỗ trợ viết** — luận văn, paper, đồ án từ dữ liệu lab thực + provenance chain audit-able
5. **Voice-first lab workflow** — nhập/đọc bằng giọng nói khi đeo găng
6. **DFT integration** — tạo input QE/CASTEP/VASP, parse output, kết nối với Materials Project

---

## 2. Three-Tier Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    User Query (Vietnamese)                       │
└──────────────────────────────┬──────────────────────────────────┘
                               │
                  ┌────────────▼────────────┐
                  │  Intent Router (Flash)   │
                  └────────────┬─────────────┘
                               │
        ┌──────────────────────┼──────────────────────┐
        │                      │                      │
   ┌────▼──────┐         ┌─────▼──────┐        ┌─────▼──────┐
   │  TIER 1   │         │   TIER 2   │        │   TIER 3   │
   │ Lab Mgr   │         │  Analyst   │        │  Research  │
   │           │         │            │        │   Agent    │
   │ Gemini    │         │ Sonnet 4.6 │        │  Opus 4.7  │
   │ 2.5 Flash │         │            │        │            │
   └───────────┘         └────────────┘        └────────────┘
   RTDB queries          Spectrum analysis     Agentic RAG
   Compliance            Vision + tools        Hypothesis gen
   Inventory             Computational         Multi-hop reason
   Booking               (Tauc, Tafel...)      Paper writing
```

### Tier 1 — Lab Manager (Gemini 2.5 Flash)

**Use cases**: "Còn bao nhiêu L-Cysteine?", "Ai đặt máy XRD tuần sau?", "Hóa chất X có thuộc Phụ lục III Nghị định 24/2026 không?"

**Tools**:
- `query_chemicals(name?, formula?, status?)`
- `query_equipment(name?, status?)`
- `query_bookings(date_range, equipment?, user?)`
- `query_experiments(filters)`
- `query_history(actor?, action?, date_range?)`
- `check_compliance(chemical_name)` → Nghị định 24/2026 + GHS
- `get_member_info(uid)`

**Cost**: ~$0.003/query.

### Tier 2 — Spectrum Analyzer (Claude Sonnet 4.6)

Model string: `claude-sonnet-4-6` (R138a deployed via claudeProxy).

**Use cases**: "Phân tích file XRD này", "Tính Eg từ phổ UV-Vis", "Mẫu nào có HER tốt nhất?"

Hoạt động trên **24 spectrum types** thuộc 6 nhóm (xem Section 12).

**Cost**: ~$0.06/query trung bình ($3/$15 per 1M tokens).

### Tier 3 — Research Agent (Claude Opus 4.7)

Model string: `claude-opus-4-7` (R138a deployed). NO_SAMPLING_PARAMS gate active —
neither `temperature` nor `top_p` sent for this model.

**Use cases**: "Em tổng hợp WS₂ QDs trên WO₃, Eg=3.05 eV, làm sao tăng HER?"

Multi-step reasoning: decompose → retrieve → cross-verify → reflect → synthesize → cite.

**Cost**: ~$0.30/query trung bình ($5/$25 per 1M tokens).

### Bonus — Haiku 4.5 (cheap classification / batch)

Model string: `claude-haiku-4-5-20251001`. Available for cost-sensitive subtasks
(intent routing, summarization). $1/$5 per 1M tokens.

**Status (R138)**: claudeProxy infrastructure deployed and tested. Frontend `claude-client.ts`
+ tier router NOT yet wired into AI Chat (deferred to R138b2c+). Currently all AI Chat
queries route Tier 1 (Gemini Flash) regardless of complexity.

### Routing Logic

```typescript
// src/ts/ai/core/router.ts (pseudocode)
function routeQuery(query: string, context: ConversationContext): Tier {
  const classification = await flashRouter(query);
  if (classification.tier === 1) return tier1Agent;
  if (classification.tier === 2) return tier2Agent;
  if (classification.tier === 3) return tier3Agent;
  return tier2WithEscalation;
}
```

**Estimated mix**: 60% Tier 1, 30% Tier 2, 10% Tier 3 → average ~$0.04/query.

---

## 3. Hybrid TS + Python Architecture

### 3.1 Lý do Hybrid

TypeScript mạnh cho UI/orchestration nhưng yếu cho khoa học vật liệu:
- Không có pymatgen (CIF, JCPDS, crystal structure)
- Không có ASE (DFT input/output)
- Không có lmfit (Voigt, multi-Gaussian fitting)
- Không có impedance.py (EIS equivalent circuit)
- Không có MatSciBERT (domain embedding)

→ **Tách 2 lớp**: TS xử lý preview + orchestration, Python xử lý deep analysis.

### 3.2 Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                      Browser (Frontend)                          │
│                                                                  │
│  TypeScript App (Vite + Vanilla TS, strict partial)             │
│  ├─ UI/UX (Tailwind + design tokens)                            │
│  ├─ Firebase RTDB sync                                           │
│  ├─ Chat interface                                               │
│  ├─ src/ts/services/parsers/   (existing — REUSE)               │
│  ├─ src/ts/services/plot/      (existing — REUSE)               │
│  ├─ src/ts/ai/core/            (provider abstraction)            │
│  ├─ src/ts/ai/agent/           (orchestrator + reflector)        │
│  ├─ src/ts/ai/tools/           (Tier 1 RTDB tools)               │
│  ├─ src/ts/ai/analyzers/       (Tier 2 — wraps Python)           │
│  └─ src/ts/ai/python-bridge/   (HTTP client to Python service)   │
│              │                                                   │
└──────────────┼───────────────────────────────────────────────────┘
               │
               │ HTTPS (Firebase Auth tokens)
               ▼
┌─────────────────────────────────────────────────────────────────┐
│           Firebase Cloud Functions (Node.js TS)                  │
│                                                                  │
│  Lightweight proxies + auth + secrets management                │
│  ├─ functions/src/claude-proxy.ts    (Anthropic API)             │
│  ├─ functions/src/voyage-proxy.ts    (Embedding + Rerank)        │
│  ├─ functions/src/chandra-proxy.ts   (OCR)                       │
│  ├─ functions/src/python-bridge.ts   (Forward to Python)         │
│  └─ functions/src/gemini-proxy.ts    (Tier 1 LLM)                │
│              │                                                   │
└──────────────┼───────────────────────────────────────────────────┘
               │
               │ HTTPS internal call (service account)
               ▼
┌─────────────────────────────────────────────────────────────────┐
│              Python Compute Service (Cloud Run)                  │
│                                                                  │
│  FastAPI + Python 3.11+ (auto-scale 0-100, $0 idle)             │
│  ├─ /xrd/analyze           — pymatgen XRD pattern + JCPDS        │
│  ├─ /raman/deconvolve      — lmfit Voigt fitting                 │
│  ├─ /uvvis/tauc-advanced   — scipy Tauc + Urbach                 │
│  ├─ /pl/multi-gauss        — scipy multi-Gaussian (trions)       │
│  ├─ /ftir/peaks            — peak detection + functional groups  │
│  ├─ /eis/fit-nyquist       — impedance.py equivalent circuit     │
│  ├─ /ms/flat-band          — Mott-Schottky linear fit            │
│  ├─ /ipce/calc             — IPCE/APCE wavelength response       │
│  ├─ /xps/peak-fit          — lmfit Voigt + Shirley background    │
│  ├─ /eds/quant             — atomic % quantification             │
│  ├─ /bet/bjh               — surface area + pore size            │
│  ├─ /tga/steps             — mass loss step detection            │
│  ├─ /dft/qe-input          — ASE QE input generator              │
│  ├─ /dft/parse-output      — pymatgen DFT output parser          │
│  ├─ /jcpds/match           — pymatgen diffraction sim from CIF   │
│  ├─ /cif/visualize         — pymatgen → 3D structure model       │
│  └─ /embed/matscibert      — Domain-specific embeddings          │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 3.3 Why Cloud Run

- **Pay per request** — $0 khi không dùng
- **Auto-scale 0 → 100 instances**
- **Free tier 2M requests/tháng** (đủ cho lab nhỏ)
- **HTTPS auto + custom domain**
- **Tích hợp với Firebase** (cùng GCP project)
- **Container-based** (Docker image với pymatgen + scipy)
- **Cold start ~2-5 giây** (chấp nhận được cho deep analysis)

### 3.4 Communication Pattern

```
TypeScript:                          Python:
─────────────                        ────────
1. User upload XRD file
2. Quick parse (existing parser)
3. Show preview chart immediately
4. Click "Deep analyze" →
                       ┌────────────►  /xrd/analyze
                       │                {file_data, candidates}
                       │
                       │              Returns:
                       │                {peaks, jcpds_match,
                       └────────────    scherrer, lattice, R_factor}
5. Display Python result
6. Send to Claude with context →
   "Phân tích pattern này..."
```

### 3.5 Local Development

```bash
# Terminal 1 — frontend
cd ~/LAB-MANAGER/labbook-vite-tailwind/labbook
npm run dev

# Terminal 2 — Cloud Functions emulator
cd functions
npm run serve

# Terminal 3 — Python service (local)
cd python-service
uv sync
uvicorn main:app --reload --port 8000
```

3 services cùng chạy local → develop end-to-end.

---

## 4. Service Reuse Strategy

### 4.1 Existing services to REUSE

LabBook BKU repo đã có sẵn:

```
src/ts/services/
├── parsers/                    ← REUSE
│   ├── corrware.ts            (CorrWare/Princeton EChem → CV/LSV data)
│   ├── jcamp-jasco.ts         (JCAMP-DX/JASCO → spectrum data)
│   ├── detect.ts              (Auto-detect file type)
│   ├── parser-core.ts         (Shared utilities)
│   └── index.ts               (Public API)
│
└── plot/                       ← REUSE
    ├── tauc.ts                (Tauc plot — Eg calculation)
    ├── bandgap-fit.ts         (Linear regression for Tauc)
    ├── plot-preview.ts        (Quick preview rendering)
    └── highres-png.worker.ts  (Hi-res PNG export)
```

### 4.2 Reuse Pattern

AI module **wraps** existing services qua `src/ts/ai/tools/spectrum-tools.ts`:

```typescript
// AI tool wrapper
import { detectFileType } from '@/services/parsers/detect';
import { parseJcamp } from '@/services/parsers/jcamp-jasco';
import { computeTauc } from '@/services/plot/tauc';
import { fitBandgap } from '@/services/plot/bandgap-fit';
import { pythonBridge } from '@/ai/python-bridge/client';

export async function analyzeUvVisTool(input: {
  fileBuffer: ArrayBuffer;
  transitionType?: 'direct' | 'indirect';
  deepAnalysis?: boolean;
}) {
  // 1. Quick path — existing TS services
  const fileType = detectFileType(input.fileBuffer);
  const spectrum = parseJcamp(input.fileBuffer);
  const taucData = computeTauc(spectrum, input.transitionType ?? 'direct');
  const fit = fitBandgap(taucData);

  // 2. Optional deep analysis — Python service
  let advanced = null;
  if (input.deepAnalysis) {
    advanced = await pythonBridge.call('/uvvis/tauc-advanced', {
      spectrum,
      transitionTypes: ['direct', 'indirect', 'forbidden_direct']
    });
  }

  return {
    quick: { spectrum, taucData, eg: fit.eg, rSquared: fit.rSquared },
    advanced,
    sources: ['plot/tauc.ts', 'plot/bandgap-fit.ts', advanced ? '/uvvis/tauc-advanced' : null].filter(Boolean)
  };
}
```

### 4.3 Benefits

- ✅ **Single source of truth** — Eg từ AI và UI luôn nhất quán
- ✅ **Code đã test** với data thật
- ✅ **Bug fix 1 lần** áp dụng cả AI lẫn UI
- ✅ **Round nhỏ hơn** — không phải viết lại
- ✅ **Future migration to `lib/`** dễ dàng (rename, không refactor logic)

### 4.4 New parsers needed

Existing parsers cover ~30% formats. Cần viết mới (Phase C):

| Format | Round | Strategy |
|---|---|---|
| Generic XRD `.xy/.txt` | 131 | TypeScript parser |
| Bruker `.brml` | future | Python (XML parsing) |
| Generic Raman `.txt` | 134 | TypeScript |
| Renishaw `.wdf` | future | Python (binary) |
| Generic PL `.txt` | 139 | TypeScript |
| Biologic `.mpt` | future | TypeScript (extend corrware pattern) |
| Generic CSV | 130 | Universal fallback |

---

## 5. Agentic RAG Pipeline

### 5.1 Ingestion (Offline, one-time + incremental)

```
Sources                          Pipeline                     Storage
───────                          ────────                     ───────
Web upload  ──┐
Zotero sync ──┼─▶  PDF Files  ─▶ Chandra OCR (text/eqs/tables)
Drive sync  ──┘                  ▼
                                 Claude Vision (figures)
                                 ▼
                                 Metadata (Crossref via DOI)
                                 ▼
                                 Smart Chunking (section-aware,
                                 500 tokens, 15% overlap)
                                 ▼
                                 Contextual Pre-prep (Anthropic
                                 technique: each chunk gets
                                 LLM-generated context summary)
                                 ▼
                                 Embed (Voyage-3 OR MatSciBERT)
                                 ▼
                                 Index ────────────────────▶ Firestore Vector
                                                            BM25 (Lunr.js)
                                                            Metadata index
```

### 5.2 Retrieval (Online, per query)

```
User query
   │
   ▼
Query analysis (decompose if multi-aspect)
   │
   ├─▶ Hybrid retrieval (parallel):
   │      • Dense: top-50 Voyage/MatSciBERT similarity
   │      • Sparse: top-50 BM25 keyword
   │   ▼
   │   Reciprocal rank fusion → top-50 merged
   │
   ▼
Reranker (voyage-rerank-2.5) → top-10
   │
   ▼
Confidence Grader (CRAG):
   ├─▶ "Correct" (>0.7): use chunks
   ├─▶ "Ambiguous" (0.3-0.7): chunks + web search
   └─▶ "Incorrect" (<0.3): web search only
   │
   ▼
LLM generates answer with chunks injected
   │
   ▼
Reflection loop: self-critique for unsupported claims
   │
   ▼
Final answer + citations + confidence
```

### 5.3 Storage Schema

```typescript
// Firestore: paper_chunks
interface PaperChunk {
  id: string;                      // "paper_2023_park_001_chunk_007"
  paper_id: string;
  chunk_index: number;
  text: string;                    // raw chunk
  contextual_text: string;         // LLM-prep context + raw (for embedding)
  embedding: number[];             // 1024-dim vector (Voyage-3)
  metadata: {
    paper_title: string;
    authors: string[];
    year: number;
    journal: string;
    doi: string;
    section: string;               // "Results and Discussion"
    page: number;
    figures_in_chunk: string[];
    tables_in_chunk: string[];
    equations: string[];
  };
  tags: string[];                  // ["WS2", "WO3", "heterojunction", "HER"]
}

// Firestore: papers (master metadata)
interface Paper {
  id: string;
  title: string;
  authors: string[];
  year: number;
  doi: string;
  abstract: string;
  keywords: string[];
  pdf_url: string;
  num_chunks: number;
  ingested_at: Timestamp;
  ingested_by: string;             // user uid
  source: 'zotero' | 'drive' | 'upload';
}

// Firestore: lab_memory (episodic facts)
interface LabFact {
  id: string;
  type: 'verified_observation' | 'experimental_result' | 'lesson_learned';
  content: string;
  source_type: 'experiment' | 'user_input' | 'ai_extracted';
  source_ids: string[];            // ["exp_042"]
  embedding: number[];
  verified_by: string[];
  verified_at: Timestamp;
  confidence: 'high' | 'medium' | 'low';
  tags: string[];
}
```

### 5.4 Implementation reality (R130-R138)

What actually shipped diverges from the v2.0 design above. This section
documents the real implementation. For Cloud Functions deployment details
see `ARCHITECTURE.md` Section ☁️.

**Ingestion (R130-R136)**:
- Sources: web upload only (Zotero/Drive sync deferred — was Phase B nice-to-have)
- OCR: Chandra (datalab.to) via `chandraProxy` Cloud Function — page-level layout-aware
- Vision for figures: NOT implemented (deferred — Chandra extracts figure captions but
  doesn't analyze figure content)
- Metadata: NOT auto-fetched from Crossref (deferred). Title/authors come from PDF
  metadata or user input on upload.
- Chunking: section-aware via `chunkPaper` Cloud Function (R134) — header detection,
  ~500 token chunks, sectionPath tracking. NO contextual pre-prep (Anthropic technique
  deferred — chunks store raw text only)
- Embedding: Voyage `voyage-3-large` (1024-dim) via `paperPipelineRouter` (R135).
  MatSciBERT alternative deferred.
- Storage: Firestore named DB `labbook` collections `paperChunks`, `bm25Tokens`
  (NOT generic `paper_chunks` as in design schema)

**Retrieval (R137a-c2)**:
- Query analysis: NO multi-aspect decomposition (deferred — single query single retrieve)
- Hybrid: vector (Firestore KNN) + BM25 (Firestore inverted index `bm25Tokens`) → RRF
- Top-30 candidates → Voyage `rerank-2.5` → top-K (default 5)
- Confidence Grader (CRAG): NOT implemented. Confidence badges on frontend derived
  from `rerankScore` thresholds (≥0.85 green, 0.65-0.85 blue, etc.)
- Reflection loop: NOT implemented (deferred — single-pass generation)
- Citations: position-based `[1]`, `[2]` (1-indexed) embedded by `searchPapers` tool

**Storage schema reality** (vs design above):

| Design field | Reality field | Notes |
|---|---|---|
| `paper_chunks` | `paperChunks` (camelCase) | Firestore convention |
| `paper_id` | `paperId` | |
| `chunk_index` | `chunkIndex` | |
| `contextual_text` | (not used) | Contextual pre-prep deferred |
| `embedding` | `embedding` | 1024-dim, voyage-3-large |
| `metadata.section` | `sectionPath` (top-level, string) | Section paths like "Results > Cyclic Voltammetry" |
| `metadata.figures_in_chunk` | (not used) | Figure tracking deferred |
| `tags` | (not used) | Tag extraction deferred |
| `papers` | `aiPapers/_shared` (RTDB, not Firestore) | Realtime status updates needed for upload UI |
| `lab_memory` | NOT IMPLEMENTED | Episodic memory deferred to Phase B.6+ |

**Tools (R138b1)**:
- 1 RAG tool: `searchPapers(query, limit?, paperId?, mode?)` — wraps SearchEngine + reranker
- Returns chunks array with `position` 1..K, `paperTitle`, `sectionPath`, `text` (truncated 800 chars), scores

**LLM tiering reality (R138a + b2a)**:
- Tier 1 (Gemini Flash): WIRED — currently all AI Chat queries
- Tier 2 (Sonnet 4.6): claudeProxy deployed, frontend NOT wired
- Tier 3 (Opus 4.7): claudeProxy deployed, frontend NOT wired
- Intent router (Flash dispatcher): NOT implemented (single-tier flow, defer to R138b2c+)

### 5.5 Citation chip pipeline (R138b2b)

NotebookLM-style interactive citations. End-to-end flow:

```
1. Tool execution
   ────────────
   geminiProxy → tool calling loop
     ↓ (AI calls searchPapers)
   toolExecutor dispatches
     ↓
   functions/src/tools/papers.ts → SearchEngine + Reranker
     ↓
   Returns {chunks: [{position, paperTitle, sectionPath, text, ...}, ...]}

2. Marker embed (gemini-client.ts)
   ──────────────────────────────
   For each searchPapers tool result:
     citations = {1: chunk1, 2: chunk2, ...}
     b64 = btoa(JSON.stringify(citations))
     marker = `\n\n<!--AI_CITATIONS:${b64}-->\n\n`
     append to streaming text

3. Frontend extract (citation-popover.ts preprocessCitationMarkers)
   ───────────────────────────────────────────────────────────────
   Scan text for /<!--AI_CITATIONS:([A-Za-z0-9+/=]+)-->/g
   Decode → store in module-level Map<msgId, CitationsForMessage>
   Strip marker from text

4. Markdown render (message-bubble.ts)
   ───────────────────────────────────
   text = preprocessDraftMarkers(preprocessCitationMarkers(rawText, msgId))
   html = await renderMarkdown(text)  // marked + KaTeX + DOMPurify
   contentEl.innerHTML = html

5. DOM post-process (citation-popover.ts attachCitationChips)
   ──────────────────────────────────────────────────────────
   TreeWalker over text nodes (skip CODE/PRE/existing chips)
   Match /\[(\d{1,2}(?:\s*,\s*\d{1,2})*)\]/g
     - Single [1]: 1 chip
     - Combo [2, 4]: 2 chips [2][4] side-by-side
   Replace with <span class="citation-chip" data-msg-id="..." data-position="N">[N]</span>

6. Click handler (global delegation)
   ────────────────────────────────
   Click on .citation-chip → showCitationPopover(msgId, position)
   Popover modal renders: paperTitle, sectionPath, full chunk text, rerankScore
   ESC / × / outside click → hideCitationPopover

7. Persistence
   ───────────
   Marker REMAINS in stored RTDB text aiConversations/{uid}/{convId}/messages/{msgId}/text
   On conversation reload, step 3-5 re-execute → chips re-render
   No separate `citations` field saved (Map is in-memory per session)

8. Streaming bubble msgId migration (fix4)
   ───────────────────────────────────────
   During stream, msgEl has no msgId yet → citations stored under "" key
   onComplete callback (message-handler.ts):
     realMsgId = await appendMessage(...)
     msgEl.dataset.msgId = realMsgId
     migrateCitations("", realMsgId)
     attachCitationChips(contentEl, realMsgId)
```

**Marker pattern is reusable** for future tools needing rich UI (charts, tables,
interactive widgets). Pattern documented in `ARCHITECTURE.md` Section 🤖.

---

## 6. Anti-Hallucination — 9 Layers

### Layer 1: Strict Grounding (System Prompt)

```
Bạn là AI nghiên cứu vật liệu cho lab. QUY TẮC TUYỆT ĐỐI:
1. CHỈ trả lời dựa trên: (a) chunks retrieved, (b) lab data tools,
   (c) Python service computational results.
2. KHÔNG TỰ SINH số liệu khoa học (Eg, d-spacing, Tafel, Tafel slope, etc.).
   Nếu cần số, GỌI TOOL hoặc TÌM trong RAG.
3. Mỗi claim PHẢI kèm citation ID hoặc tool source.
4. Không có nguồn → nói "Không có dữ liệu về điều này trong corpus."
5. Không suy đoán bằng "thường thì", "có thể là" cho số liệu — chỉ cho cơ chế.
```

### Layer 2: Citation API (Anthropic Citations)

Mỗi câu được pin với chunk_id chính xác. Anthropic Citations API:
- `cited_text` không tính output token
- Format: `[claim] Park 2023 p.4`
- UI render link clickable đến chunk gốc

### Layer 3: Numerical Verification

Số liệu phải có format:
```
Eg = 3.05 eV [tool:python-service/uvvis/tauc] hoặc [src:chunk_891]
```
Schema validation reject nếu LLM cố sinh số không có tag nguồn.

### Layer 4: Confidence Grader (CRAG)

Pre-LLM step: grade từng chunk relevance trước khi inject vào prompt. Reject score <0.3.

### Layer 5: Reflection Loop

Post-LLM step: tự critique câu trả lời, tìm unsupported claims → re-query hoặc remove.

### Layer 6: Cross-source Verification

Khi RAG paper nói X, lab data nói Y, Python service compute Z → flag conflict, present cả ba cho user.

### Layer 7: OOD Detection

Câu hỏi về vật liệu chưa có trong lab + corpus → AI thừa nhận giới hạn.

### Layer 8: Eval Dashboard (Ragas)

Weekly evaluation:
- **Faithfulness**: target ≥0.90
- **Answer Relevancy**: target ≥0.85
- **Context Precision**: target ≥0.80

### Layer 9: Human-in-the-loop Verify

Admin click `[✓ Verify]` → fact extract → Lab Memory permanent → tăng độ chính xác tương lai.

---

## 7. Self-Learning Strategy

### 7.1 Lab Memory (Episodic)

Tích lũy facts từ:
- Auto-extraction từ experiments mới nhập RTDB
- Conversation extraction (cuối mỗi conversation, AI propose facts)
- Verified answers (thumbs-up + verify)

### 7.2 Feedback Loop

Track 👍/👎/click-through/re-query/verify → weekly aggregation → boost good chunks, flag bad chunks.

### 7.3 Reformulation Learning

Track failed → success query mappings → query expansion table.

### 7.4 No Fine-tuning

**Quy tắc vàng**: Knowledge → RAG. Style → Prompt. Behavior → Eval.

---

## 8. Provenance Chain

### 8.1 Schema

```typescript
// Firestore: ai_provenance
interface ProvenanceEntry {
  id: string;
  user_uid: string;
  conversation_id: string;
  user_query: string;
  timestamp: Timestamp;
  tier_used: 1 | 2 | 3;
  model: string;

  agent_steps: AgentStep[];

  claims_in_answer: Array<{
    claim_id: string;
    text: string;
    sources: string[];           // chunk_ids OR tool sources
    confidence: 'high' | 'medium' | 'low';
    verified_by_tool: boolean;
  }>;

  total_tokens: { input: number; output: number; };
  total_cost_usd: number;
  duration_ms: number;

  feedback: 'thumbs_up' | 'thumbs_down' | null;
  verified_by_admin: boolean;
  verified_at: Timestamp | null;
}

interface AgentStep {
  step: number;
  type: 'decompose' | 'tool_call' | 'reflection' | 'synthesis';
  tool?: string;
  thought?: string;
  input?: any;
  output?: any;
}
```

### 8.2 UI Display

```
🤖 [answer text]

──────────────────────────────────
Reasoning chain (5 steps · 4.5s · $0.32)  [▼ expand]
Sources:
  📄 Park 2023, p.4    [view]
  📄 Liu 2021, p.7     [view]
  🧪 Lab Exp #042      [open]
  🐍 Python /xrd/analyze  [view]
Confidence: ●●●●○ High
──────────────────────────────────
[👍] [👎]  [📋 copy]  [🔗 share]  [✓ verify]
```

### 8.3 Audit Use Cases

- **Luận văn**: chain truy nguyên đầy đủ — defense-able
- **Debug**: AI sai → xem step nào sai → fix prompt
- **Quality**: review weekly, identify bad chunks/prompts
- **Compliance**: AI usage disclosure (per Sakana AI license inspiration)

---

## 9. Voice Integration

### 9.1 Phase 1 — Web Speech API (immediate)

**ASR**: `webkitSpeechRecognition` với `lang="vi-VN"`. Continuous mode for lab dictation.

**TTS**: `speechSynthesis.speak(utterance)` với `lang="vi-VN"`.

Free, browser native, OK cho prototype.

### 9.2 Phase 2 — VibeVoice Self-host (future)

- VibeVoice-ASR-7B với hotwords cho lab terms
- VibeVoice-Realtime-0.5B cho low-latency TTS
- GPU server (~$50-200/month cloud GPU)
- Defer until Phase E

### 9.3 Lab Mode UX

`F` key fullscreen + voice button → dictate lab actions hands-free.

---

## 10. Document Processing Pipeline

```
PDF Paper
   │
   ▼
Chandra OCR (datalab.to API via Cloud Function)
   │
   ├─ Markdown text (with structure)
   ├─ LaTeX equations (inline + block)
   ├─ Tables (HTML/Markdown preserved)
   └─ Bounding boxes for figures
   │
   ▼
Figure extraction
   │
   ▼
Claude Vision reads each figure
   │
   ├─ Spectrum → identify type, peaks, samples
   ├─ Microscopy → identify scale, features
   ├─ Schematic → describe workflow
   └─ Chart → extract data points if possible
   │
   ▼
Merged document (text + figure descriptions + equations)
   │
   ▼
Smart chunking (section-aware)
   │
   ▼
Contextual pre-prep + Embed (Voyage-3 OR MatSciBERT)
   │
   ▼
Index Firestore Vector + BM25
```

### 10.1 Source Integrations

- **Web Upload**: Drag & drop, batch up to 50 PDF, dedup by DOI/title hash
- **Zotero Sync**: Zotero Web API + library ID, one-way sync
- **Google Drive**: Folder watch, OAuth scope `drive.readonly`

---

## 11. Workbench (UI)

### 11.1 Right Sidetab (Chat) — `⌘J` toggle

Quick chat anywhere in app. Slide-out from right (380px width). Use cases:
- "Thông tin nhanh về [chemical]"
- "Mở booking máy XRD T2 9h"
- "Tìm paper về ZnO QD"

### 11.2 Workbench Pages (left sidebar)

Sub-sections under "AI Workbench":

| Tab | Function | Tier | Round |
|---|---|---|---|
| 💬 Chat | Trợ lý AI đa năng (entry point) | 1+2+3 | 108 |
| 📊 Spectrum Analyzer | Upload phổ → AI đọc + Python compute | 2 | 129 |
| 🗄 Materials DB | CAS lookup, JCPDS card library | 1 | 177 |
| 🧬 Structure Viewer | 3Dmol.js cho CIF, band structure | 2 | 179 |
| 🧮 DFT Launcher | Generate input QE/CASTEP/VASP, parse output | 3 | 181 |
| 📄 Paper Library | Browse + RAG Q&A, citation manager | 3 | 127 |
| ✍ Writing Assistant | Materials AI Writer, LaTeX/Word export | 3 | 187 |
| 📚 Knowledge Graph | Mối liên hệ giữa lab ↔ paper ↔ kết quả | 3 | 196 |

---

## 12. Materials Informatics Libraries

### 12.1 Python Stack

Inspired by [awesome-materials-informatics](https://github.com/tilde-lab/awesome-materials-informatics):

| Library | Purpose | Usage Round |
|---|---|---|
| **pymatgen** | Crystal structure, JCPDS sim, phase diagram | 131-133, 167, 179 |
| **ASE** | DFT input/output (QE, VASP, CASTEP) | 181-186 |
| **MatSciBERT** | Domain-specific embeddings cho RAG | 128 |
| **lmfit** | Voigt, multi-Gaussian, peak fitting | 134, 139, 171 |
| **impedance.py** | EIS Nyquist + equivalent circuit | 148-149 |
| **scipy** | Generic curve fitting, optimization | 137, 165 |
| **matminer** | Featurization (composition → ML features) | future |
| **ase + spglib** | Symmetry analysis | future |

### 12.2 Materials Project Integration

Free API → 150K+ materials database:
- Query by formula, structure
- Reference Eg values, lattice parameters
- DFT-computed properties
- Cross-reference với lab measurements

### 12.3 Crystallography Open Database (COD)

Open source 500K+ crystal structures → JCPDS-equivalent cards miễn phí.

---

## 13. Tech Stack Summary

```yaml
# LLM Providers
tier_1: gemini-2.5-flash       # cheap, fast Q&A
tier_2: claude-sonnet-4-6      # vision + reasoning
tier_3: claude-opus-4-7        # deep reasoning

# Embedding & Reranking
embedding_default: voyage-3            # 1024-dim, scientific
embedding_specialized: MatSciBERT      # domain-specific (Phase B)
reranker: voyage-rerank-2.5

# Storage
vector_db: Firestore Vector Search
chat_history: Firebase RTDB
papers_metadata: Firestore
provenance: Firestore
lab_memory: Firestore

# OCR & Vision
ocr: Chandra OCR (datalab.to API)
spectrum_vision: Claude Vision direct

# Voice (Phase 1)
asr: Web Speech API (vi-VN)
tts: speechSynthesis API

# Voice (Phase 2 - future)
asr: VibeVoice-ASR-7B (self-host)
tts: VibeVoice-Realtime-0.5B (self-host)

# Frontend
framework: Vite 8 + Vanilla TypeScript
typescript_mode: strict partial (noImplicitAny, strictNullChecks, noUnusedLocals)
styling: Tailwind 3 + CSS tokens (per DESIGN.md)
icons: Lucide (replace existing — Phase A)

# Backend (Hybrid)
node: Firebase Cloud Functions (TypeScript, Blaze plan)
python: Cloud Run (FastAPI, Python 3.11+, Docker)
secrets: Firebase Functions config + GCP Secret Manager

# Standards
tool_calling: MCP (Model Context Protocol, Anthropic-donated 2025)
citations: Anthropic Citations API
contextual_retrieval: Anthropic technique
eval: Ragas framework (weekly)
```

---

## 14. Cost Projection

### Monthly Estimate (Single User Phase — superadmin only)

```
LLM (1000 queries/mo, Tier mix 60/30/10):
  Tier 1 (Flash): 600 × $0.003  = $1.80
  Tier 2 (Sonnet): 300 × $0.06  = $18.00
  Tier 3 (Opus): 100 × $0.30    = $30.00
  ─────────────────────────────────────
  Subtotal:                       $49.80

Embedding (Voyage-3):
  Index 1000 papers:              $0.90 (one-time)
  Query embed:                    $0.01/mo

Reranking (voyage rerank-2.5):
  ~500 reranks/mo:                $0.50

OCR (Chandra hosted):
  ~100 PDFs/mo:                   $0 (free tier)

Firebase Blaze:
  Cloud Functions:                $0-2
  Firestore Vector:               $0 (within 1GB free tier)
  Hosting:                        $0

Cloud Run (Python service):
  ~200 requests/mo deep analysis: $0 (within 2M free tier)
  Container Registry:             $0 (within 0.5GB free)

TOTAL (without caching):          ~$52/month
```

### Optimized với prompt caching

Anthropic prompt caching giảm 90% input cost trên call thứ 2+:
- System prompt + tool defs cache
- **Estimated effective**: **$25-30/month**

### Cost Controls

- Hard quota: $100/month max → API rejection auto
- Per-query token limit: input <50K, output <8K
- Tier 3 only triggered explicitly hoặc by complexity classifier
- Streaming response (cancel mid-way if user navigates)
- Response caching cho similar queries (5 min TTL)

---

## 15. Security & Privacy

### 15.1 API Key Management

| Key | Storage | Access |
|---|---|---|
| Anthropic | Firebase Functions config | Cloud Functions only |
| Voyage | Firebase Functions config | Cloud Functions only |
| Chandra | Firebase Functions config | Cloud Functions only |
| Gemini | Firebase Functions config | Cloud Functions only |
| Python service auth | GCP Secret Manager | Cloud Functions ↔ Cloud Run |

Client **never** sees API keys.

### 15.2 Database Rules

```json
{
  "rules": {
    "ai_chats": {
      "$uid": {
        ".read": "auth != null && auth.uid === $uid && root.child('users').child(auth.uid).child('role').val() === 'superadmin'",
        ".write": "auth != null && auth.uid === $uid && root.child('users').child(auth.uid).child('role').val() === 'superadmin'"
      }
    },
    "ai_provenance": {
      "$ans_id": {
        ".read": "auth != null && root.child('users').child(auth.uid).child('role').val() === 'superadmin'",
        ".write": false
      }
    },
    "lab_memory": {
      ".read": "auth != null && root.child('users').child(auth.uid).child('role').val() === 'superadmin'",
      ".write": false
    }
  }
}
```

### 15.3 Data Retention

- Conversations: keep all (user-deletable)
- Provenance: keep 1 year minimum (audit)
- Lab Memory: permanent (until manually deleted)
- API logs: 30 days

### 15.4 Paper Copyright

- RAG (truy xuất) chứ không train → fair use academic
- Citation strict (mỗi claim trace về paper)
- Don't share corpus externally
- Disclose AI usage trong publications

---

## 16. Evaluation Strategy

### 16.1 Golden Test Set

7 ảnh phổ user-uploaded (XRD WO₃, MoS₂/rGO SEM/HRTEM, Raman series, FTIR series, PL trion, Tauc 3.05 eV, xQDs Stokes shift) + 60 câu hỏi (20 mỗi tier) + expected outputs.

### 16.2 Ragas Metrics

```python
from ragas import evaluate

result = evaluate(
    dataset=test_set,
    metrics=[faithfulness, answer_relevancy, context_precision, context_recall]
)

assert result['faithfulness'] >= 0.90
assert result['answer_relevancy'] >= 0.85
assert result['context_precision'] >= 0.80
assert result['context_recall'] >= 0.75
```

### 16.3 User Feedback Aggregation

Weekly admin dashboard:
- Top 10 thumbs-up answers (good patterns)
- Top 10 thumbs-down (failure analysis)
- Citations clicked (source quality)
- Query reformulations (retrieval gaps)
- Verified facts count (memory growth)

---

## 17. Implementation Roadmap

### Phase A — Foundation (Round 105-115 + R129) ✅ DONE

| Round | Task |
|---|---|
| 105 | ✅ TypeScript skeleton: stubs, analyzer subfolders, .env, .gitignore |
| 106 | ✅ Firebase Blaze + Cloud Functions skeleton |
| 107 | ⏸️ Python service deferred (no use case yet) |
| 108-108b | ✅ AI Chat sidetab UI shell + draggable FAB |
| 109 | ✅ Conversation schema RTDB `aiConversations/{uid}/{convId}` |
| 110 | ✅ Markdown + KaTeX + highlight.js + DOMPurify |
| 111-111b | ✅ Real Gemini Flash via geminiProxy + CSP for cloudfunctions.net |
| 112-112c | ✅ Tool calling — 6 read tools (chemicals, equipment, experiments, bookings, members, getCurrentDate) |
| 113-113b | ✅ Streaming fixes (race + stuck), Stop/Regenerate/auto-rename, error toast |
| 114 | ⏸️ Compliance KB deferred (Nghị định 24/2026 — no use case in lab) |
| 114-actual | ✅ Cloud Speech v2 Chirp 2 STT (vi-VN) |
| 115a | ✅ Action tools — 3 draft generators (createExperiment, updateChemicalStock, createBooking) |
| 115b | ✅ Confirmation card pattern with AI_DRAFT marker |
| 115c-d | ✅ confirmAction Cloud Function + commitDraft + actionAudit |
| 116-126 | ✅ Pre-Commercial Audit — 14 bugs + 3 features (see AUDIT_LOG.md) |
| 127-128 | ✅ Documentation phase (CLAUDE.md, ARCHITECTURE.md, AGENTS.md updates) |
| 129 | ✅ 4th action tool — recordExperimentResultDraft (HT-/EC- detection, diff card) |

### Phase B — RAG Infrastructure (Round 130-138) ✅ DONE

Deviations from original plan: Zotero/Drive sync deferred, contextual pre-prep deferred,
MatSciBERT alt deferred. See Section 5.4 for full reality vs design diff.

| Round | Task | Status |
|---|---|---|
| 130-131 | Paper upload UI + Storage + RTDB metadata | ✅ |
| 132 | Paper library list + filters | ✅ |
| 133 | Chandra OCR integration via chandraProxy | ✅ |
| 134 | Section-aware chunking (chunkPaper Cloud Function) | ✅ |
| 135 | Voyage embedding via Pub/Sub chain (paperPipelineRouter) | ✅ |
| 136 | Vector search backend + frontend UI | ✅ |
| 137a | BM25 inverted index in Firestore | ✅ |
| 137b | RAG eval framework + observability (tracer, cost, MRR/P@K/NDCG) | ✅ |
| 137c1-c2 | Voyage rerank-2.5 + frontend confidence badges | ✅ |
| 138a | Claude proxy infrastructure (Sonnet/Opus/Haiku) | ✅ |
| 138a-fix | Drop top_p (Anthropic mutual exclusion) | ✅ |
| 138b1 | searchPapers tool integration | ✅ |
| 138b1-fix | Correct R137b interface usage | ✅ |
| 138b1-fix2 | enrichTitles via RTDB | ✅ |
| 138b2a | Tier 1 RAG verified end-to-end | ✅ |
| 138b2b | NotebookLM-style citation chips with popover | ✅ |
| 138b2b-fix2..5 | Anchor fixes, CSS append, msgId migration, combo regex | ✅ |

**Baseline metrics** (10 seed queries, 3 papers, 678 chunks, R137c2):
- Hybrid + rerank: MRR=1.0, P@10=0.95, NDCG=0.99
- Latency: 520ms warm, 3-4s cold (Voyage rerank dominates)

### Phase B.4 — Knowledge Graph (planned)

Triggers: lab needs citation network, cross-paper discovery.

- Citation extraction (regex + references parser + OpenAlex enrichment)
- Entity extraction (compounds, methods, conditions via Gemini Flash structured output)
- Neo4j AuraDB Free (200K nodes, 400K edges) or Firestore graph collection
- Graph-aware retrieval (multi-hop queries: "papers citing this method")

### Phase B.5 — Research Schema Foundation (planned)

Triggers: cross-experiment analytics, AI provenance-aware reasoning.

- Define unified entities: Sample, Material, Experiment, DataAsset, Instrument
- Non-breaking domain layer (parallel to existing flat collections)
- Lineage tracking (sample → experiment → measurement → metric)
- Material ontology (formula, category, known properties, references)
- Frontend lineage UI (Sample detail page shows experiment chain)

### Phase B.6 — Synthesis + Memory (planned)

Triggers: B.4 + B.5 stable.

- Query router (intent classification: factual / synthesis / discovery)
- Synthesis chain (gather → group → compare → summarize)
- Frontend synthesis report UI
- Episodic Lab Memory schema + auto-extract from experiments + verified-by-lead promotion

### Phase C-1 — Optical & Structural Analyzers (Round 129-145)

| Round | Task |
|---|---|
| 129 | Workbench page shell + Spectrum Analyzer tab |
| 130 | File upload UI + spectrum-tools.ts wrapper + types |
| 131-132 | XRD parser (generic .xy/.txt) + Python /xrd/analyze (pymatgen) |
| 133 | XRD Scherrer + lattice refinement + JCPDS via Materials Project |
| 134-135 | Raman parser + Python /raman/deconvolve (lmfit Voigt) |
| 136 | Raman MoS₂/WS₂ layer counting + D/G ratio |
| 137-138 | UV-Vis (reuse jcamp-jasco + tauc) + Urbach + Kubelka-Munk |
| 139-140 | PL parser + Python /pl/multi-gauss (trion A⁻/A⁰/B for TMDs) |
| 141-142 | FTIR (reuse jcamp-jasco) + functional group KB |
| 143-144 | LSV/HER (reuse corrware) + Tafel + overpotential |
| 145 | Microscopy vision-based (SEM/TEM via Claude Vision) |

### Phase C-2 — Electrochemistry Analyzers (Round 146-160)

| Round | Task |
|---|---|
| 146 | Tier 3 orchestrator with Opus 4.7 (Plan-Execute-Reflect) |
| 147 | CV analyzer (extend corrware): redox peaks, ECSA via Cdl |
| 148 | EIS Nyquist plot via python-service (impedance.py) |
| 149 | EIS equivalent circuit fitting (Rs, Rct, CPE) |
| 150 | Reflection loop + CRAG grader |
| 151 | GCD specific capacitance + energy density |
| 152 | OCP transient + OOD detection |
| 153 | Lab Memory schema + write API |
| 154 | Auto-extract facts from experiments |
| 155 | Feedback loop (thumbs aggregation) |
| 156 | Reformulation pattern learning |
| 157 | Provenance chain UI display |
| 158 | Verify-and-promote-to-memory flow |
| 159 | Eval pipeline (Ragas weekly) |
| 160 | Eval dashboard for admin |

### Phase C-3 — Photoelectrochemistry Analyzers (Round 161-175)

| Round | Task |
|---|---|
| 161 | PEC dispatcher + chopped-light data structure |
| 162-163 | PEC LSV under chopped light: photocurrent, ABPE |
| 164 | PEC chronoamperometry chopped: photoresponse stability |
| 165-166 | Mott-Schottky data parsing (multi-frequency) |
| 167 | Mott-Schottky linear fit → flat-band, Nd via pymatgen |
| 168-169 | IPCE/EQE parsing + APCE calculation |
| 170 | Surface analyzers dispatcher |
| 171-173 | XPS via Python /xps/peak-fit (lmfit Voigt + Shirley) |
| 174 | EDS atomic % quantification |
| 175 | BET surface area + BJH pore distribution |

### Phase D — Materials DB + Structure (Round 176-190)

| Round | Task |
|---|---|
| 176 | TGA/DSC analyzer |
| 177-178 | Materials Database tab (CAS + JCPDS card library + COD integration) |
| 179-180 | Structure Viewer (3Dmol.js + CIF parsing via pymatgen) |
| 181-183 | DFT Launcher input gen (QE/CASTEP/VASP via ASE) |
| 184-186 | DFT output parser (band structure, DOS, formation energy) |
| 187-190 | Materials AI Writer (templates + LaTeX/Word export) |

### Phase E — Advanced Features (Round 191-220+)

| Round | Task |
|---|---|
| 191-195 | Lab Mode (F key) + voice-first workflow |
| 196-200 | Knowledge Graph viz |
| 201-205 | Spectrum Compare (drag overlay) |
| 206-210 | What-if Simulator (predict before experiment) |
| 211-220 | UI redesign per DESIGN.md (interleaved) |

---

## 18. Risk & Mitigation

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| LLM cost spike | Medium | High | Hard quota, prompt caching, tier routing |
| Hallucination in scientific claims | High initially | High | 9-layer protection, provenance, eval |
| Vector DB scale issues | Low (1k papers) | Medium | Monitor, ready to migrate to Pinecone |
| Voyage API rate limits | Low | Low | Batch queries, fallback Gemini embed |
| Anthropic API outage | Low | High | Fallback Gemini Pro for Tier 2 |
| Chandra OCR quota exhausted | Medium | Medium | Self-host pymupdf as fallback |
| Cold start Cloud Run | Medium | Low | Pre-warm via cron, graceful UX |
| Container size > limit | Low | Medium | Multi-stage Docker, slim base |
| Python service downtime | Low | Medium | TS fallback for basic computations |
| Paper copyright dispute | Low | High | Strict citation, no redistribution |
| Lab member resistance | Medium | Medium | Superadmin-only Phase A, prove value |

---

## 19. Decision Log

| Date | Decision | Rationale |
|---|---|---|
| 2026-05-07 | 3-Tier architecture | Cost optimization + capability matching |
| 2026-05-07 | Claude Opus/Sonnet for Tier 2-3 | Vision + reasoning quality |
| 2026-05-07 | Voyage-3 over Gemini embed | Anthropic ecosystem coherence |
| 2026-05-07 | Firestore Vector Search | Native Firebase integration |
| 2026-05-07 | Chandra for OCR, not spectrum | Right tool for right job |
| 2026-05-07 | Web Speech API Phase 1 | Free, immediate, decent quality |
| 2026-05-07 | 9-layer anti-hallucination | Scientific claims demand high faithfulness |
| 2026-05-07 | Provenance chain from day 1 | Critical for thesis defensibility |
| 2026-05-07 | Superadmin-only Phase 1 | Cost control + iteration speed |
| 2026-05-07 | Materials AI Writer over AI-Scientist v2 | Domain-specific, no GPU needed |
| 2026-05-07 | TypeScript strict partial (preserved) | Avoid 100+ type errors blocking AI work |
| 2026-05-07 | AI module in `src/ts/ai/` (not new repo) | Single codebase, easier reuse |
| 2026-05-07 | **Hybrid TS + Python (Cloud Run)** | Materials informatics needs pymatgen/ASE/lmfit |
| 2026-05-07 | **Reuse existing parsers/ + plot/** | Single source of truth for science |
| 2026-05-07 | **6 analyzer groups × 24 subfolders** | Full coverage: structural/optical/echem/PEC/surface/microscopy |
| 2026-05-07 | **Phase C split into C-1, C-2, C-3** | Manageable phase size (~17 rounds each) |
| 2026-05-07 | **Roadmap expand to 220 rounds** | Realistic given full scope |
| 2026-05-07 | **MatSciBERT alongside Voyage** | Domain-specific embedding for materials |

---


## 20. Multi-tenant SaaS considerations

> Added during R160 (Labyra rebuild) — labbook-bku was single-tenant superadmin-only.
> Labyra is multi-tenant from day one. This section tracks SaaS-readiness gaps.

### 20.1 Access control & isolation (✓ done in R160)

- **Sub-collection model**: all tenant data under `/tenants/{tenantId}/...`
- **Firebase Auth custom claims**: `tenantId` + `role` (admin/superadmin/member/viewer)
- **Firestore rules**: `belongsToTenant(tenantId)` guard on every collection
- **Route Handler auth**: AI requests verify ID token + extract tenantId
- **Provenance scoping**: writes to `/tenants/{tenantId}/aiProvenance/{messageId}`

### 20.2 Cost attribution per tenant (target: Phase E pre-commercial)

**Problem**: Single `ANTHROPIC_API_KEY` for all tenants → can't bill individual customers.

**Solution**: Every provenance record logs:

```typescript
{
  tenantId: string,
  userId: string,
  cost: {
    input_tokens: number,
    output_tokens: number,
    cache_read_tokens: number,
    cache_write_tokens: number,
    usd: number
  }
}
```

**Aggregator** (monthly Cloud Function):

```typescript
const usage = await db.collection(`tenants/${tenantId}/aiProvenance`)
  .where('timestamp', '>=', startOfMonth)
  .get();
const totalUsd = usage.docs.reduce((sum, d) => sum + d.data().cost.usd, 0);
```

Status: schema designed in R160-ai-1, aggregator deferred to Phase E.

### 20.3 Rate limiting per tenant (target: Phase E pre-commercial)

**Problem**: One tenant abuse → exhaust shared API quota → blocks other tenants.

**Solution**: Redis sliding window counters:

```
rate_limit:chat:{tenantId}:{minute}   → max 60 req/min
rate_limit:tokens:{tenantId}:{month}  → max 1M tokens/month (Tier A plan)
                                       → max 5M tokens/month (Tier B plan)
```

Plus **per-user** limits within tenant to prevent single user hijacking quota.

Status: defer to pre-commercial. Optionally use Upstash Redis (Vercel-friendly,
edge-compatible).

### 20.4 Per-tenant configuration (target: ai-2)

**Problem**: Different labs want different defaults. WO₂ lab vs perovskite lab have
different system prompts, model preferences, enabled tools.

**Solution**: `/tenants/{tenantId}/settings/ai` document:

```typescript
interface TenantAiSettings {
  defaultTier: 1 | 2 | 3;
  systemPromptOverride?: string;       // append to base prompt
  enabledTools: string[];              // subset of full tool list
  enabledTiers: (1 | 2 | 3)[];         // restrict expensive tiers
  monthlySpendingCapUsd: number;       // hard cap, blocks at limit
  ragEnabled: boolean;
  ragCorpusScope: 'lab-only' | 'global' | 'curated';
}
```

Admin UI in `/dashboard/settings/ai` (planned ai-3).

Status: schema in ai-2, UI in ai-3.

### 20.5 Data residency (target: Phase E pre-commercial)

**Problem**: Anthropic API default-routes to US-East. May violate:
- GDPR for EU customers
- Nghị định 24/2026 Vietnam (if lab data must stay in VN)
- HIPAA-equivalent regulations (depending on customer)

**Solution options**:

| Option | Region | Trade-off |
|---|---|---|
| AWS Bedrock | asia-southeast (Singapore) | Native Claude, +$ Bedrock surcharge |
| Google Vertex AI | asia-southeast1 (matches Firebase) | Native Claude on Vertex, ecosystem coherence |
| Direct Anthropic | US-East only | Cheapest, simplest, no compliance |

**Provenance must log**:

```typescript
{
  region: 'us-east-1' | 'ap-southeast-1' | 'asia-southeast1',
  provider: 'anthropic-direct' | 'aws-bedrock' | 'gcp-vertex'
}
```

Status: ai-1 uses Anthropic direct (US). Migrate to Vertex AI when commercial.

### 20.6 Conversation isolation (target: ai-1 + ai-3)

**Problem**: Cross-tenant data leak = catastrophic SaaS bug.

**Required guarantees**:
- RAG retrieval scoped to `/tenants/{tenantId}/paperChunks/...` — server-side filter
- Tool execution scoped to tenant's collections: `query_chemicals()` filters by `tenantId`
- Provenance writes use tenantId from token, not from request body

**Test cases**:
- Token claims `tenantId=A`, request body says `tenantId=B` → use A (token wins)
- Expired token → 401, don't process
- Token from labyra-app-prod sent to labyra-app-dev → 401 (audience mismatch)
- Missing tenantId claim → 403, force re-auth

Status: ai-1 enforces token-extraction pattern. Test cases ship with ai-3.

### 20.7 Provider abstraction (target: ai-3)

**Problem**: 100% Anthropic + Google = vendor lock-in risk:
- API outage = app dead
- Price increase 2x = margin sup
- Policy change banning use case

**Solution**: `src/lib/ai/providers/` abstraction layer:

```
providers/
  types.ts              # LLMProvider, LLMMessage, LLMStream interfaces
  anthropic.ts          # primary
  openai.ts             # fallback for outage
  bedrock.ts            # data residency option
  vertex.ts             # ecosystem option
  index.ts              # selectProvider() based on tenant config + env
```

Every Tier's logic targets `LLMProvider` interface, not concrete SDK.

Status: ai-1 writes Anthropic directly. ai-3 refactors to abstraction. Migration
strategy: ship ai-1 working, abstract when there's a real second use case.

### 20.8 Migration phases summary

| Phase | What ships |
|---|---|
| R160-ai-1 | Provenance schema with cost fields. Anthropic direct, US region. Token + tenantId enforcement. |
| R160-ai-2 | Per-tenant config schema + read in Route Handler |
| R160-ai-3 | Provider abstraction layer. Conversation isolation test suite. |
| Phase E pre-commercial | Cost aggregator + billing. Rate limit Redis. Data residency migration (Vertex AI). Spending cap enforcement. |

---


## 21. Fine-tuning policy

**Position**: Labyra does NOT fine-tune Claude (Anthropic doesn't offer it) and avoids
fine-tuning third-party models for materials science domain. We rely on prompt
engineering + RAG instead.

### Why no fine-tuning

| Approach | Considered | Verdict |
|---|---|---|
| Fine-tune Claude | Not available — Anthropic does not offer this | N/A |
| Fine-tune OpenAI (gpt-4o-mini) | Cost $50-500 + serving overhead | Reject — prompt + RAG matches quality |
| Fine-tune Gemini Flash | Available via Google AI Platform | Reject — same reason |
| Fine-tune open model (Llama, Qwen, MatSciBERT) | Cheap, self-host possible | Defer — only if Phase E scale needs |

### Where prompt engineering + RAG wins

For Labyra's domain (electrochemical materials science), the following alternatives
match or beat fine-tuning quality:

- **Few-shot examples in cached system prompt** (5-20 examples)
  → matches FT quality for classification/extraction tasks at 0 training cost
- **Domain glossary as cached context** (chemical formulas, units, methods table)
  → eliminates "model doesn't know WO₃" failures
- **RAG with reranking** (Voyage rerank-2.5 + BM25 hybrid)
  → grounds answers in actual papers, FT can't compete with grounded retrieval
- **Tool calling for structured output**
  → forces JSON-valid output without FT for format consistency

### Exception scenarios (deferred far-future)

Re-evaluate fine-tuning if Phase E reaches:

- **>100 paying labs** with similar query patterns → batch routing model (FT Llama 3.1 8B)
- **Vietnamese scientific writing style** required for output → FT for tone matching
- **Specialized NER for chemistry** if Haiku 4.5 accuracy drops below 90% on entity extraction

Owner of this policy: AI Architecture lead. Review trigger: corpus exceeds 50,000 docs
OR commercial scale exceeds 100 tenants.

---

## 22. GraphRAG layer

**Status**: deferred to phase ai-6 (after vanilla RAG in ai-5 establishes baseline).

**Decision rationale**: At corpus scale 5,000+ papers in a controlled domain
(electrochemical materials), vanilla RAG hits a recall ceiling around 70-80% on
relational and aggregation queries. GraphRAG adds 15-30% accuracy at +20% indexing
cost. The ROI tips toward GraphRAG above the 1,000-paper mark in a structured domain.

### Why Labyra's corpus is well-suited

Labyra's seed corpus covers 4 electrochemical applications (energy storage, supercaps,
gas sensors, water splitting). Properties:

- **Controlled vocabulary**: ~500 chemical formulas, 50 methods, 100 measurable
  properties. Compare to general-purpose corpus (Wikipedia) with millions of entities.
- **Measurable properties**: capacity (mAh/g), specific capacitance (F/g),
  overpotential (mV @ 10 mA/cm²), photocurrent (mA/cm²), bandgap (eV). All numeric,
  unit-tagged, comparable across papers.
- **Stable relations**: `material → exhibits → property`, `property → measured_by →
  method`, `material → synthesized_by → method`, `material A → heterojunction_with →
  material B`.

These properties make entity extraction tractable and relation extraction high-precision.

### Query patterns that need GraphRAG

| Query type | Vanilla RAG | GraphRAG |
|---|---|---|
| "Tell me about WO₃ properties" (lookup) | ✓ Good | ✓ Good (no advantage) |
| "What's the bandgap of WO₃?" (fact) | ✓ Good | ✓ Good |
| "Which materials beat 30% IPCE at 400 nm?" (filter+aggregate) | ✗ 40% recall | ✓ 85% recall |
| "How does WO₃/WS₂ heterojunction affect photocurrent?" (relational) | ✗ 50% recall | ✓ 85% recall |
| "Survey supercaps with capacitance > 200 F/g" (enumerate) | ✗ 45% recall | ✓ 90% recall |

Half of research queries are filter/aggregate/relational — exactly where GraphRAG wins.

### Graph schema (Labyra-specific)

Stored under `/tenants/{tenantId}/aiGraph/...`. Schema:

```typescript
// Nodes
interface Entity {
  id: string;                         // 'mat:WO3' or 'prop:bandgap_eV'
  type: 'material' | 'property' | 'method' | 'application' | 'paper';
  name: string;                       // 'WO₃' (display)
  aliases: string[];                  // ['tungsten trioxide', 'WO3', 'W-oxide']
  canonical_formula?: string;         // for materials: 'WO3'
  unit?: string;                      // for properties: 'eV', 'mAh/g'
  papers: string[];                   // chunkIds referencing this entity
}

// Edges
interface Relation {
  id: string;
  from_entity_id: string;
  to_entity_id: string;
  type:
    | 'exhibits'              // material → property
    | 'measured_by'           // property → method
    | 'synthesized_by'        // material → method
    | 'heterojunction_with'   // material → material
    | 'doped_with'            // material → material/element
    | 'applied_to'            // material → application
    | 'reported_in';          // entity → paper
  evidence_chunks: string[];  // chunk IDs supporting this claim
  value?: number;             // for property edges: '3.05'
  confidence: number;         // 0.0-1.0 from NER extraction
  paper_count: number;        // how many papers support this
}
```

### Building the graph

Pipeline per new paper (after vanilla chunking + embedding):

```
For each chunk:
  1. NER via Claude Haiku 4.5 (cached system prompt with domain examples)
     → extract: materials, properties, methods, numeric values
  2. Coreference resolution (link 'this material' to entity from context)
  3. Relation extraction via Claude Haiku
     → identify which entity-pairs co-occur with relation verbs
  4. Entity resolution (merge 'WO3' === 'WO₃' === 'tungsten trioxide')
     → use canonical_formula + aliases
  5. Confidence scoring: chunk evidence + paper count
  6. Upsert nodes + edges to Firestore
```

Estimated cost: $0.03/paper (Haiku NER + relation extract, cached system prompt).
For 5,000 papers: **~$150 one-time graph build**.

### Query-time integration

```
User query
  ↓
NER on query → mentioned entities (Haiku, $0.0001)
  ↓
Two-stage retrieval:
  Stage A: Vector + BM25 (vanilla) → top 30 chunks
  Stage B: Graph traverse from query entities (1-2 hops) → subgraph + connected chunks
  ↓
Merge results (RRF fusion across both)
  ↓
Voyage rerank-2.5 → top 8 chunks + graph context summary
  ↓
LLM with structured context (entities, relations, chunks)
```

### Phase plan

| Phase | Deliverable |
|---|---|
| **ai-5** | Vanilla RAG (BM25 + vector + rerank) — establish baseline accuracy |
| **ai-6** | GraphRAG layer:<br>- NER pipeline<br>- Graph schema in Firestore<br>- Entity resolution<br>- Hybrid query strategy<br>- Eval framework comparing vanilla vs +graph |
| **Phase 6+** | Re-evaluate after collecting query patterns from real users |

### Risks

1. **Entity resolution errors** — `WO₃` (chemistry) vs `WO3` (abbreviation) vs `tungsten oxide` (full name). Mitigation: pymatgen formula canonicalization + alias table.
2. **Stale graph** — papers re-chunked → entities reshuffled. Mitigation: incremental updates with paper_id provenance.
3. **Query NER false positives** — "blue" in "blue-shift" mistaken for color entity. Mitigation: domain-tuned NER prompt with negative examples.
4. **Cost overrun** — 5,000 papers × 50 chunks/paper × Haiku ≈ $50, but if relation extraction expensive could 10x. Mitigation: batch processing, prompt caching.

### Owner

GraphRAG implementation owner: AI Architecture lead. Implementation in phase ai-6
(after ai-5 vanilla RAG baseline is measured).

---


## 23. RAG enhancements (Contextual chunking + HyDE)

Two retrieval improvements from `docs/ai/labbook-ai-architecture-report.md` are
documented in detail in `docs/ai/RAG_STRATEGY.md`:

- **Contextual chunking** (PRIORITY HIGH) — see RAG_STRATEGY Section 2.3.
  Anthropic technique, +49-67% retrieval recall, integrated in phase ai-5 indexing pipeline.
- **HyDE query rewriting** (PRIORITY MEDIUM) — see RAG_STRATEGY Section 3.3.
  Hypothetical document embeddings for vector search; deferred to phase ai-6,
  feature-flagged per tenant.

Both share Claude Haiku 4.5 as the worker model with prompt caching enabled.

---

*This is a living document. Update with each architectural decision.*


## Section 24: RAG Provider Stack (R160-ai-5a)

Final stack decisions for SaaS → Enterprise scale:

### Embedding: Voyage AI
- Model: `voyage-3-large` (1024 dim, $0.18/M tokens)
- Rerank: `rerank-2.5` ($0.05/M tokens)
- Rationale: Anthropic preferred partner, SOTA retrieval accuracy, domain-specific models
- Free trial: 200M tokens

### Vector store: Pinecone Serverless
- Multi-tenant: one namespace per tenant
- Index: `labyra-papers`, dimension 1024, cosine metric, AWS us-east-1
- Cost: Starter free (5GB, 100K vectors), Standard $50/m
- Rationale: Million-scale namespaces (Std/Ent), BYOC available, time-to-market

### OCR: Provider abstraction (Mistral active)
- Active: Mistral OCR 3 — $1/1000 pages batch, 96.6% table accuracy, native LaTeX
- Abstraction interface (`OcrProvider`): future-proof for Chandra, Textract, on-prem
- Rationale: 97% cheaper than Textract, scientific paper SOTA, swap-ready for enterprise

### Note on plan deviation
Original AI_ARCHITECTURE plan specified Chandra OCR. Replaced with Mistral OCR 3 because:
1. Mistral OCR 3 SOTA scientific paper accuracy (Dec 2025 release)
2. 97% cost savings ($1 vs $65/1000 pages Textract baseline)
3. Multi-lingual support stronger (Vietnamese papers)
4. Provider abstraction preserves swap-ability for enterprise on-prem requirements

