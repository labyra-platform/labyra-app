/**
 * remark plugin: unwrap math nodes lẫn chữ Việt có dấu.
 * @phase R205
 *
 * AI đôi khi sinh markdown nhét diễn giải tiếng Việt vào math mode, vd
 * "$à góc nhiễu xạ$". remarkMath -> inlineMath node -> rehypeKatex cố render
 * -> KaTeX_Main thiếu glyph ('ử','ớ'...) -> warning + ký tự vỡ.
 *
 * Plugin này duyệt inlineMath/math node; nếu value chứa ký tự Latin có dấu
 * (khoảng tiếng Việt + tổ hợp dấu), đổi node về 'text' để hiển thị bằng font UI.
 * Math thuần ($\theta$, $d=\lambda/2\sin\theta$) KHÔNG bị đụng.
 *
 * Đặt SAU remarkMath trong mảng remarkPlugins.
 */
import { visit } from 'unist-util-visit';
import type { Plugin } from 'unified';
import type { Root } from 'mdast';

// Ký tự có dấu tiếng Việt: Latin-1 Supplement (À-ÿ) + Latin Extended-A/B
// + tổ hợp dấu thanh (U+0300–U+036F) + các ký tự VN riêng (ơ ư đ...).
// LaTeX command/biến hợp lệ chỉ dùng ASCII + ký hiệu toán, nên dấu = chắc chắn là prose.
const VI_DIACRITIC = /[\u00C0-\u024F\u1E00-\u1EFF]/u;

interface MathNode {
  type: 'inlineMath' | 'math';
  value: string;
}

export const remarkUnwrapViMath: Plugin<[], Root> = () => {
  return (tree: Root) => {
    visit(tree, ['inlineMath', 'math'], (node: unknown) => {
      const m = node as MathNode;
      if (typeof m.value === 'string' && VI_DIACRITIC.test(m.value)) {
        // Mutate node in place: math -> text. Giữ delimiter để rõ là đoạn gốc.
        const isDisplay = m.type === 'math';
        const wrapped = isDisplay ? `$$${m.value}$$` : `$${m.value}$`;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (node as any).type = 'text';
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (node as any).value = wrapped;
      }
    });
  };
};
