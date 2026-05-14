# Tâm Lý Hành Vi Người Dùng — Pre-Launch Research Report
## Labrya SaaS · Vietnam & Global · May 2026

> **Mục đích:** Hiểu tâm lý người dùng trước khi launch để thiết kế onboarding, pricing, UX, và marketing đúng hướng  
> **Target audience:** Researcher, lab manager, nghiên cứu sinh tại VN và quốc tế  
> **Sources:** Decision Lab Q3 2025, UTAUT research 2024–2025, SaaS behavior studies 2025–2026

---

## 1. Khung Lý Thuyết — 3 Model Quan Trọng Nhất

### 1.1 TAM (Technology Acceptance Model)
Model gốc giải thích tại sao người dùng accept hay reject công nghệ mới. 2 yếu tố cốt lõi:

```
Perceived Usefulness (PU)  →  "Cái này giúp ích gì cho tôi?"
Perceived Ease of Use (PEOU) → "Cái này có dễ dùng không?"
         ↓
    Behavioral Intention → Actual Use
```

**Với Labrya:** PU = tiết kiệm 4 giờ/ngày Excel + phân tích phổ tự động. PEOU = onboarding < 10 phút, không cần training.

---

### 1.2 UTAUT (Unified Theory of Acceptance and Use of Technology)
Mở rộng TAM, giải thích **70% behavioral intention variance** — mạnh hơn TAM (40–60%). 4 yếu tố:

| Yếu tố | Định nghĩa | Áp dụng Labrya |
|---|---|---|
| **Performance Expectancy** | Tin rằng tool giúp đạt kết quả tốt hơn | "AI phân tích XRD nhanh hơn tôi 10x" |
| **Effort Expectancy** | Tin rằng tool dễ dùng | "Upload file là xong, không cần code" |
| **Social Influence** | Người xung quanh dùng và recommend | "PI của lab bên cũng đang dùng" |
| **Facilitating Conditions** | Có infrastructure hỗ trợ | "Chạy trên web, không cần cài đặt" |

**Key insight:** Với academic researcher tại developing countries, **Trust và Social Influence là 2 yếu tố mạnh nhất** — mạnh hơn cả Performance Expectancy. Một PI tin tưởng → cả lab dùng.

---

### 1.3 BJ Fogg's Behavior Model
```
B = M × A × P
Behavior = Motivation × Ability × Prompt
```

Hành vi xảy ra khi cả 3 yếu tố hội tụ cùng lúc:
- **Motivation:** Researcher muốn publish paper nhanh hơn
- **Ability:** Labrya đủ dễ để dùng ngay
- **Prompt:** Email "Your XRD analysis is ready" → click vào

**Implication:** Đừng chỉ build feature tốt — phải có **trigger đúng lúc** (notification, email, in-app nudge).

---

## 2. Hành Vi Người Dùng Tại Việt Nam

### 2.1 Digital Behavior 2025 — Data thực tế

- **87% người dùng VN online dùng AI tools** (Decision Lab Q3 2025)
- **Internet penetration: 78%+**, smartphone adoption cao nhất ASEAN
- **85% online purchases qua mobile** — nghiên cứu sinh cũng browse và evaluate tool trên điện thoại
- Digital behavior đang **stabilize** — người dùng VN không còn adopt mọi tool mới, họ chọn lọc kỹ hơn

### 2.2 Đặc Thù Tâm Lý Người Dùng VN

**Trust-driven, không feature-driven:**
- Người VN không mua/dùng tool lạ → cần social proof mạnh
- Academic community nhỏ → word-of-mouth cực kỳ mạnh
- Một PI ở BKU recommend → 10 lab khác nghe

**Price sensitivity cao nhưng value-conscious:**
- Không phải "rẻ nhất là dùng" — mà là "value for money rõ ràng"
- $29/tháng/lab (không per-user) là positioning thông minh vì không cảm giác "bị tính tiền từng người"
- Free tier quan trọng để overcome risk aversion

**Mass psychology:**
- Quyết định theo nhóm, không cá nhân
- "Lab khác đang dùng" > "Tính năng hay"
- Cần case study từ lab VN thật, không chỉ global testimonial

**Risk aversion với data:**
- Researcher VN rất nhạy cảm về data ownership — "Data thí nghiệm của tôi có bị lấy không?"
- Cần communication rõ ràng: data không train AI model, không share với bên thứ 3
- Compliance Nghị định 24/2026 = tín hiệu "local, đáng tin"

**Mobile-first evaluation:**
- Researcher xem landing page trên điện thoại trước
- Nếu mobile experience kém → bounce ngay, không thử desktop

### 2.3 Generational Patterns (Quan trọng cho Labrya)

| Segment | Behavior | Strategy |
|---|---|---|
| **Gen Z** (sinh viên, NCS) | Early adopter, thử tool mới, share trên mạng | Free tier + referral program |
| **Millennials** (nghiên cứu viên 28–40) | Selective, cần ROI rõ ràng | Demo + case study cụ thể |
| **Gen X** (PI, trưởng nhóm 40+) | Slow adopter, trust-driven, budget control | Institutional trust + compliance story |

**Gen X là decision maker** — họ approve budget. Gen Z là champion — họ introduce tool vào lab. Strategy: Gen Z discover → Gen X approve.

---

## 3. Hành Vi Người Dùng Toàn Cầu (Global)

### 3.1 SaaS Adoption Psychology — Số Liệu 2025

- **70% SaaS users churn trong 90 ngày đầu** do onboarding kém
- **75% users churn trong tuần đầu** nếu không thấy value ngay
- Users return Day-1 → **3x khả năng trở thành power user** trong 30 ngày
- **23% B2B churn** xuất phát từ poor product adoption trong onboarding
- Cutting time-to-value 20% → **tăng ARR growth 18%** (Amplitude 2024)
- Users adopt 3+ core features trong tháng đầu → **tăng retention 40%**

### 3.2 Tâm Lý Churn — Không Phải Vì Feature

Sai lầm phổ biến: nghĩ user churn vì thiếu feature. **Thực tế: churn là psychology problem.**

```
User không churn vì software tệ
User churn vì:
  1. Không thấy value đủ nhanh (Time-to-Value quá chậm)
  2. Không hiểu mình đang dùng để làm gì
  3. Bị overwhelmed khi lần đầu vào app
  4. Không có trigger để quay lại
  5. Loss aversion: chưa đủ sunk cost để ở lại
```

**5% improvement in retention = tăng profitability 25–95%.**

### 3.3 Các Hiệu Ứng Tâm Lý Quan Trọng

**Mere-Exposure Effect:**
User càng thấy UI familiar → càng trust và adopt nhanh hơn. Dùng design patterns quen thuộc (shadcn/ui, familiar layouts) thay vì "sáng tạo" UI lạ.

*Áp dụng Labrya:* Navigation, form layout, button placement phải giống Notion/Linear/Vercel — researcher đã quen những pattern này.

**Zeigarnik Effect:**
Người ta nhớ task chưa hoàn thành nhiều hơn task đã xong. Progress bar onboarding tạo "open loop" → user muốn complete.

*Áp dụng Labrya:* Onboarding checklist "3/5 steps complete" → user cảm thấy cần finish. Không show all features ngay → show progressively.

**Loss Aversion (Kahneman):**
Sợ mất > muốn được. "Bạn sẽ mất 4 giờ/ngày nếu không dùng Labrya" mạnh hơn "Bạn tiết kiệm 4 giờ/ngày với Labrya."

*Áp dụng Labrya:* Messaging "Stop wasting time on Excel" > "Save time with AI". Free trial framing: "Bạn có 14 ngày Pro — đừng để lãng phí."

**Commitment & Consistency (Cialdini):**
Khi user đã bắt đầu làm gì đó, họ có xu hướng tiếp tục để consistent với quyết định ban đầu.

*Áp dụng Labrya:* Encourage user import một lô hóa chất, setup một experiment — sau khi có data trong app, churn cost tăng lên đáng kể.

**Social Proof:**
"1,200 researchers từ 45 lab đang dùng Labrya" > mọi feature description.

*Áp dụng Labrya:* Counter số lab, số spectrum analyzed, số paper supported. Real testimonial từ PI BKU/HUST.

**Authority Bias:**
Researcher trust source có authority — professor, journal, institution.

*Áp dụng Labrya:* Partnership với BKU/VNU trước launch. Mention pymatgen, Materials Project, RRUFF — tools họ đã biết và tin.

---

## 4. Tâm Lý Đặc Thù Của Academic Researcher

### 4.1 Researcher Khác B2B User Thông Thường

| Điểm | B2B User | Academic Researcher |
|---|---|---|
| **Decision cycle** | 1–3 tháng | 6–18 tháng hoặc ngay lập tức (nếu PI quyết) |
| **Buyer vs user** | Thường khác nhau | Thường cùng một người |
| **Budget** | Company budget | Personal/grant budget — sensitive |
| **Trust signal** | Brand, revenue, enterprise customer | Publication, institution, peer recommendation |
| **Churn reason** | ROI không rõ | Không có time, experiment kết thúc |
| **Expansion** | Upsell features | Refer colleagues, PI recommend |

### 4.2 Vòng Đời Researcher với Tool Mới

```
Stage 1: Skepticism
"Tool AI này có đáng tin không? Kết quả có verified không?"
→ Anti-hallucination 7-layer là câu trả lời trực tiếp

Stage 2: Trial
"Thử upload một cái XRD xem thế nào"
→ Time-to-first-insight phải < 2 phút

Stage 3: Habit Formation (ngày 3–7)
"Hmm, nhanh hơn tôi tự làm"
→ Consistent daily value, notification nhắc nhở

Stage 4: Dependency
"Tôi không muốn quay lại Excel nữa"
→ Data đã trong Labrya, export cost cao

Stage 5: Advocate
"Tôi đã recommend cho lab bên cạnh"
→ Referral trigger, shared experiment feature
```

### 4.3 Trust Hierarchy Trong Academic Context

```
Tier 1 (tin nhất):   Đồng nghiệp cùng field recommend
Tier 2:              PI / advisor recommend  
Tier 3:              Conference / journal mention
Tier 4:              Institution adoption (BKU dùng Labrya)
Tier 5:              Online review / demo video
Tier 6 (tin ít nhất): Ads, cold email, landing page claims
```

**Implication:** Đừng spend budget vào ads. Spend vào làm cho 5 lab đầu tiên cực kỳ hài lòng → họ sẽ convert 50 lab tiếp theo.

---

## 5. Framework Onboarding Dựa Trên Tâm Lý

### 5.1 Time-to-Value — Chỉ Số Quan Trọng Nhất

```
Target cho Labrya: < 10 phút từ signup → first "aha moment"

Aha moment của Labrya:
→ Upload một XRD file → nhận kết quả phân tích AI trong 60 giây
→ HOẶC: Thêm hóa chất đầu tiên → thấy GHS warning auto-populate
→ HOẶC: Hỏi AI một câu về sample → nhận câu trả lời có citation rõ ràng
```

**Đừng để user phải "setup xong rồi mới thấy value."** Value phải đến ngay trong lần đầu tiên.

### 5.2 Onboarding Flow Theo Tâm Lý

```
Step 1: Welcome (30 giây)
→ "Lab của bạn sẽ sẵn sàng trong 3 bước"
→ Không: dump feature list

Step 2: Quick win (2 phút)
→ Import một hóa chất, hoặc upload một spectrum
→ Immediate feedback: AI summary hiện ra ngay
→ Trigger dopamine: "Phân tích hoàn tất ✓"

Step 3: Personalization (1 phút)
→ "Lab của bạn nghiên cứu về lĩnh vực nào?"
→ Customize suggested templates, experiment types

Step 4: Invite teammate (optional, 30 giây)
→ "Mời đồng nghiệp để cộng tác" → tăng retention 2x
→ Optional — không force

Step 5: Next action nudge
→ "Bạn còn 2 bước để lab của bạn fully set up"
→ Zeigarnik effect: open loop → user muốn return
```

### 5.3 Behavioral Triggers — Giữ User Quay Lại

| Trigger | Timing | Message | Psychology |
|---|---|---|---|
| Spectrum analyzed | Sau 60s analyze | "Kết quả XRD của mẫu WO₃-03 đã sẵn sàng" | Variable reward |
| Low stock alert | Khi tồn kho < threshold | "L-Cysteine còn 2g — đặt mua trước khi hết?" | Loss aversion |
| Booking reminder | 1h trước | "XRD booking của bạn bắt đầu lúc 2PM" | Utility |
| Weekly digest | Mỗi thứ Hai | "Lab bạn: 3 thí nghiệm, 12 spectrum, 2 paper analyzed" | Progress |
| Idle re-engagement | Sau 7 ngày không login | "Mẫu WO₃-batch-04 của bạn chưa được phân tích" | Loss aversion + specific |

---

## 6. Pricing Psychology

### 6.1 Anchoring Effect
Luôn show tier đắt nhất trước để anchor perception:

```
Enterprise: Custom  ← anchor
Team: $79/tháng
Pro: $29/tháng      ← target
Free: $0
```

$29 trông rẻ khi đứng cạnh $79 và "Custom".

### 6.2 Decoy Pricing
Team tier ($79) là decoy làm Pro ($29) trông value hơn. Đa số user chọn Pro — đây là intent.

### 6.3 Annual vs Monthly Framing
- ĐỪNG nói: "Tiết kiệm 2 tháng khi trả năm"
- NÊN nói: "$290/năm = giá 2 buổi cà phê nhóm lab/tháng"
- Contextualize với chi phí quen thuộc của researcher

### 6.4 Free Trial Psychology
- Free tier (không time limit) tốt hơn free trial (14 ngày) cho academic
- Lý do: Researcher có experiment cycle dài, không muốn pressure
- Upgrade trigger: khi hit AI query limit, không phải timer

### 6.5 Per-Lab vs Per-User Pricing
- Per-lab FLAT = researcher không cảm thấy "bị tính tiền"
- Per-user = tạo friction khi invite → giảm expansion
- Academic lab có người ra vào liên tục (sinh viên tốt nghiệp) → per-user là nightmare

---

## 7. Rào Cản Adoption — Và Cách Xử Lý

### 7.1 "AI có đáng tin không?"
**Rào cản:** Researcher sợ kết quả AI sai, ảnh hưởng paper.
**Xử lý:**
- Communicate 7-layer anti-hallucination rõ ràng
- Mọi kết quả đều có citation chain — không phải black box
- "AI suggests, you verify" — không claim AI thay thế researcher
- Show confidence score cho mỗi analysis

### 7.2 "Data của tôi có bị lấy không?"
**Rào cản:** Lo ngại privacy, data sovereignty, IP protection.
**Xử lý:**
- Privacy Policy rõ ràng: "Data không train model"
- Data residency tùy chọn (VN server)
- Mention compliance Nghị định 24/2026
- Export data anytime — không lock-in

### 7.3 "Tốn thêm một app để học"
**Rào cản:** Workflow hiện tại đã có Excel, dù kém.
**Xử lý:**
- Import từ Excel trong 1 click — không yêu cầu rebuild từ đầu
- Onboarding < 10 phút — đủ nhanh để researcher thử ngay sau seminar
- Mobile-first cho entry — không cần ngồi vào máy tính

### 7.4 "Không có budget"
**Rào cản:** Budget lab thường qua grant — approval cần thời gian.
**Xử lý:**
- Free tier đủ mạnh để thật sự dùng được (không chỉ là teaser)
- Pro invoice có thể xuất dưới dạng "software license" để reimbursement từ grant
- Institutional pricing cho department — một PO cover nhiều lab

### 7.5 "Sếp/PI không approve"
**Rào cản:** Nghiên cứu sinh cần PI sign-off cho tool mới.
**Xử lý:**
- "Share with PI" feature — gửi summary report đẹp cho PI xem
- ROI calculator: "Lab tiết kiệm X giờ/tháng"
- Compliance story: "Labrya giúp lab đáp ứng Nghị định 24/2026"

---

## 8. Go-to-Market Psychology — Thứ Tự Acquisition

### Phase 1: Seeding (trước launch)
Target: 5–10 lab "champion" biết bạn cá nhân

```
Strategy: Không bán → tặng → lấy feedback → iterate
Psychology: Reciprocity (Cialdini) — người nhận favor có xu hướng give back
Result: Testimonial thật + case study + word-of-mouth seeds
```

### Phase 2: Social proof expansion (tháng 1–3)
Target: Lan rộng trong cộng đồng materials science VN

```
Channel: Conference poster, seminar demo, Facebook group VN Materials Science
Message: "X lab từ BKU/HUST đang dùng Labrya"
Psychology: Social proof + authority (institution names)
```

### Phase 3: Referral loop (tháng 3–6)
Target: Organic growth qua researcher network

```
Mechanic: "Invite 3 đồng nghiệp → thêm 1 tháng Pro"
Psychology: Reciprocity + sunk cost (họ invite người quen, không muốn sản phẩm xấu)
```

### Phase 4: Institutional deal (tháng 6–12)
Target: Department/Faculty level deal

```
Buyer: Dean of Science, Director of Research Institute
Message: Compliance, audit trail, team productivity
Psychology: Authority + loss aversion ("Lab khác trong department đã dùng")
```

---

## 9. Metrics Cần Track Theo Tâm Lý

| Metric | Target | Tại sao |
|---|---|---|
| **Time-to-first-value** | < 10 phút | Quyết định Day-1 retention |
| **Day-1 retention** | > 40% | Dự báo long-term retention |
| **Day-7 retention** | > 25% | Habit formation window |
| **Feature depth (tháng 1)** | ≥ 3 features | Predict 12-month retention |
| **Activation rate** | > 60% | % signup → first "aha moment" |
| **Referral rate** | > 15% | Word-of-mouth strength |
| **Upgrade trigger** | AI query limit hit | Không phải timer |
| **Churn reason (exit survey)** | Collect 100% | Phân biệt product vs psychology churn |

---

## 10. Summary — 10 Rules Từ Tâm Lý Học Cho Labrya

1. **Trust first, feature second** — Researcher VN adopt theo trust hierarchy, không theo feature list
2. **Social proof beats ads** — 1 PI recommend = 1,000 impressions
3. **Time-to-value < 10 phút** — Nếu không thấy value trong phiên đầu, user không quay lại
4. **Free tier thật sự usable** — Không phải teaser, phải đủ để researcher thật sự dùng hàng ngày
5. **Loss aversion > gain framing** — "Đừng lãng phí 4 giờ/ngày" mạnh hơn "tiết kiệm 4 giờ/ngày"
6. **Per-lab flat pricing** — Academic researcher ghét per-user billing
7. **Open loop onboarding** — Progress checklist tạo Zeigarnik effect, user muốn return
8. **Behavioral triggers đúng lúc** — Notification "Spectrum analyzed" > weekly newsletter
9. **Data transparency bắt buộc** — Nói rõ data policy trước khi user hỏi
10. **Champion → PI → Institution** — Flow acquisition: Gen Z thử → PI approve → Department deal

---

*Report này là living document — update sau khi có data từ 100 users đầu tiên.*  
*Recommended: Run usability test với 5 researcher trước SaaS launch để validate Time-to-Value.*
