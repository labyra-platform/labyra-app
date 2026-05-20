# ADR-016 — PROV-O Data Model & Entity Lineage

> Mô hình dữ liệu nền tảng của Labyra dựa trên W3C PROV-O: phân loại entity, cách liên kết lineage, lifecycle, và quy ước collection/ID.
> Document hồi cố — model đã hoạt động ổn định từ R164; ADR này gom các quyết định rải rác thành nguồn chân lý.

**Status**: Accepted (retroactive)
**Date**: 2026-05-20 (model có từ R164, link inversion R186-2b)
**Round**: R164 (foundation) → R186-2b (Sample↔Experiment inversion)
**Related**: ADR-017 (Citation network — cũng dùng PROV-O), ADR-026 (Data integrity layer 2), ADR-030 (RBAC — cùng /tenants model)
**Scope**: `labyra-app` data model + `labyra-spectra-worker` (cùng đọc/ghi collection chuẩn). Áp dụng mọi entity khoa học.

---

## 1. Executive Summary

Labyra mô hình hóa data nghiên cứu theo **W3C PROV-O** (Provenance Ontology) để mọi kết quả đều truy vết được nguồn gốc — yêu cầu cốt lõi của lab quốc tế (reproducibility, audit, compliance).

Ba lớp PROV-O:

| PROV-O type | Entity Labyra | Ý nghĩa |
|---|---|---|
| **Activity** (process) | Experiment | Quá trình tạo ra/biến đổi entity |
| **Entity** (thing) | Sample, Measurement, Material, Analysis, Reference, Citation | Vật/dữ liệu được tạo ra |
| **Agent** (actor) | User (qua createdBy) | Người/hệ thống chịu trách nhiệm |

Liên kết bằng 2 field PROV-O chuẩn (KHÔNG tự chế field khác):
- `generatedBy` → `wasGeneratedBy`: entity được sinh ra bởi activity nào.
- `derivedFrom` → `wasDerivedFrom`: entity dẫn xuất từ entity nào.

---

## 2. Entity Model

### 2.1 Phân loại

| Entity | PROV-O | Collection | ID convention | Bản chất |
|---|---|---|---|---|
| Material | Entity | `materials` | `mat_<slug>_<seq>` | Vật liệu lý thuyết / inventory |
| Sample | Entity | `samples` | `sam_<slug>_<seq>` | Mẫu vật lý cụ thể |
| Experiment | **Activity** | `experiments` | `exp_<slug>_<seq>` | Quá trình thí nghiệm |
| Measurement | Entity | **`spectra`** | UUID (activity ID) | Phép đo / phổ |
| Analysis | Entity | `analyses` | UUID | Kết quả phân tích AI |
| Reference | Entity | `references` | `ref_<slug>_<seq>` | Card tham chiếu phổ |
| Citation | Entity (edge) | `citations` | deterministic hash | Cạnh trích dẫn paper |

### 2.2 Phân biệt Material vs Sample (quan trọng)

- **Material** = vật liệu lý thuyết / kho. Knowledge base, signature, citation. KHÔNG vật lý. Còn ở root `materialProfiles` (global, superadmin-seed).
- **Sample** = mẫu VẬT LÝ cụ thể được theo dõi. Có `sampleCode`, khối lượng/thể tích/vị trí, `composition[]`, `parentMaterialIds`, `derivedFromSampleId`.

### 2.3 Workflow nghiên cứu

```
Experiment (Activity) tạo TRƯỚC
  → sinh ra Sample (Entity, generatedBy = experimentId)
  → đo Sample → Measurement (Entity)
```

Ràng buộc: 1 Sample thuộc về ĐÚNG 1 Experiment (1 exp : N sample, KHÔNG N:N). Không 2 experiment chia sẻ 1 spectrum.

---

## 3. Lineage Links

### 3.1 Field PROV-O (chỉ dùng 2 field này)

- **`generatedBy`** (string, → activity ID): entity sinh ra bởi activity nào.
- **`derivedFrom`** (string[], → entity IDs): dẫn xuất từ entity nào.

KHÔNG tự chế field link khác. Mọi traversal lineage (Lineage Explorer D3) dựa trên 2 field này.

### 3.2 Sample ↔ Experiment inversion (R186-2b)

**Quyết định**: Sample tham chiếu Experiment qua `sample.experimentId` (required) + `sample.generatedBy = experimentId`. Field `experiment.sampleIds` đã BỎ.

Lý do đảo chiều: 1 sample : 1 experiment (forward ref từ child) sạch hơn 1 experiment : N sampleIds (array phải maintain). Tìm sample của experiment: query `samples where experimentId == expId` (không cần array trên experiment).

`findExperimentsByContainsSample` đã xóa. Lineage edge `generatedBy` phải enqueue target node để fetch (D3 force — fix R186-2b).

### 3.3 Sample lineage bổ sung

- `parentMaterialIds` (canonical): material gốc của sample.
- `derivedFromSampleId`: sample cha (sample dẫn xuất từ sample).
- `derivedFrom` (PROV-O alias): fill bằng material IDs cho lineage query thống nhất.

---

## 4. Collection chuẩn = `spectra` (KHÔNG `measurements`)

**INVARIANT cứng**: collection lưu phép đo/phổ tên là **`spectra`**, KHÔNG phải `measurements`.

- Worker (production) đọc/ghi `spectra` — **nguồn chân lý**.
- notify-complete ghi `spectra`. Storage path `spectra/.../raw`. Indexes dùng `spectra`.
- `service-measurements.ts` đã sửa `COLLECTION = 'spectra'` (R186-3).

**Lịch sử bug**: một lần rename dở dang spectra→measurements khiến 4 app reader đọc nhầm `measurements` (0 docs) → "upload không hiện gì". Fix R186-3 đưa về `spectra`.

**Cảnh báo**: KHÔNG đề xuất đổi `spectra`→`measurements` cho "nhất quán" — phá worker production. Tên field/type có thể là Measurement, nhưng COLLECTION luôn `spectra`.

---

## 5. Lifecycle — xóa mềm, không hard delete

Mọi entity có `lifecycleStatus`: `active` | `deprecated` | `retracted`.

- "Delete" trong UI = deprecate/retract (qua `buildDeprecatePatch`/`buildRetractPatch`), KHÔNG hard delete.
- Retracted = immutable, KHÔNG reactivate được (compliance). Deprecated → reactivate được.
- Hard delete CHỈ trong dev cleanup script, không qua UI.
- List query mặc định chỉ `active`; opt-in `includeDeprecated`/`includeRetracted`.

Lý do: lab cần audit trail + reproducibility. Xóa thật làm mất lineage.

---

## 6. ProvBase — field chung mọi entity

```typescript
interface ProvBase {
  id: string;
  tenantId: string;           // multi-tenant (ADR-030)
  schemaVersion: number;
  createdBy: string;          // PROV-O Agent
  createdAt: number;
  generatedBy?: string;       // wasGeneratedBy → activity
  derivedFrom?: string[];     // wasDerivedFrom → entities
  lifecycleStatus: 'active' | 'deprecated' | 'retracted';
  updatedAt?: number;
  updatedBy?: string;
}
```

Path chuẩn: `tenants/{tenantId}/{collection}/{id}`. Mọi query MUST có tenantId filter (ADR-030).

---

## 7. Consequences

**Tích cực:**
- Truy vết nguồn gốc đầy đủ (Material → Sample → Experiment → Measurement → Analysis).
- Chuẩn W3C PROV-O → interoperable, compliance-ready, dễ export sang RDF/data paper.
- Lineage Explorer (D3) traverse được toàn bộ chain qua 2 field thống nhất.
- Lifecycle mềm giữ audit trail.

**Đánh đổi:**
- 2 field PROV-O (generatedBy/derivedFrom) phải maintain đúng mọi create.
- Collection `spectra` vs type `Measurement` lệch tên — dễ nhầm (đã gây bug R186-3).
- Inversion R186-2b cần migration nếu có data cũ (làm ở empty state, không migration).

---

## 8. References

- W3C PROV-O: https://www.w3.org/TR/prov-o/
- ADR-017 (Citation network — citation là PROV-O activity edge)
- ADR-026 (Data integrity layer 2), ADR-030 (RBAC & onboarding — cùng /tenants model)
- docs/scientific-methods/ (per-feature method docs)

---

## 9. Living Notes

- INVARIANT: collection = `spectra`; link = generatedBy/derivedFrom; xóa = lifecycle.
- R186-2b: Sample→experimentId; experiment.sampleIds đã bỏ.
- Pending: ADR-CSIE (cross-spectrum) sẽ tham chiếu model này.
- Numbering: ADR-016 đặt đúng vị trí lịch sử (PROV-O là nền tảng, có trước citation/worker).

*Document version 1.0 — retroactive R186. Model stable từ R164.*
