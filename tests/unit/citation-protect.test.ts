import { describe, expect, it } from 'vitest';

import { protectRefs, restoreRefs } from '@/features/papers/lib/citation-protect';

function roundtrip(text: string, lang = 'vi') {
  const { masked, map } = protectRefs(text);
  return { masked, map, restored: restoreRefs(masked, map, lang) };
}

const OPEN = '\u27E6'; // ⟦

describe('citation-protect — chemical formulae (R270)', () => {
  it('masks common inorganic formulae and renders subscripts on restore', () => {
    const src = 'The H2O and CO2 react with WO3.';
    const { masked, restored } = roundtrip(src);
    expect(masked).not.toContain('H2O');
    expect(masked).not.toContain('WO3');
    expect(restored).toBe('The H<sub>2</sub>O and CO<sub>2</sub> react with WO<sub>3</sub>.');
  });

  it('masks two-element formulae without a digit (ZnO, NaCl)', () => {
    const { masked, map } = roundtrip('ZnO and NaCl films.');
    expect(masked).not.toContain('ZnO');
    expect(masked).not.toContain('NaCl');
    expect(map.filter((e) => e.kind === 'formula')).toHaveLength(2);
  });

  it('masks single-element formulae that carry a subscript (U235, O2, I2)', () => {
    const { masked } = roundtrip('U235 enrichment, O2 flow, I2 vapor.');
    expect(masked).not.toContain('U235');
    expect(masked).not.toContain('O2');
    expect(masked).not.toContain('I2');
  });

  it('does NOT mask English words that are also element symbols', () => {
    const src = 'In this work, As shown, He found No clear Be effect.';
    const { masked, map } = roundtrip(src);
    expect(map.some((e) => e.kind === 'formula')).toBe(false);
    expect(masked).toBe(src);
  });

  it('does NOT mask non-element tokens (A4, T2, U-Net)', () => {
    const { map } = roundtrip('A4 paper, T2 signal, U-Net model.');
    expect(map.some((e) => e.kind === 'formula')).toBe(false);
  });

  it('leaves "Figure"/"Section" intact (no formula fragment from "Fi"/"Se")', () => {
    const { map } = roundtrip('Figure 2 and Section 3 describe it.');
    expect(map.some((e) => e.kind === 'formula')).toBe(false);
  });

  it('coexists with figure + bracket refs without corrupting placeholders', () => {
    const { restored, map } = roundtrip('Figure 4 shows H2O at [12].');
    expect(restored).toContain('Hình 4'); // figure localized for vi
    expect(restored).toContain('[12]'); // bracket verbatim
    expect(restored).toContain('H<sub>2</sub>O'); // formula with subscript
    expect(restored).not.toContain(OPEN); // every placeholder resolved
    expect(map.some((e) => e.kind === 'formula')).toBe(true);
  });

  it('handles a formula-dense sentence end to end', () => {
    const src = 'TiO2, Fe2O3, and MoS2 on SiO2/Si substrates.';
    expect(roundtrip(src).restored).toBe(
      'TiO<sub>2</sub>, Fe<sub>2</sub>O<sub>3</sub>, and MoS<sub>2</sub> on SiO<sub>2</sub>/Si substrates.'
    );
  });

  it('leaves single-element formulae verbatim (O2 diatomic, U235 isotope)', () => {
    // single element + digit is ambiguous (diatomic subscript vs isotope mass
    // number = superscript) — never subscript it; multi-element still gets subs
    expect(roundtrip('O2 flow and U235 target.').restored).toBe('O2 flow and U235 target.');
    expect(roundtrip('WO3 film.').restored).toBe('WO<sub>3</sub> film.');
  });
});
