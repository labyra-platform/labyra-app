/**
 * Domain glossary for translation (ADR-045, Tier 2).
 *
 * Preferred Vietnamese renderings for materials-science / electrochemistry /
 * spectroscopy terms, injected into the translate prompt so terminology is
 * consistent across a paper (and across papers). Kept to high-frequency,
 * low-ambiguity terms; the prompt asks the model to use them "unless context
 * clearly means otherwise", so genuinely polysemous words (e.g. substrate) stay
 * safe. Only used when translating into Vietnamese.
 *
 * Extend conservatively — a wrong forced term is worse than none.
 */

export interface GlossaryEntry {
  en: string;
  vi: string;
}

export const GLOSSARY_VI: GlossaryEntry[] = [
  // Electrochemistry
  { en: 'overpotential', vi: 'quá thế' },
  { en: 'onset potential', vi: 'thế khởi đầu' },
  { en: 'Tafel slope', vi: 'độ dốc Tafel' },
  { en: 'linear sweep voltammetry', vi: 'quét thế tuyến tính (LSV)' },
  { en: 'cyclic voltammetry', vi: 'quét thế vòng (CV)' },
  { en: 'electrocatalyst', vi: 'chất xúc tác điện hóa' },
  { en: 'hydrogen evolution reaction', vi: 'phản ứng thoát hydro (HER)' },
  { en: 'oxygen evolution reaction', vi: 'phản ứng thoát oxy (OER)' },
  { en: 'oxygen reduction reaction', vi: 'phản ứng khử oxy (ORR)' },
  { en: 'charge transfer', vi: 'truyền điện tích' },
  { en: 'electron transfer', vi: 'truyền electron' },
  { en: 'electrochemical impedance', vi: 'tổng trở điện hóa' },
  { en: 'current density', vi: 'mật độ dòng' },
  { en: 'electrolyte', vi: 'chất điện ly' },
  { en: 'working electrode', vi: 'điện cực làm việc' },
  // Photo / spectroscopy
  { en: 'absorption spectrum', vi: 'phổ hấp thụ' },
  { en: 'absorbance', vi: 'độ hấp thụ' },
  { en: 'band gap', vi: 'năng lượng vùng cấm' },
  { en: 'photocatalyst', vi: 'chất quang xúc tác' },
  { en: 'photocatalytic', vi: 'quang xúc tác' },
  { en: 'photoluminescence', vi: 'phát quang' },
  { en: 'binding energy', vi: 'năng lượng liên kết' },
  { en: 'Raman shift', vi: 'độ dịch Raman' },
  { en: 'full width at half maximum', vi: 'độ rộng nửa cực đại (FWHM)' },
  // Materials / synthesis
  { en: 'adsorption', vi: 'hấp phụ' },
  { en: 'desorption', vi: 'giải hấp' },
  { en: 'crystallinity', vi: 'độ kết tinh' },
  { en: 'crystallite size', vi: 'kích thước tinh thể' },
  { en: 'lattice', vi: 'mạng tinh thể' },
  { en: 'thin film', vi: 'màng mỏng' },
  { en: 'nanoparticle', vi: 'hạt nano' },
  { en: 'nanosheet', vi: 'tấm nano' },
  { en: 'annealing', vi: 'ủ nhiệt' },
  { en: 'calcination', vi: 'nung' },
  { en: 'precursor', vi: 'tiền chất' },
  { en: 'doping', vi: 'pha tạp' },
  { en: 'heterojunction', vi: 'lớp tiếp giáp dị thể' },
  { en: 'surface area', vi: 'diện tích bề mặt' },
  { en: 'morphology', vi: 'hình thái' }
];

/** Build the prompt block. Returns '' for non-vi (no glossary yet). */
export function glossaryBlock(targetLang: string): string {
  if (targetLang !== 'vi') return '';
  const lines = GLOSSARY_VI.map((e) => `- ${e.en} → ${e.vi}`).join('\n');
  return `PREFERRED TERMINOLOGY (use these Vietnamese renderings when the English term appears, unless the context clearly means something else; keep any parenthetical acronym):\n${lines}`;
}
