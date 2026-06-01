import { describe, expect, it } from 'vitest';

import {
  buildNumberRegistry,
  dropLabVerified,
  extractLabNumbers,
  labWhitelist
} from '@/lib/ai/manuscript/number-registry';

describe('extractLabNumbers (Gap1)', () => {
  it('extracts numeric metric values tagged to their measurement; skips non-numeric', () => {
    const r = extractLabNumbers([
      { measurementId: 'm1', values: { bandgap_eV: 2.6, phase: 'hexagonal' } },
      { measurementId: 'm2', values: { d_spacing_A: '3.84' } }
    ]);
    expect(r).toHaveLength(2);
    // normalizeNumber uses toFixed(2): 2.6 -> '2.60'
    expect(r.find((x) => x.measurementId === 'm1')?.norm).toBe('2.60');
    expect(r.find((x) => x.measurementId === 'm2')?.norm).toBe('3.84');
  });
});

describe('buildNumberRegistry', () => {
  it('whitelists lab + literature numbers and tags lab provenance', () => {
    const labNumbers = extractLabNumbers([{ measurementId: 'm1', values: { bandgap_eV: 2.6 } }]);
    const reg = buildNumberRegistry(labNumbers, ['The reference bandgap is 2.80 eV.']);
    expect(reg.whitelist.has('2.60')).toBe(true); // lab
    expect(reg.whitelist.has('2.80')).toBe(true); // literature
    expect(reg.entries).toEqual([{ value: '2.60', source: { kind: 'lab', measurementId: 'm1' } }]);
  });

  it('deduplicates an identical lab number + measurement', () => {
    const labNumbers = extractLabNumbers([{ measurementId: 'm1', values: { a: 2.6, b: 2.6 } }]);
    expect(buildNumberRegistry(labNumbers, []).entries).toHaveLength(1);
  });
});

describe('labWhitelist + dropLabVerified', () => {
  it('labWhitelist collects only lab norms', () => {
    const w = labWhitelist(
      extractLabNumbers([
        { measurementId: 'm1', values: { a: 2.6 } },
        { measurementId: 'm2', values: { b: 100 } }
      ])
    );
    expect([...w].toSorted()).toEqual(['100', '2.60']);
  });

  it('removes lab-backed numbers, keeps the rest', () => {
    const unv = [
      { value: 2.6, raw: '2.6 eV', context: '' },
      { value: 9.9, raw: '9.9 mA', context: '' }
    ];
    const labW = labWhitelist(extractLabNumbers([{ measurementId: 'm1', values: { x: 2.6 } }]));
    const kept = dropLabVerified(unv, labW);
    expect(kept).toHaveLength(1);
    expect(kept[0].value).toBe(9.9);
  });

  it('is a no-op for an empty lab whitelist', () => {
    const unv = [{ value: 2.6, raw: '2.6', context: '' }];
    expect(dropLabVerified(unv, new Set())).toBe(unv);
  });
});
