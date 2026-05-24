'use client';
import { useTranslations } from 'next-intl';
import { IconCheck, IconCopy, IconShieldSearch } from '@tabler/icons-react';
import { type ReactNode, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeKatex from 'rehype-katex';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import { cn } from '@/lib/utils';
import type { AiMessage } from '@/types/ai';
import 'katex/dist/katex.min.css';
import { useChatSources } from '../hooks/use-chat-sources';
import { CitationChip } from './citation-chip';
import { CitationModal } from './citation-modal';
import { GroundingWarning } from './grounding-warning';
import { AuditPanel } from './audit-panel';
import { MessageAttachments } from './message-attachments';
import { copyRich } from '../lib/copy-rich';

// R176-2a-hotfix-role-labels
// Role-based labels decouple UI from model identity. Researcher sees what
// the AI is doing (Lab Manager / Librarian / Engineer / Writer / Auditor)
// not which underlying model. Stable across R176-2b/c model swaps.
const TIER_LABELS: Record<1 | 2 | 3 | 4 | 5, string> = {
  1: 'tierLabManager',
  2: 'tierLibrarian',
  3: 'tierEngineer',
  4: 'tierWriter',
  5: 'tierAuditor'
};
const TIER_COLORS: Record<1 | 2 | 3 | 4 | 5, string> = {
  1: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  2: 'bg-sky-500/10 text-sky-600 dark:text-sky-400',
  3: 'bg-violet-500/10 text-violet-600 dark:text-violet-400',
  4: 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300',
  5: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300'
};

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    try {
      await copyRich(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard unavailable — silently ignore
    }
  };
  return (
    <button
      type='button'
      onClick={onCopy}
      aria-label='Copy message'
      className='text-muted-foreground hover:text-foreground hover:bg-background/60 absolute -bottom-3 right-2 rounded-md border bg-background p-1.5 opacity-0 shadow-sm transition-opacity group-hover:opacity-100 focus-visible:opacity-100'
    >
      {copied ? <IconCheck className='size-3.5' /> : <IconCopy className='size-3.5' />}
    </button>
  );
}

function TierBadge({ tier }: { tier: 1 | 2 | 3 | 4 | 5 }) {
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

export function MessageBubble({
  message,
  conversationId
}: {
  message: AiMessage;
  conversationId?: string;
}) {
  const [showAudit, setShowAudit] = useState(false);
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
    [sources.length, handleCitationClick]
  );

  return (
    <div className={cn('message-appear', isUser && 'flex justify-end')}>
      <div
        className={cn(
          'group relative text-sm',
          isUser
            ? 'max-w-[80%] rounded-2xl bg-muted px-4 py-2.5 text-foreground'
            : 'w-full text-foreground'
        )}
      >
        {isUser ? (
          <>
            {message.attachments && message.attachments.length > 0 && (
              <MessageAttachments attachments={message.attachments} />
            )}
            {message.content && <p className='whitespace-pre-wrap'>{message.content}</p>}
          </>
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
            {message.content && <CopyButton text={message.content} />}
            {message.content && conversationId && (message.tier === 3 || message.tier === 4) && (
              <>
                <button
                  type='button'
                  onClick={() => setShowAudit((s) => !s)}
                  aria-label='Audit response'
                  className='text-muted-foreground hover:text-foreground hover:bg-background/60 absolute -bottom-3 right-12 rounded-md border bg-background p-1.5 opacity-0 shadow-sm transition-opacity group-hover:opacity-100 focus-visible:opacity-100'
                >
                  <IconShieldSearch className='size-3.5' />
                </button>
                {showAudit && <AuditPanel messageId={message.id} conversationId={conversationId} />}
              </>
            )}
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
