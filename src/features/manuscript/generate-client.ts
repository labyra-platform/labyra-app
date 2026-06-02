'use client';

/**
 * Client bridge to the section-generation SSE route. Streams text deltas to
 * `onDelta` and resolves with the final draft + grounding. The caller persists
 * the result into the manuscript via queries/manuscripts.upsertManuscriptSection.
 *
 * @phase R-aiscience-3
 */
import type { GenerateSectionRequest, SectionDraftResult } from '@/features/manuscript/types';
import { getFirebaseAuth } from '@/lib/firebase/client';

export interface StreamSectionOptions extends GenerateSectionRequest {
  onDelta?: (delta: string) => void;
  signal?: AbortSignal;
}

type StreamEvent =
  | { type: 'text_delta'; delta: string }
  | ({ type: 'complete' } & SectionDraftResult)
  | { type: 'error'; message: string };

export async function streamManuscriptSection(
  opts: StreamSectionOptions
): Promise<SectionDraftResult> {
  const { onDelta, signal, ...payload } = opts;
  const token = await getFirebaseAuth().currentUser?.getIdToken();
  if (!token) throw new Error('Not signed in.');

  const res = await fetch('/api/manuscript/generate-section', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal
  });
  if (!res.ok || !res.body) throw new Error(`Generation request failed (${res.status}).`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let final: SectionDraftResult | null = null;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const parts = buf.split('\n\n');
    buf = parts.pop() ?? '';
    for (const part of parts) {
      const line = part.trim();
      if (!line.startsWith('data:')) continue;
      const event = JSON.parse(line.slice('data:'.length).trim()) as StreamEvent;
      if (event.type === 'text_delta') {
        onDelta?.(event.delta);
      } else if (event.type === 'complete') {
        final = {
          section: event.section,
          draft: event.draft,
          citations: event.citations,
          grounding: event.grounding
        };
      } else if (event.type === 'error') {
        throw new Error(event.message);
      }
    }
  }

  if (!final) throw new Error('Stream ended without a completed draft.');
  return final;
}
