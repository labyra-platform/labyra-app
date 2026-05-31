/**
 * Bounded-concurrency async map.
 *
 * Runs at most `limit` of `fn` in flight at once, preserving input→output order.
 * Used to parallelize per-paper Firestore subcollection reads (BM25 corpus +
 * retrieval) without firing thousands of simultaneous round-trips at a large
 * tenant — the serial version was the RAG N+1 latency bottleneck.
 *
 * @phase R238c
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = Array.from<R>({ length: items.length });
  if (items.length === 0) return results;

  let cursor = 0;
  const workerCount = Math.max(1, Math.min(limit, items.length));
  const workers = Array.from({ length: workerCount }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await fn(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}
