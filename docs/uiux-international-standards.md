# Tiêu Chuẩn Quốc Tế về Thiết Kế UI/UX

> **Phiên bản:** 1.0 — May 2026  
> **Phạm vi:** Web, Mobile, Desktop, SaaS, Enterprise  
> **Áp dụng cho:** Labyra và các sản phẩm digital chuyên nghiệp

---

## Mục Lục

1. [ISO Standards](#1-iso-standards)
2. [W3C / WCAG — Web Accessibility](#2-w3c--wcag--web-accessibility)
3. [Nielsen's 10 Heuristics](#3-nielsens-10-heuristics)
4. [Gestalt Principles](#4-gestalt-principles)
5. [Typography Standards](#5-typography-standards)
6. [Color Standards](#6-color-standards)
7. [Layout & Spacing](#7-layout--spacing)
8. [Motion & Animation](#8-motion--animation)
9. [Mobile Standards](#9-mobile-standards)
10. [Data Visualization Standards](#10-data-visualization-standards)
11. [Form Design Standards](#11-form-design-standards)
12. [Design System Standards](#12-design-system-standards)
13. [Performance Standards](#13-performance-standards)
14. [Áp dụng cho Labyra](#14-áp-dụng-cho-labyra)

---

## 1. ISO Standards

### ISO 9241 — Ergonomics of Human-System Interaction

Bộ tiêu chuẩn quan trọng nhất cho UI/UX, gồm nhiều phần:

#### ISO 9241-11: Usability
Định nghĩa **usability** theo 3 tiêu chí:

| Tiêu chí | Định nghĩa | Đo bằng |
|---|---|---|
| **Effectiveness** | User đạt được mục tiêu chính xác và đầy đủ | Task completion rate |
| **Efficiency** | Tài nguyên (thời gian, công sức) để đạt mục tiêu | Time on task, clicks |
| **Satisfaction** | Mức độ thoải mái khi dùng | SUS score, NPS |

**SUS Score (System Usability Scale):**
- < 51: Unacceptable
- 51–67: Poor
- 68: OK (average)
- 68–80: Good
- > 80: Excellent
- > 90: Best imaginable

#### ISO 9241-110: Dialogue Principles
7 nguyên tắc thiết kế interaction:

1. **Suitability for the task** — Hỗ trợ user hoàn thành task, không bắt user adapt theo hệ thống
2. **Self-descriptiveness** — Mọi dialog đều tự giải thích được không cần tài liệu
3. **Conformity with user expectations** — Nhất quán với mental model của user
4. **Suitability for learning** — Hỗ trợ user học cách dùng hệ thống
5. **Controllability** — User kiểm soát được pace và sequence
6. **Error tolerance** — Kết quả đúng mặc dù có input không hoàn hảo
7. **Suitability for individualization** — Có thể customize theo nhu cầu cá nhân

#### ISO 9241-210: Human-Centred Design
Process chuẩn cho HCD (Human-Centred Design):

```
Understand context of use
        ↓
Specify user requirements
        ↓
Produce design solutions
        ↓
Evaluate against requirements
        ↑_______________________↑ (iterate)
```

**4 hoạt động bắt buộc:**
- Understand and specify context of use
- Specify user requirements
- Produce design solutions
- Evaluate designs

#### ISO 9241-171: Accessibility for Software
Tiêu chuẩn accessibility cho software — đặc biệt quan trọng cho enterprise.

---

### ISO 13407 (superseded by ISO 9241-210)
Tiêu chuẩn gốc về Human-Centred Design Process — nền tảng cho mọi UX process hiện đại.

---

## 2. W3C / WCAG — Web Accessibility

### WCAG 2.2 (Web Content Accessibility Guidelines)

**Hiện tại là chuẩn bắt buộc** tại EU (European Accessibility Act 2025), Mỹ (ADA, Section 508), và nhiều quốc gia khác.

#### 4 Nguyên tắc POUR

| Nguyên tắc | Ý nghĩa |
|---|---|
| **Perceivable** | User có thể nhận biết content bằng ít nhất 1 giác quan |
| **Operable** | User có thể operate interface (keyboard, switch, etc.) |
| **Understandable** | Content và UI phải dễ hiểu |
| **Robust** | Content đọc được bởi assistive technology hiện tại và tương lai |

#### Conformance Levels

| Level | Áp dụng khi | Tiêu chí |
|---|---|---|
| **A** | Minimum | 30 criteria — lỗi critical nhất |
| **AA** | Recommended / Legal requirement | 50 criteria — tiêu chuẩn thực tế |
| **AAA** | Best practice | 78 criteria — không required cho toàn bộ site |

**→ Target: WCAG 2.2 Level AA** cho mọi sản phẩm commercial.

#### Key WCAG 2.2 Criteria (quan trọng nhất)

**Color Contrast (1.4.3 — Level AA):**
- Normal text: tỉ lệ tương phản ≥ **4.5:1**
- Large text (18pt+ hoặc 14pt bold): ≥ **3:1**
- UI components, graphics: ≥ **3:1**

**Keyboard Navigation (2.1.1 — Level A):**
- Mọi functionality phải dùng được bằng keyboard
- Không có "keyboard trap"

**Focus Visible (2.4.7 — Level AA):**
- Focus indicator phải nhìn thấy được
- WCAG 2.2 thêm: focus indicator phải có area ≥ perimeter × 2px và contrast ≥ 3:1

**Target Size (2.5.8 — Level AA, mới trong WCAG 2.2):**
- Touch target minimum: **24×24 CSS pixels**
- Recommended: **44×44px** (Apple HIG) hoặc **48×48dp** (Material Design)

**Text Spacing (1.4.12 — Level AA):**
- Line height ≥ 1.5× font size
- Letter spacing ≥ 0.12× font size
- Word spacing ≥ 0.16× font size
- Paragraph spacing ≥ 2× font size

**Error Identification (3.3.1 — Level A):**
- Error phải được identify bằng text (không chỉ màu đỏ)
- Mô tả rõ lỗi là gì và cách fix

#### Tools kiểm tra WCAG
- **axe DevTools** — browser extension, tự động
- **WAVE** — web.aimgroup.com
- **Colour Contrast Analyser** — manual check
- **Lighthouse** — Google Chrome built-in
- **NVDA / VoiceOver** — screen reader testing thủ công

---

## 3. Nielsen's 10 Heuristics

Được publish bởi Jakob Nielsen (Nielsen Norman Group) — tiêu chuẩn heuristic evaluation phổ biến nhất thế giới.

### 1. Visibility of System Status
> Hệ thống luôn thông báo cho user biết chuyện gì đang xảy ra, trong thời gian phù hợp.

- Loading indicators cho mọi async action
- Progress bars cho long-running tasks
- Confirmation sau khi action thành công
- **Labyra:** AI query đang ở tầng nào (Flash/Sonnet/Opus) → hiển thị

### 2. Match Between System and Real World
> Dùng ngôn ngữ, khái niệm quen thuộc với user, không phải system-oriented jargon.

- Hóa chất → "Chemicals", không phải "Chemical Entities"
- "Book equipment" không phải "Create booking record"
- Dùng metaphor quen thuộc (folder, trash, calendar)

### 3. User Control and Freedom
> User cần "emergency exit" khi chọn nhầm.

- Undo/Redo cho mọi destructive action
- Cancel button trên mọi dialog
- Breadcrumb navigation
- "Back" không bao giờ mất data

### 4. Consistency and Standards
> User không cần đoán các từ/action/situations khác nhau có nghĩa giống nhau không.

- Cùng action → cùng icon, cùng label, cùng vị trí
- Follow platform conventions (Enter = submit, Escape = cancel)
- Internal consistency: màu sắc, spacing, component behavior nhất quán

### 5. Error Prevention
> Design tốt ngăn lỗi xảy ra, tốt hơn là xử lý lỗi sau.

- Confirmation dialog trước destructive actions ("Xóa experiment này?")
- Disabled state cho actions không hợp lệ (thay vì show error sau khi submit)
- Input constraints (date picker thay vì free text)
- Autocomplete để giảm typo

### 6. Recognition over Recall
> Minimize memory load — user nhận ra options thay vì phải nhớ.

- Visible navigation (không cần nhớ URL)
- Recent items, history
- Tooltips giải thích icon
- Search suggestions
- Context-aware help

### 7. Flexibility and Efficiency of Use
> Accelerators cho expert users, không ảnh hưởng đến novice users.

- Keyboard shortcuts (Cmd+K cho command palette)
- Bulk actions
- Saved filters / views
- API access cho power users

### 8. Aesthetic and Minimalist Design
> Không chứa thông tin không liên quan — mỗi extra unit cạnh tranh attention với info quan trọng.

- Progressive disclosure (show detail on demand)
- Không có decorative elements không mang ý nghĩa
- White space là design element, không phải wasted space
- Maximum 5±2 items per navigation level (Miller's Law)

### 9. Help Users Recognize, Diagnose, and Recover from Errors
> Error messages phải: plain language, chính xác mô tả vấn đề, suggest solution.

❌ "Error 500"  
✅ "Không thể lưu experiment. Kiểm tra kết nối mạng và thử lại."

❌ "Invalid input"  
✅ "Tên hóa chất không được để trống. Nhập ít nhất 2 ký tự."

### 10. Help and Documentation
> Dù tốt nhất không cần docs, nhưng docs phải dễ search và focused on user's task.

- Contextual help (? icon gần field phức tạp)
- Search trong docs
- Step-by-step tutorials cho complex workflows
- Video walkthrough cho onboarding

---

## 4. Gestalt Principles

Nguyên tắc tâm lý học thị giác — nền tảng của visual design.

### Proximity
Các elements gần nhau → được perceived là cùng nhóm.

```
[ Label ]  [ Input ]     [ Label ]  [ Input ]
[ Label ]  [ Input ]  vs
                         [ Label ]  [ Input ]
                         [ Label ]  [ Input ]
```
→ Grouping form fields bằng spacing, không cần border.

### Similarity
Elements trông giống nhau → được perceived là có cùng function.

- Tất cả buttons primary cùng màu, shape
- Tất cả links cùng color
- Tất cả destructive actions cùng màu đỏ

### Closure
Mind tự động "đóng" shapes không hoàn chỉnh.

- Progress circles không cần đầy đủ để hiểu
- Skeleton screens hiệu quả vì brain tự fill in

### Continuity
Eye follows paths, lines, curves.

- Horizontal scrolling carousel
- Timeline layout
- Step indicator (1 → 2 → 3)

### Figure/Ground
Foreground vs background separation.

- Modal overlay (background darkens)
- Dropdown trên background
- Tooltip z-index

### Common Fate
Elements moving together → perceived as group.

- Accordion open/close
- List items dragging together
- Chart data points animating in sync

---

## 5. Typography Standards

### Type Scale — Modular Scale

Dùng tỉ lệ nhất quán (Major Third = 1.25, Perfect Fourth = 1.333):

| Token | Size | Usage |
|---|---|---|
| `text-xs` | 12px | Labels, captions, metadata |
| `text-sm` | 14px | Secondary text, table cells |
| `text-base` | 16px | Body text (**minimum cho reading**) |
| `text-lg` | 18px | Lead paragraph |
| `text-xl` | 20px | Section heading (small) |
| `text-2xl` | 24px | Section heading |
| `text-3xl` | 30px | Page heading |
| `text-4xl` | 36px | Hero heading |
| `text-5xl` | 48px | Display |

### Line Height (Leading)

| Context | Line Height |
|---|---|
| Headings | 1.1–1.2 |
| Body text | 1.5–1.6 (WCAG minimum 1.5) |
| Code/monospace | 1.6–1.8 |
| UI labels | 1.0–1.2 |

### Line Length (Measure)

- Optimal reading: **50–75 characters** per line (45–85 acceptable)
- Too long (> 85 chars): eye loses track when returning to next line
- Too short (< 45 chars): choppy reading rhythm
- Achieve với `max-width: 65ch` trong CSS

### Font Weight Pairing

| Use case | Weight |
|---|---|
| Display / Hero | 700–800 |
| Heading | 600–700 |
| Subheading | 500–600 |
| Body | 400 |
| Label / Caption | 500 (medium, not bold) |
| Placeholder | 400, reduced opacity |

### International Typography

- **CJK (Chinese/Japanese/Korean):** line-height ≥ 1.8, letter-spacing = 0
- **Arabic/Hebrew:** RTL support, `dir="rtl"`, logical properties
- **Vietnamese:** đảm bảo font support diacritics đầy đủ (ả, ẽ, ồ, ụ...)
  - Fonts tốt: Be Vietnam Pro, Noto Serif, Source Sans 3

---

## 6. Color Standards

### Color Contrast Requirements (WCAG 2.2)

| Context | Minimum | Recommended |
|---|---|---|
| Normal text (< 18pt) | 4.5:1 | 7:1 |
| Large text (≥ 18pt hoặc 14pt bold) | 3:1 | 4.5:1 |
| UI components (border, icon) | 3:1 | 4.5:1 |
| Decorative / disabled | Không yêu cầu | — |

**Tools check contrast:**
- `whocanuse.com` — context-aware
- `contrast-ratio.com` — quick check
- `coolors.co/contrast-checker`

### Color Blindness Considerations

- **8% nam giới** bị color blindness (chủ yếu red-green)
- **Không bao giờ** dùng màu là signal DUY NHẤT (luôn kết hợp với icon/text/pattern)
- Test với: Coblis, Sim Daltonism, Figma A11y plugin

#### Safe Color Combinations

✅ Blue + Orange (tốt nhất)  
✅ Blue + Yellow  
✅ Black + Yellow  
✅ Purple + Yellow  
❌ Red + Green (tệ nhất — 99% color blind cases)  
❌ Red + Brown  

### Semantic Colors (bắt buộc nhất quán)

| Semantic | Color | Hex gợi ý | Usage |
|---|---|---|---|
| Primary | Brand color | — | CTAs, links, focus |
| Success | Green | #10B981 | Completed, verified |
| Warning | Amber | #F59E0B | Caution, pending |
| Error | Red | #EF4444 | Errors, destructive |
| Info | Blue | #3B82F6 | Neutral information |
| Neutral | Gray | #6B7280 | Disabled, secondary |

### Dark Mode Standards

- Không phải invert màu — redesign hoàn toàn
- Background không dùng pure black (#000) → dùng #0a0f1e hoặc #111827
- Elevation = lighter shade (không phải shadow) trong dark mode
- Text: không dùng pure white (#FFF) → dùng #F1F5F9 hoặc #E2E8F0
- Reduce saturation của màu trong dark mode (chói mắt)

---

## 7. Layout & Spacing

### 8-Point Grid System

**Chuẩn phổ biến nhất** (dùng bởi Google Material, Apple HIG, Tailwind):

- Tất cả spacing là bội số của 8: 8, 16, 24, 32, 40, 48, 64, 80, 96...
- Exceptions: 4px cho internal component padding (icon gap, etc.)

```
Spacing scale:
  4px  — micro (icon gap)
  8px  — xs (internal padding tight)
  12px — sm (internal padding)
  16px — md (component spacing)
  24px — lg (section gap small)
  32px — xl (section gap)
  48px — 2xl (large section gap)
  64px — 3xl (page-level spacing)
```

### Breakpoints (Responsive Design)

| Name | Width | Device |
|---|---|---|
| `xs` | < 480px | Small phones |
| `sm` | 480–768px | Phones, large phones |
| `md` | 768–1024px | Tablets |
| `lg` | 1024–1280px | Laptops |
| `xl` | 1280–1536px | Desktops |
| `2xl` | > 1536px | Large monitors |

**Tailwind defaults:** sm=640, md=768, lg=1024, xl=1280, 2xl=1536

### Grid Systems

**12-column grid** — tiêu chuẩn web:
- 12 columns chia hết cho 1, 2, 3, 4, 6, 12 → linh hoạt
- Gutter: 16–24px (mobile), 24–32px (desktop)
- Margin: 16px (mobile), 24–80px (desktop)

**4-column grid** — mobile:
- Simpler, phù hợp narrow viewport

### Z-Index Scale (chuẩn)

| Layer | Z-index | Usage |
|---|---|---|
| Base | 0 | Normal content |
| Raised | 10 | Cards, elevated elements |
| Dropdown | 100 | Select, autocomplete |
| Sticky | 200 | Sticky header/sidebar |
| Overlay | 300 | Drawer, sidebar overlay |
| Modal | 400 | Dialog, modal |
| Toast | 500 | Notifications, toasts |
| Tooltip | 600 | Tooltips |
| Max | 9999 | Critical (loading screen) |

---

## 8. Motion & Animation Standards

### Duration Guidelines

| Interaction | Duration | Easing |
|---|---|---|
| Micro (button press, toggle) | 100–150ms | ease-out |
| Simple transition (fade, slide) | 150–250ms | ease-in-out |
| Complex transition (modal, page) | 250–400ms | ease-in-out |
| Decorative / loading | 500ms–2s | ease-in-out, linear |

**Rule:** > 400ms cảm giác chậm chạp, < 100ms không nhận ra.

### Easing Standards

```css
/* Standard easings */
ease-in:     cubic-bezier(0.4, 0, 1, 1)    /* Accelerate — exit animations */
ease-out:    cubic-bezier(0, 0, 0.2, 1)    /* Decelerate — enter animations */
ease-in-out: cubic-bezier(0.4, 0, 0.2, 1)  /* Standard — most transitions */
spring:      cubic-bezier(0.34, 1.56, 0.64, 1) /* Overshoot — playful */
```

### Reduced Motion (WCAG 2.3.3 — Level AAA)

**Bắt buộc respect** `prefers-reduced-motion`:

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

### Animation Principles (Disney 12 Principles adapted)

1. **Squash and Stretch** — objects feel physical weight
2. **Anticipation** — prepare user for action (button press feedback)
3. **Follow Through** — motion continues briefly after action ends
4. **Slow In/Out** — easing, not linear
5. **Arc** — natural movement follows arcs
6. **Secondary Action** — supporting animations reinforce main action

---

## 9. Mobile Standards

### Apple Human Interface Guidelines (HIG)

**Touch Target:**
- Minimum: 44×44pt
- Recommended: 48×48pt với adequate spacing

**Safe Areas (iOS):**
- Respect Dynamic Island, notch, home indicator
- CSS: `env(safe-area-inset-bottom)`, `env(safe-area-inset-top)`

**Navigation Patterns:**
- Tab bar: 3–5 items, always visible
- Navigation stack: back gesture (swipe right)
- Modal: full-screen hoặc sheet

### Google Material Design 3 (M3)

**Touch Target:**
- Minimum: 48×48dp

**Elevation:**
- M3 dùng color tint thay vì shadow cho dark mode
- 6 elevation levels (0dp → 5dp)

**Dynamic Color (M3):**
- Color scheme tự động từ wallpaper/brand color
- `colorPrimary`, `colorSecondary`, `colorTertiary`, `colorError`

### Thumb Zone (Mobile UX)

Vùng tay cái dễ chạm nhất (right-handed, one-handed use):

```
┌─────────────┐
│  ✗  Hard   │  ← Top left: hardest to reach
│             │
│  △ Stretch │  ← Upper area: stretch
│             │
│  ✓  Easy  │  ← Bottom center/right: easiest
└─────────────┘
```

→ CTA buttons, navigation ở bottom.  
→ Destructive actions ở top (hard to accidentally tap).

---

## 10. Data Visualization Standards

Đặc biệt quan trọng cho Labyra — spectrum plots, EIS, CV curves.

### Chart Selection Guide

| Data type | Chart |
|---|---|
| Trend over time | Line chart |
| Part of whole | Pie (< 5 segments), Stacked bar |
| Comparison | Bar chart (horizontal cho nhiều categories) |
| Correlation | Scatter plot |
| Distribution | Histogram, Box plot |
| Spectrum data (XRD, Raman) | Line chart với peak annotation |
| Nyquist plot (EIS) | Scatter + fitted curve |
| Cyclic voltammetry | Line chart (x=Voltage, y=Current) |

### Data Visualization Principles (Edward Tufte)

1. **Data-ink ratio** — maximize data, minimize non-data ink
   - Remove chart borders
   - Remove gridlines (hoặc make very light)
   - Remove legend khi có direct labels
   
2. **No chartjunk** — tránh 3D charts, gradients, shadows trên data
   
3. **Small multiples** — nhiều chart nhỏ tốt hơn 1 chart phức tạp

4. **Lie factor** — visual representation phải proportional với data

### Color in Data Visualization

- **Sequential data:** single hue, varying lightness (blues: light→dark)
- **Diverging data:** two hues from center (blue-white-red)
- **Categorical data:** distinct hues, maximum 7–8 categories
- **Color blind safe palettes:** ColorBrewer (colorbrewer2.org)

### Scientific Chart Standards

- **Axis labels** với units: "Wavenumber (cm⁻¹)", "Intensity (a.u.)"
- **Error bars** cho measurement uncertainty
- **Figure caption** đầy đủ (không cần đọc text để hiểu chart)
- **Resolution** xuất file: ≥ 300 DPI cho publication

---

## 11. Form Design Standards

### Input Fields

**Anatomy của một input field tốt:**
```
Label (above, not placeholder-as-label)
[_____________________________________]
Helper text hoặc error message
```

**Tiêu chuẩn:**
- Label luôn visible (không dùng placeholder thay label)
- Placeholder: example value, không phải label
- Error message: inline, dưới field, màu đỏ + icon
- Success state: checkmark khi valid
- Character count cho limited inputs

### Form Layout

- **Single column** tốt hơn multi-column (scan dễ hơn)
- Multi-column chỉ dùng cho related fields (First Name / Last Name)
- Nhóm related fields với visual grouping (spacing, border, heading)
- Primary CTA: 1 per form, bottom right (Western reading pattern)

### Validation Standards

| Timing | Khi nào dùng |
|---|---|
| **On submit** | Simple forms, không interrupt flow |
| **On blur** | Complex forms, validate khi rời field |
| **On input (realtime)** | Password strength, character count |
| **Never on keypress** | Gây frustration, quá early |

### Input Types (HTML5 — quan trọng cho mobile)

```html
<input type="email">    → email keyboard, built-in validation
<input type="tel">      → numeric keyboard
<input type="number">   → numeric keyboard + spinners
<input type="date">     → native date picker
<input type="search">   → search keyboard + clear button
<input type="url">      → URL keyboard
```

---

## 12. Design System Standards

### Tokens (Design Tokens)

Cấu trúc token 3 tầng:

```
Primitive tokens → Semantic tokens → Component tokens

#2563EB          → color-primary   → button-bg-color
#F1F5F9          → color-surface   → card-bg-color
16px             → spacing-md      → input-padding
```

**Format chuẩn:** W3C Design Token Community Group format:
```json
{
  "color": {
    "primary": { "$value": "#2563EB", "$type": "color" },
    "surface": { "$value": "#F1F5F9", "$type": "color" }
  }
}
```

### Component Documentation Standards

Mỗi component cần document:
- **Purpose:** dùng khi nào
- **Anatomy:** tên từng phần
- **Variants:** size, state, type
- **States:** default, hover, focus, active, disabled, error, loading
- **Do/Don't:** examples
- **Accessibility:** ARIA roles, keyboard behavior
- **Code:** implementation example

### Atomic Design Methodology (Brad Frost)

```
Atoms → Molecules → Organisms → Templates → Pages

Button    Form field   Login form   Auth layout   Login page
Icon      Label        Nav bar      Dashboard     Dashboard
Color     Input        Data table   layout        page
```

---

## 13. Performance Standards

### Core Web Vitals (Google — 2024)

| Metric | Good | Needs Improvement | Poor |
|---|---|---|---|
| **LCP** (Largest Contentful Paint) | ≤ 2.5s | 2.5–4.0s | > 4.0s |
| **INP** (Interaction to Next Paint) | ≤ 200ms | 200–500ms | > 500ms |
| **CLS** (Cumulative Layout Shift) | ≤ 0.1 | 0.1–0.25 | > 0.25 |

**LCP** thay thế FID từ March 2024.

### Perceived Performance Techniques

| Technique | Effect |
|---|---|
| Skeleton screens | Người dùng thấy layout trước khi data load |
| Optimistic UI | Update UI ngay trước khi server confirm |
| Progressive loading | Load critical content trước |
| Lazy loading | Load images/components khi cần |
| Prefetching | Load trang tiếp theo khi user likely navigate |

### Image Standards

- **Format:** WebP (primary), AVIF (next-gen), PNG/JPG (fallback)
- **Lazy loading:** `loading="lazy"` cho below-fold images
- **Responsive:** `srcset` + `sizes` cho different viewpoints
- **Alt text:** mô tả nội dung, không phải "image of..."

---

## 14. Áp Dụng Cho Labyra

### Priority Matrix

| Standard | Priority cho Labyra | Lý do |
|---|---|---|
| WCAG 2.2 AA | 🔴 Critical | Enterprise requirement, trường đại học VN |
| Nielsen Heuristics | 🔴 Critical | Core UX quality |
| ISO 9241-11 (Usability) | 🔴 Critical | SaaS quality metric |
| 8-Point Grid | 🔴 Critical | Design consistency |
| Color Contrast 4.5:1 | 🔴 Critical | Accessibility gate |
| Data Viz Standards | 🔴 Critical | Spectrum plots là core feature |
| Form Standards | 🟡 High | Experiment data entry |
| Motion Standards | 🟡 High | Lab dashboard UX |
| Reduced Motion | 🟡 High | Researcher dùng nhiều giờ |
| Touch Targets 44px | 🟢 Medium | Mobile/tablet trong lab |
| Design Tokens | 🟢 Medium | Khi build design system |

### Specific Rules cho Lab Management UI

**Data display:**
- Chemical formulas: subscript đúng (H₂O không phải H2O)
- Units: dùng ký hiệu chuẩn (μm, nm, eV, mA/cm²)
- Scientific notation: 1.23 × 10⁻⁶ không phải 1.23e-6 (trừ code context)

**Spectrum plots:**
- X-axis: physical quantity (Wavenumber, 2θ, Wavelength)
- Y-axis: measured quantity với unit
- Peak annotation: value + assignment
- Zoom/pan: bắt buộc cho spectrum exploration
- Export: PNG + CSV data

**Error handling trong AI context:**
- AI response: luôn show confidence level hoặc citation
- Nếu AI không chắc: nói rõ ("Based on similar samples...")
- Không bao giờ show raw error từ AI model ra UI

**Vietnamese-specific:**
- Font support diacritics đầy đủ: Be Vietnam Pro, Noto Sans Vietnamese
- Số: dùng dấu phẩy thập phân tùy context (VN: dấu phẩy, scientific: dấu chấm)
- Date format: DD/MM/YYYY (VN) hoặc ISO 8601 (YYYY-MM-DD) cho scientific data

---

## References & Resources

### Standards Bodies
- **W3C:** w3.org/WAI (WCAG), w3.org/TR (Web standards)
- **ISO:** iso.org (9241 series)
- **Apple HIG:** developer.apple.com/design
- **Material Design 3:** m3.material.io
- **ARIA Authoring Practices:** w3.org/WAI/ARIA/apg

### Tools
- **Figma** — design, prototyping
- **Storybook** — component documentation
- **axe DevTools** — accessibility testing
- **Lighthouse** — performance + accessibility audit
- **ColorBrewer** — color palettes for data viz
- **Contrast Checker** — whocanuse.com

### Books
- *"Don't Make Me Think"* — Steve Krug (usability)
- *"The Design of Everyday Things"* — Don Norman (UX fundamentals)
- *"Envisioning Information"* — Edward Tufte (data visualization)
- *"Refactoring UI"* — Adam Wathan & Steve Schoger (practical UI)
- *"Atomic Design"* — Brad Frost (design systems)

---

*Document này là living document. Update khi có WCAG 3.0 (draft), Material Design updates, hoặc Apple HIG major releases.*
