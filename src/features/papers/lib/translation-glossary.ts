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
  { en: 'morphology', vi: 'hình thái' },
  // XRD (R271)
  { en: 'X-ray diffraction', vi: 'nhiễu xạ tia X (XRD)' },
  { en: 'diffraction pattern', vi: 'giản đồ nhiễu xạ' },
  { en: 'diffraction peak', vi: 'đỉnh nhiễu xạ' },
  { en: "Bragg's law", vi: 'định luật Bragg' },
  { en: 'd-spacing', vi: 'khoảng cách mặt mạng' },
  { en: 'crystal plane', vi: 'mặt phẳng tinh thể' },
  { en: 'Miller indices', vi: 'chỉ số Miller' },
  { en: 'lattice parameter', vi: 'hằng số mạng' },
  { en: 'dislocation density', vi: 'mật độ lệch mạng' },
  { en: 'microstrain', vi: 'vi biến dạng' },
  { en: 'preferred orientation', vi: 'định hướng ưu tiên' },
  { en: 'amorphous', vi: 'vô định hình' },
  // DFT / computational (R271)
  { en: 'density functional theory', vi: 'lý thuyết phiếm hàm mật độ (DFT)' },
  { en: 'density of states', vi: 'mật độ trạng thái (DOS)' },
  { en: 'band structure', vi: 'cấu trúc vùng năng lượng' },
  { en: 'Brillouin zone', vi: 'vùng Brillouin' },
  { en: 'valence band', vi: 'vùng hóa trị' },
  { en: 'conduction band', vi: 'vùng dẫn' },
  { en: 'Fermi level', vi: 'mức Fermi' },
  { en: 'pseudopotential', vi: 'giả thế' },
  { en: 'first-principles', vi: 'nguyên lý cơ bản' },
  { en: 'supercell', vi: 'siêu ô' },
  { en: 'exchange-correlation', vi: 'trao đổi-tương quan' },
  // Photoelectrochemistry (R271)
  { en: 'water splitting', vi: 'tách nước' },
  { en: 'photocurrent', vi: 'dòng quang' },
  { en: 'charge carrier', vi: 'hạt tải điện' },
  { en: 'charge separation', vi: 'phân tách điện tích' },
  { en: 'recombination', vi: 'tái hợp' },
  { en: 'photoanode', vi: 'quang anode' },
  { en: 'photocathode', vi: 'quang cathode' },
  { en: 'flat band potential', vi: 'thế dải phẳng' },
  { en: 'solar-to-hydrogen efficiency', vi: 'hiệu suất quang-hydro (STH)' },
  // FTIR / Raman (R271)
  { en: 'functional group', vi: 'nhóm chức' },
  { en: 'transmittance', vi: 'độ truyền qua' },
  { en: 'wavenumber', vi: 'số sóng' },
  { en: 'stretching vibration', vi: 'dao động hóa trị' },
  { en: 'bending vibration', vi: 'dao động biến dạng' }
];

/** Build the prompt block, merging the built-in domain glossary with an optional
 *  tenant glossary (lab-specific renderings, which take priority for the same
 *  English term). Returns '' for non-vi (no glossary yet). */
export function glossaryBlock(targetLang: string): string {
  if (targetLang !== 'vi') return '';
  const lines = GLOSSARY_VI.map((e) => `- ${e.en} → ${e.vi}`).join('\n');
  return `PREFERRED TERMINOLOGY (use these Vietnamese renderings when the English term appears, unless the context clearly means something else; keep any parenthetical acronym):\n${lines}`;
}
