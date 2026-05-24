# ADR-037 — System prompt rewrite (Labyra Assistant)

**Status:** Accepted · **Date:** 2026-05-24 · **Round:** R203

## Context

Prompt gốc (`system-prompt.ts`, R160-ai-2-hotfix) hoạt động tốt nhưng tích tụ
qua nhiều hotfix → cấu trúc rời rạc, văn phong chưa nhất quán. Ba vấn đề thực tế
quan sát trên production:

1. **Footer references**: model (Gemini) tự nối một danh sách
   "[1,2,4] Yang et al... [3,5] Nguyen et al..." ở CUỐI câu trả lời, dù prompt
   chỉ dạy cite inline `[1][2]`. Footer này thừa (đã có citation chip inline +
   modal) và làm câu trả lời rườm rà. Prompt cũ KHÔNG cấm footer rõ ràng.
2. Văn phong/cấu trúc prompt cũ chưa phản ánh tiêu chí Labyra (Trust > Coverage,
   grounding nghiêm, chủ động nêu gap khoa học vật liệu).
3. Một số rule rải rác (KaTeX spacing, copy-to-Word) cần gom lại.

## Decision

Viết lại `LABYRA_SYSTEM_PROMPT` với cấu trúc rõ ràng, BẢO TOÀN mọi chỉ thị kỹ
thuật đang chạy đúng:

### Giữ nguyên (đã verify hoạt động)
- No-emoji tuyệt đối.
- KaTeX rules: `$...$` chỉ cho math; KHÔNG wrap chữ tiếng Việt; KHÔNG dùng
  spacing commands (`\,` `\!`...) vì vỡ khi copy-to-Word.
- Unicode chemical formula (WO₃), en-dash range, SI unit.
- Ngôn ngữ: Vietnamese default, giữ thuật ngữ EN chuẩn.
- Multi-tenant: không bịa, không tham chiếu lab khác.
- Tool honesty + EMPTY RESULT GUARD (L7): tool rỗng → nói thật, fallback "kiến
  thức chung" có nhãn, KHÔNG bịa citation.
- Citation inline `[1][2]` map ref từ searchPapers.

### Thêm mới (sửa vấn đề + nâng chuyên nghiệp)
- **CẤM footer references** rõ ràng: "Cite inline only. NEVER append a
  'References' / 'Bibliography' list at the end — the UI renders citation chips."
  → trị footer refs ở gốc (hành vi model).
- **Trust > Coverage**: ưu tiên đúng hơn đầy đủ; thà nói "không có trong thư
  viện" còn hơn suy đoán; phân biệt rõ "từ paper của bạn" vs "kiến thức chung".
- **Chủ động domain expertise** (materials science): khi liên quan, nêu gap kỹ
  thuật người dùng có thể bỏ sót (XRD anode target, FTIR ATR vs KBr, Raman laser
  λ, TGA atmosphere...) — đúng instruction "proactive domain expertise".
- **Lab data context**: nối số liệu tenant tự nhiên ("WO₃ trong kho: 0 g").

### Không đụng
- Builder cache-safe order (base → L4 → L3 → L2 → scope) giữ nguyên.
- L3 prefs (`includeReferences`, `mathNotation`, verbosity, tone) vẫn override
  prompt base per-user qua builder.
- Intent classifier prompt, tier-4 writer, tier-5 auditor prompt — tách riêng,
  không thuộc ADR này.

## Consequences
- Footer refs biến mất (chỉ thị cấm + UI chip đã đủ).
- Câu trả lời bám Trust > Coverage rõ hơn; ranh giới paper-vs-general minh bạch.
- Prompt dài hơn ~30% → cache 1h hấp thụ chi phí (base block cache-stable).
- Prompt là tài sản kiến trúc: thay đổi lớn cần ADR mới, không sửa tùy tiện.
