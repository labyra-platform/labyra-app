'use client';
/**
 * Derive sources from a message's tool calls.
 * @phase R160-ai-5d-3
 */
import { useMemo } from 'react';
import type { SourceHit } from '../components/sources-panel';

interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
  result?: unknown;
  isError?: boolean;
}

interface SearchPapersResult {
  hits?: SourceHit[];
}

/**
 * Extract sources from all searchPapers tool calls in a message.
 * Returns flattened array with stable ref numbers.
 */
export function useChatSources(toolCalls: ToolCall[] | undefined): SourceHit[] {
  return useMemo(() => {
    if (!toolCalls || toolCalls.length === 0) return [];

    const allSources: SourceHit[] = [];

    for (const tc of toolCalls) {
      if (tc.name !== 'searchPapers' || tc.isError || !tc.result) continue;
      const result = tc.result as SearchPapersResult;
      if (!Array.isArray(result.hits)) continue;
      for (const hit of result.hits) {
        if (hit && typeof hit.ref === 'number') {
          allSources.push(hit);
        }
      }
    }

    return allSources;
  }, [toolCalls]);
}
