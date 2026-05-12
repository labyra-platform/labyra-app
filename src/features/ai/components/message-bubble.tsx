'use client';
import { useMemo, useState, type ReactNode } from 'react';
import type { AiMessage } from '@/types/ai';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { cn } from '@/lib/utils';
import { useTranslations } from 'next-intl';
import 'katex/dist/katex.min.css';
import { CitationChip } from './citation-chip';
import { CitationModal } from './citation-modal';
import { GroundingWarning } from './grounding-warning';
import { useChatSources } from '../hooks/use-chat-sources';

const TIER_LABELS: Record<1 | 2 | 3, string> = {
  1: 'tierFlash',
  2: 'tierSonnet',
  3: 'tierOpus'
};
const TIER_COLORS: Record<1 | 2 | 3, string> = {
  1: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  2: 'bg-sky-500/10 text-sky-600 dark:text-sky-400',
  3: 'bg-violet-500/10 text-violet-600 dark:text-violet-400'
};

function TierBadge({ tier }: { tier: 1 | 2 | 3 }) {
  const t = useTranslations('ai');
  return (
    <span
      className={cn(
        'mb-1.5 inline-block rounded-full px-2 py-0.5 text-[10px] font-medium leading-none',
        TIER_COLORS[tier]
      )}
    >
      {t(TIER_LABELS[tier])}
    </span>
  );
}

/**
 * Parse text containing [N] markers and replace with CitationChip components.
 * Returns array of React nodes (string segments + chips).
 */
function renderWithCitations(
  text: string,
  totalSources: number,
  onClickRef: (ref: number) => void
): ReactNode[] {
  if (totalSources === 0 || !text) return [text];

  const regex = /\[(\d+)\]/g;
  const nodes: ReactNode[] = [];
  let lastIdx = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIdx) {
      nodes.push(text.slice(lastIdx, match.index));
    }
    const refNum = Number(match[1]);
    nodes.push(
      <CitationChip
        key={`cite-${match.index}-${refNum}`}
        refNumber={refNum}
        totalSources={totalSources}
        onClick={onClickRef}
      />
    );
    lastIdx = match.index + match[0].length;
  }
  if (lastIdx < text.length) {
    nodes.push(text.slice(lastIdx));
  }
  return nodes;
}

export function MessageBubble({ message }: { message: AiMessage }) {
  const isUser = message.role === 'user';
  const sources = useChatSources(message.toolCalls);
  const [activeRef, setActiveRef] = useState<number | null>(null);

  const handleCitationClick = (refNumber: number) => {
    setActiveRef(refNumber);
  };

  const activeSource =
    activeRef !== null ? (sources.find((s) => s.ref === activeRef) ?? null) : null;

  // Custom markdown renderers that inject citation chips into text nodes
  const markdownComponents = useMemo(
    () => ({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      p: ({ children, ...props }: any) => (
        <p {...props}>{processChildren(children, sources.length, handleCitationClick)}</p>
      ),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      li: ({ children, ...props }: any) => (
        <li {...props}>{processChildren(children, sources.length, handleCitationClick)}</li>
      )
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sources.length]
  );

  return (
    <div className={cn('flex', isUser ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[85%] rounded-2xl px-4 py-2 text-sm',
          isUser ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground'
        )}
      >
        {isUser ? (
          <p className='whitespace-pre-wrap'>{message.content}</p>
        ) : (
          <>
            {message.tier && <TierBadge tier={message.tier} />}
            {/* Tool calls hidden from UI (ai-5d-3c) — sources accessible via citation chip modal */}
            <div className='prose prose-sm dark:prose-invert max-w-none prose-table:my-2 prose-pre:my-2 prose-p:my-1.5'>
              <ReactMarkdown
                remarkPlugins={[remarkGfm, remarkMath]}
                rehypePlugins={[rehypeKatex]}
                components={markdownComponents}
              >
                {message.content || '...'}
              </ReactMarkdown>
            </div>
            <CitationModal source={activeSource} onClose={() => setActiveRef(null)} />
            {message.grounding && <GroundingWarning grounding={message.grounding} />}
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Walk markdown children, finding string nodes and replacing [N] with chips.
 * Non-string nodes (other React elements) pass through unchanged.
 */
function processChildren(
  children: ReactNode,
  totalSources: number,
  onClickRef: (ref: number) => void
): ReactNode {
  if (typeof children === 'string') {
    return renderWithCitations(children, totalSources, onClickRef);
  }
  if (Array.isArray(children)) {
    return children.map((child, i) => {
      if (typeof child === 'string') {
        return <span key={i}>{renderWithCitations(child, totalSources, onClickRef)}</span>;
      }
      return child;
    });
  }
  return children;
}
