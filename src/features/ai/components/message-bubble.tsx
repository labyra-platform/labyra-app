'use client';
import { useTranslations } from 'next-intl';
import { IconCheck, IconCopy, IconShieldSearch } from '@tabler/icons-react';
import {
  cloneElement,
  Fragment,
  isValidElement,
  memo,
  type ReactElement,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeKatex from 'rehype-katex';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import { unwrapViMath } from '../lib/sanitize-vi-math';
import { rehypeNumericTableCols } from '../lib/rehype-numeric-table-cols';
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
const CIRCLED_ONE = 0x2460; // ① ; ⑳ = U+2473 (20)
// Citation markers the model may emit: ASCII brackets [1] / [1, 2], or circled
// digits ①..⑳ (Gemini sometimes "prettifies" [n] into these). Both → chip(s).
const CITATION_RE = /\[([\d\s,]+)\]|([\u2460-\u2473])/g;

function renderWithCitations(
  text: string,
  totalSources: number,
  onClickRef: (ref: number) => void,
  displayMap?: Map<number, number>
): ReactNode[] {
  if (totalSources === 0 || !text) return [text];

  const nodes: ReactNode[] = [];
  let lastIdx = 0;
  let match: RegExpExecArray | null;
  CITATION_RE.lastIndex = 0; // module-level /g regex — reset before each parse

  while ((match = CITATION_RE.exec(text)) !== null) {
    // Bracket form "[1]" / "[1, 2]" (group 1) or circled "①..⑳" (group 2).
    const refs: number[] = match[1]
      ? match[1]
          .split(/[\s,]+/)
          .map(Number)
          .filter((n) => Number.isInteger(n) && n > 0)
      : match[2]
        ? [(match[2].codePointAt(0) ?? CIRCLED_ONE) - CIRCLED_ONE + 1]
        : [];

    if (refs.length === 0) continue; // e.g. "[ ]" — leave the matched text in place

    const idx = match.index;
    if (idx > lastIdx) nodes.push(text.slice(lastIdx, idx));
    refs.forEach((refNum, j) => {
      nodes.push(
        <CitationChip
          key={`cite-${idx}-${refNum}-${j}`}
          refNumber={refNum}
          displayNumber={displayMap?.get(refNum)}
          totalSources={totalSources}
          onClick={onClickRef}
        />
      );
    });
    lastIdx = idx + match[0].length;
  }
  if (lastIdx < text.length) nodes.push(text.slice(lastIdx));
  return nodes;
}

const STREAM_THROTTLE_MS = 120; // R252: cap streaming markdown re-parse to ~8×/s

// R249: rendering a message parses markdown + KaTeX, which the Profiler showed
// costs ~50–80ms PER MESSAGE and (actualMs ≈ baseMs) re-ran for EVERY message on
// every streaming delta — O(n) re-parse per token. memo() below makes a bubble
// re-render only when its own props change; since streaming updates preserve the
// object identity of untouched messages (use-chat-stream maps `: m`), only the
// streaming message re-renders. Default shallow compare is safe here precisely
// because any field change produces a new message ref.
function MessageBubbleInner({
  message,
  conversationId,
  streaming,
  animate
}: {
  message: AiMessage;
  conversationId?: string;
  streaming?: boolean;
  animate?: boolean;
}) {
  const [showAudit, setShowAudit] = useState(false);
  const isUser = message.role === 'user';
  const sources = useChatSources(message.toolCalls);
  const [activeRef, setActiveRef] = useState<number | null>(null);

  const handleCitationClick = useCallback((refNumber: number) => {
    setActiveRef(refNumber);
  }, []);

  const activeSource =
    activeRef !== null ? (sources.find((s) => s.ref === activeRef) ?? null) : null;

  // R252: while streaming, render LIVE markdown but throttle the content fed to
  // the parser to ~STREAM_THROTTLE_MS so it re-parses ~8×/s instead of on every
  // token (R250 rendered raw text, which showed ugly markdown source mid-stream).
  const [throttled, setThrottled] = useState(message.content ?? '');
  const lastTickRef = useRef(0);
  useEffect(() => {
    const full = message.content ?? '';
    if (!streaming) {
      setThrottled(full);
      return;
    }
    const elapsed = Date.now() - lastTickRef.current;
    if (elapsed >= STREAM_THROTTLE_MS) {
      lastTickRef.current = Date.now();
      setThrottled(full);
      return;
    }
    const id = setTimeout(() => {
      lastTickRef.current = Date.now();
      setThrottled(full);
    }, STREAM_THROTTLE_MS - elapsed);
    return () => clearTimeout(id);
  }, [message.content, streaming]);

  // R240: strip math delimiters the model wrongly wrapped around Vietnamese prose
  // before react-markdown renders it. Used for both rendering and the copy action.
  const renderContent = streaming ? throttled : (message.content ?? '');
  const safeContent = useMemo(() => unwrapViMath(renderContent), [renderContent]);

  // Number citations by order of FIRST appearance in the answer (Vancouver style),
  // not by retrieval rank. Maps the model's original ref → display number. Based on
  // renderContent (= throttled while streaming) so it changes in lockstep with
  // safeContent and never busts the markdown memo more often than the throttle.
  const citationOrder = useMemo(() => {
    const map = new Map<number, number>();
    if (!renderContent || sources.length === 0) return map;
    CITATION_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    let next = 1;
    while ((m = CITATION_RE.exec(renderContent)) !== null) {
      const refs = m[1]
        ? m[1]
            .split(/[\s,]+/)
            .map(Number)
            .filter((n) => Number.isInteger(n) && n > 0)
        : m[2]
          ? [(m[2].codePointAt(0) ?? CIRCLED_ONE) - CIRCLED_ONE + 1]
          : [];
      for (const r of refs) {
        if (r >= 1 && r <= sources.length && !map.has(r)) map.set(r, next++);
      }
    }
    return map;
  }, [renderContent, sources.length]);

  // Custom markdown renderers that inject citation chips into text nodes
  const markdownComponents = useMemo(
    () => ({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      p: ({ children, ...props }: any) => (
        <p {...props}>
          {processChildren(children, sources.length, handleCitationClick, citationOrder)}
        </p>
      ),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      li: ({ children, ...props }: any) => (
        <li {...props}>
          {processChildren(children, sources.length, handleCitationClick, citationOrder)}
        </li>
      ),
      // Citations inside comparison-table cells also render as chips. Keep
      // ...props so rehypeNumericTableCols' .lb-num className survives.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      td: ({ children, ...props }: any) => (
        <td {...props}>
          {processChildren(children, sources.length, handleCitationClick, citationOrder)}
        </td>
      ),
      // R247: professional comparison table — wrapper enables horizontal scroll +
      // the .lb-table styling (kẻ ngang, header tinh tế, số căn phải). Numeric
      // columns are tagged .lb-num by the rehypeNumericTableCols plugin.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      table: ({ children }: any) => (
        <div className='lb-table-wrap'>
          <table className='lb-table'>{children}</table>
        </div>
      )
    }),
    [sources.length, handleCitationClick, citationOrder]
  );

  // R252: memoise the parsed markdown element. The bubble re-renders on every
  // streaming token (its message ref changes), but ReactMarkdown only re-parses
  // when `safeContent` actually changes — i.e. ~8×/s under the throttle above,
  // not once per token. Combined, this keeps live formatting cheap.
  const rendered = useMemo(
    () => (
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[
          [rehypeKatex, { strict: false, throwOnError: false }],
          rehypeNumericTableCols
        ]}
        components={markdownComponents}
      >
        {safeContent || '...'}
      </ReactMarkdown>
    ),
    [safeContent, markdownComponents]
  );

  return (
    <div className={cn(animate && 'message-appear', isUser && 'flex justify-end')}>
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
            <div className='lb-md'>{rendered}</div>
            <CitationModal
              source={activeSource}
              displayRef={activeRef !== null ? citationOrder.get(activeRef) : undefined}
              onClose={() => setActiveRef(null)}
            />
            {message.grounding && <GroundingWarning grounding={message.grounding} />}
            {message.content && <CopyButton text={safeContent} />}
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
  onClickRef: (ref: number) => void,
  displayMap?: Map<number, number>
): ReactNode {
  // Plain text → parse citation markers ([1] / [1, 2] / ①) into chips.
  if (typeof children === 'string') {
    return renderWithCitations(children, totalSources, onClickRef, displayMap);
  }
  // Multiple children → process each, recursing into inline formatting.
  if (Array.isArray(children)) {
    return children.map((child, i) => (
      <Fragment key={i}>{processChildren(child, totalSources, onClickRef, displayMap)}</Fragment>
    ));
  }
  // Inline element (<strong>, <em>…) → recurse so a [n] inside bold/italic still
  // becomes a chip. Skip <code>/<pre>/<a> (brackets are literal / no nested button)
  // and KaTeX math (never touch rendered math).
  if (isValidElement(children)) {
    const el = children as ReactElement<{ children?: ReactNode; className?: string }>;
    const className = typeof el.props.className === 'string' ? el.props.className : '';
    const skip =
      el.type === 'code' || el.type === 'pre' || el.type === 'a' || className.includes('katex');
    if (skip) return children;
    return cloneElement(
      el,
      undefined,
      processChildren(el.props.children, totalSources, onClickRef, displayMap)
    );
  }
  return children;
}

export const MessageBubble = memo(MessageBubbleInner);
