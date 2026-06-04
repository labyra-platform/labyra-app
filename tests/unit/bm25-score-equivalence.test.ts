import { describe, it, expect } from 'vitest';
import { BM25Encoder, getHybridTokenizer } from '@/lib/ai/rag/sparse';

/**
 * R251: scorePreEncoded must be identical to score() when the doc vectors are
 * exactly encode(doc). This guards the perf optimisation (precompute doc vectors
 * at fit instead of re-encoding every chunk per query) against silent drift.
 */
describe('BM25 scorePreEncoded equivalence', () => {
  const docs = [
    'tungsten trioxide photoelectrochemical water splitting bandgap onset',
    'nickel cobalt sulfide hydrogen evolution reaction catalyst overpotential',
    'raman spectroscopy carboxylate stretching cadmium stearate bonding geometry',
    'graphene liquid phase exfoliation shear mixer industrial scalable production',
    'molybdenum disulfide field effect transistor electron mobility two dimensional'
  ];

  it('matches score() on the full corpus and on a filtered subset', async () => {
    const enc = new BM25Encoder(getHybridTokenizer());
    await enc.fit(docs);

    const query = 'how does WO3 split water under illumination';
    const vecs = docs.map((d) => enc.encode(d));

    expect(enc.scorePreEncoded(query, vecs)).toEqual(enc.score(query, docs));

    // subset mirrors query-time group/collection scoping in retrieveBM25
    const subset = [0, 2, 4];
    expect(
      enc.scorePreEncoded(
        query,
        subset.map((i) => vecs[i])
      )
    ).toEqual(
      enc.score(
        query,
        subset.map((i) => docs[i])
      )
    );
  });

  it('returns all-zero for an out-of-vocabulary query', async () => {
    const enc = new BM25Encoder(getHybridTokenizer());
    await enc.fit(docs);
    const vecs = docs.map((d) => enc.encode(d));
    const scores = enc.scorePreEncoded('zzzznonexistenttokenqqqq', vecs);
    expect(scores).toEqual(docs.map(() => 0));
  });
});
