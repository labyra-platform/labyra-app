# ADR-049: WorkflowGraph Engine — node-based UI cho Protocol + DFT

> **Status**: Proposed (chờ go/no-go của founder về dependency `@xyflow/react`)
> **Date**: 2026-06-05
> **Context refs**: labyra-workflow-node-graph-strategy.md (spec 418 dòng), labyra-ai-science-manuscript-strategy.md §4.3, ADR-016 (PROV-O data model), ADR-018 (async worker), DFT spec (labyra-dft-complete-spec.md)
> **Relates**: cung cấp surface UI cho Protocol (chưa có route) + Computation→DFT (chưa có route) trong IA spec §1; manuscript pipeline (R267) là linear → KHÔNG dùng engine này (xem §4)

---

## 1. Context

Spec workflow (418 dòng) đề xuất **một** engine `<WorkflowGraph>` dùng chung cho 2 màn:
- **Protocol** — quy trình thí nghiệm dạng node (Blender-style: input ngay trên node).
- **DFT/Computation** — pipeline tính toán (Mat3ra-style: panel cạnh graph).

Nguyên tắc **AiiDA** (chỉ principle, KHÔNG chạy runtime AiiDA): DAG provenance, phân biệt data-node vs logical-node, reproducibility. Tái dùng PROV-O đã có (ADR-016) cho lineage.

**Vấn đề cần quyết TRƯỚC khi code:** render một node-graph tương tác (pan/zoom/drag/handle/edge-routing) là việc nặng. Phải chọn:
1. Thêm thư viện node-graph (dependency mới), hay
2. Tự dựng bằng cái đã có (d3/SVG).

Constraint của founder: **"dùng cái đã có · không over-engineer · license sạch cho commercial SaaS · ĐO TRƯỚC."**

**Hạ tầng đã có (package.json thực tế):** `d3 ^7.9.0` (kèm `d3-hierarchy`, `d3-zoom`), `@dnd-kit/*`, `recharts`. **CHƯA có** `@xyflow/react`, `reactflow`, `dagre`, `elkjs`.

---

## 2. Decision (đề xuất)

1. **Render engine: `@xyflow/react` v12** — thêm **1 dependency mới duy nhất**.
2. **Auto-layout: `d3-hierarchy`** (đã có sẵn qua `d3`) cho MVP (DFT + protocol linear/tree). **KHÔNG** thêm dep layout ở giai đoạn này.
3. **`@dagrejs/dagre`** (fork đang maintain của dagre) **defer** — chỉ thêm khi Protocol có DAG thật (node merge nhiều nhánh) mà d3-hierarchy (tree-only) không xử lý được.
4. **Một** component `<WorkflowGraph>` ở `src/features/workflow/` (engine + types + PROV-O adapter); Protocol ở `src/features/protocol/`, DFT tái dùng engine với panel riêng.
5. **AiiDA = principle only** (DAG, data/logical node, reproducibility) — không cài/không chạy runtime AiiDA.

---

## 3. Options considered

| # | Phương án | License | Dep mới | Đánh giá |
|---|---|---|---|---|
| **A ✓** | `@xyflow/react` + `d3-hierarchy` | MIT + (d3 đã có) | **1** (`@xyflow/react`) | **Khuyến nghị.** Engine chuẩn ngành cho node-UI; layout dùng d3-hierarchy có sẵn → MVP 0 dep layout. |
| B | `@xyflow/react` + `@dagrejs/dagre` | MIT + MIT | 2 | Layout DAG mạnh hơn nhưng +1 dep; chưa cần ở MVP (đa số flow linear). Để dành. |
| C | `@xyflow/react` + `elkjs` | MIT + EPL | 2 | elkjs ~1.4MB, Java-port, layout **async**, cấu hình phức tạp — over-engineer cho nhu cầu hiện tại. **Loại.** |
| D | Tự dựng bằng d3/SVG thuần | — | 0 | Phải tự làm pan/zoom/drag/handle/edge-routing/selection = viết lại React Flow. Tốn công + dễ bug + khó maintain. Trái "không over-engineer" theo hướng ngược. **Loại.** |

### 3.1 License (constraint chính của founder)
`@xyflow/react` (v12) là **MIT, miễn phí cho mọi mục đích kể cả commercial** — xác nhận trực tiếp từ maintainer (xyflow): *không cần subscription, không có "pro feature" bị khoá trong core*. "React Flow Pro" chỉ là **sponsorship + ví dụ trả phí + support**, hoàn toàn tùy chọn, không ảnh hưởng quyền dùng core. → **License sạch cho SaaS thương mại.** ✓

### 3.2 dagre đã deprecated
Spec gốc ghi "React Flow + dagre". **Lưu ý quan trọng: `dagre` (bản gốc) đã ngừng maintain.** React Flow docs cũng đã chuyển ví dụ sang `@dagrejs/dagre` / `d3-hierarchy` / `elkjs`. Nên ADR này **không** dùng dagre gốc; nếu cần DAG layout sau → `@dagrejs/dagre` (fork maintain, MIT).

### 3.3 Bundle
`@xyflow/react` core tree-shakeable, phụ thuộc `d3-zoom` (nhỏ). Nặng hơn hiện trạng nhưng **nhẹ hơn nhiều so với elkjs (~1.4MB)**. Founder nên verify con số chính xác trên bundlephobia trước khi chốt (ĐO TRƯỚC) — không hardcode số ở đây để tránh sai lệch.

---

## 4. Manuscript KHÔNG dùng engine này
Theo manuscript spec §4.3 + thực tế R267: manuscript pipeline là **linear** (IMRaD theo thứ tự). Section đã quản qua `manuscript-canvas` (toggle `pipelineSections`). → Manuscript dùng **stepper tuyến tính**, KHÔNG cần node-graph. Engine `<WorkflowGraph>` chỉ cho Protocol + DFT (nơi có nhánh/song song thật).

---

## 5. Consequences

**Tích cực:** node-UI chuẩn ngành (pan/zoom/drag/handle/edge sẵn), 1 engine dùng chung 2 màn (Protocol + DFT), 1 dep mới duy nhất, layout 0-dep ở MVP, PROV-O tái dùng cho lineage → đồng nhất provenance toàn hệ.

**Tiêu cực / chi phí:** +1 dependency (`@xyflow/react`) + CSS của nó (`@xyflow/react/dist/style.css`); cần wrap theme tokens cho khớp shadcn/Tailwind v4; layout d3-hierarchy chỉ tốt cho tree → DAG phức tạp phải đợi `@dagrejs/dagre` (B).

**Việc kéo theo (sau khi approve dep):** tạo route Protocol + Computation→DFT (hiện chưa có → đang là dead-link đã defer ở nav R266); nest lại vào Experiments▾ khi route xong.

---

## 6. Quyết định cần từ founder

> **Approve thêm dependency `@xyflow/react` (MIT) không?**
> - **Yes** → tôi scaffold `src/features/workflow/<WorkflowGraph>` (engine + types + PROV-O adapter) làm round đầu, rồi Protocol/DFT route + nest nav.
> - **No / muốn 0-dep** → fallback phương án D (d3/SVG thuần) cho MVP rất hạn chế, hoặc hoãn toàn bộ workstream node-graph.

Mọi hạng mục tiếp theo của workstream ④ (Protocol UI, DFT graph) **block trên quyết định này.**
