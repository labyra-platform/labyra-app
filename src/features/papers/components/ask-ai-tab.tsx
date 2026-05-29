'use client';

/**
 * Ask AI tab in the paper side panel.
 *
 * Sends the user's question to /api/papers/{id}/ask, streams the answer, then
 * appends a meta frame with citations + trust score. Citations are rendered as
 * inline [n] buttons — clicking jumps the PDF to the cited page.
 *
 * Anti-hallucination UI: the trust chip on each assistant message shows the
 * average rerank score of its citations. "Tôi không tìm thấy..." answers
 * (empty-retrieval lane) are rendered in muted style with a no-answer badge.
 *
 * @phase R237am
 */

import {
  IconAlertCircle,
  IconArrowUp,
  IconCheck,
  IconChevronRight,
  IconCopy,
  IconLoader2,
  IconSparkles
} from '@tabler/icons-react';
import { renderToString as renderKatex } from 'katex';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { copyPapersRich } from '@/features/papers/lib/copy-rich';
import { cn } from '@/lib/utils';
import {
  ASK_META_SENTINEL,
  type AskCitation,
  type AskMessage,
  type AskStreamMeta
} from '@/features/papers/ask/types';

/** Heuristic: does this content actually look like LaTeX math? KaTeX warns
 *  loudly (and renders garbled output) when given Vietnamese prose like "với".
 *  We only invoke KaTeX when there's a real math signal (backslash command,
 *  caret, underscore, brace, equality, operator), otherwise fall back to a
 *  plain inline span. This makes the panel robust to a model that occasionally
 *  wraps prose in <math> by accident. */
function looksLikeMath(s: string): boolean {
  // Quick ASCII signal — if it's pure ASCII it's most likely real LaTeX.
  // eslint-disable-next-line no-control-regex
  if (/^[\x00-\x7F\s]*$/.test(s) && /[\\^_{}=]/.test(s)) return true;
  // Vietnamese characters are a strong "this is prose" signal.
  if (/[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđÀ-Ỹ]/.test(s)) {
    return false;
  }
  // Mixed-but-no-Vietnamese: require at least one math command.
  return /\\[a-zA-Z]+|[\^_{}]/.test(s);
}

/** Render one <math> block. Either real KaTeX (math-like input) or an inline
 *  fallback span (prose accidentally wrapped). Always safe HTML. */
function renderMathBlock(latex: string): string {
  const trimmed = latex.trim();
  if (!looksLikeMath(trimmed)) {
    return `<span class="text-foreground">${trimmed
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')}</span>`;
  }
  try {
    return renderKatex(trimmed, {
      throwOnError: false,
      displayMode: false,
      output: 'html',
      strict: 'ignore',
      trust: false
    });
  } catch {
    return `<code class="font-mono">${trimmed.replace(/</g, '&lt;')}</code>`;
  }
}
/** Defensive strip of a leaked thinking-artifact prefix (e.g. "thought}",
 *  "{thought}", a stray leading "}"). The Gemini provider already filters
 *  thought parts (R237ao), but models occasionally emit a stray fragment;
 *  this keeps the UI clean without affecting normal answers. */
function stripThoughtArtifact(s: string): string {
  return s.replace(/^\s*(?:\{?\s*"?(?:thought|thinking|reasoning)"?\s*[:}\]]+|\}+)\s*/i, '');
}

/** Sanitize + render the assistant answer for safe HTML output.
 *
 *  Pipeline:
 *  (1) Extract every <math> block, render via renderMathBlock (KaTeX if it
 *      looks like math, plain inline span otherwise). Replace with a sentinel.
 *  (2) HTML-escape the rest.
 *  (3) Re-enable the whitelisted inline tags <sub>/<sup>/<b>/<i>.
 *  (4) Turn citation brackets [n] into clickable buttons.
 *  (5) Swap sentinels back for the rendered math HTML. */
function renderAnswerHtml(answer: string): string {
  const cleaned = stripThoughtArtifact(answer);
  const placeholders: string[] = [];
  const sentinel = '\u0001';
  const withMath = cleaned.replace(/<math>([\s\S]*?)<\/math>/gi, (_, latex: string) => {
    const idx = placeholders.push(renderMathBlock(latex)) - 1;
    return `${sentinel}M${idx}${sentinel}`;
  });
  const escaped = withMath.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const whitelisted = escaped.replace(/&lt;(\/?)(sub|sup|b|i)&gt;/gi, '<$1$2>');
  // Citation brackets: [1] → <button data-cite="1">[1]</button>
  const cited = whitelisted.replace(
    /\[(\d{1,2})\]/g,
    (_, n: string) => `<button type="button" data-cite="${n}" class="ask-cite-btn">[${n}]</button>`
  );
  return cited.replace(
    new RegExp(`${sentinel}M(\\d+)${sentinel}`, 'g'),
    (_, n: string) => placeholders[Number.parseInt(n, 10)] ?? ''
  );
}

function TrustChip({ score, noAnswer }: { score: number; noAnswer: boolean }) {
  if (noAnswer) {
    return (
      <span className='inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10.5px] font-medium text-amber-900 dark:bg-amber-950/50 dark:text-amber-200'>
        <IconAlertCircle className='size-3' />
        Không có trong paper
      </span>
    );
  }
  // Map 0-1 to a label + tone. Thresholds match the empty-retrieval line in
  // the route so the UI tells the same story the backend just made a decision on.
  const pct = Math.round(score * 100);
  if (score >= 0.7) {
    return (
      <span className='inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10.5px] font-medium text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200'>
        ✓ Khớp tốt · {pct}%
      </span>
    );
  }
  if (score >= 0.5) {
    return (
      <span className='inline-flex items-center gap-1 rounded-full bg-sky-100 px-2 py-0.5 text-[10.5px] font-medium text-sky-900 dark:bg-sky-950/50 dark:text-sky-200'>
        Tham khảo · {pct}%
      </span>
    );
  }
  return (
    <span className='inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10.5px] font-medium text-amber-900 dark:bg-amber-950/50 dark:text-amber-200'>
      <IconAlertCircle className='size-3' />
      Khớp yếu · {pct}%
    </span>
  );
}

interface AskAiTabProps {
  paperId: string;
  /** Called when a citation chip is clicked — viewer jumps to that page. */
  onJumpToPage: (page: number) => void;
  /** Optional Ctrl+drag selection text the user pinned to the next question. */
  pinnedSelection?: string;
  /** Clear the pinned selection after a question is sent. */
  onClearSelection?: () => void;
}

export function AskAiTab({
  paperId,
  onJumpToPage,
  pinnedSelection,
  onClearSelection
}: AskAiTabProps) {
  const [messages, setMessages] = useState<AskMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  // Auto-scroll to the latest message whenever a stream token lands.
  useEffect(() => {
    const el = scrollerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  // Auto-grow the textarea up to a max — same behaviour as the AI Assistant
  // composer so the input shape is consistent across the app.
  useEffect(() => {
    const ta = inputRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`;
  }, [input]);

  // Citation chip click — buttons are rendered via dangerouslySetInnerHTML so
  // we delegate to a single container listener. The button carries data-cite=n
  // and we cross-reference the message's citations[] to get the page number.
  const handleAnswerClick = useCallback(
    (msg: AskMessage) => (e: React.MouseEvent<HTMLDivElement>) => {
      const target = e.target as HTMLElement;
      const btn = target.closest<HTMLButtonElement>('button[data-cite]');
      if (!btn || !msg.citations) return;
      const n = Number.parseInt(btn.dataset.cite ?? '0', 10);
      const cite = msg.citations.find((c) => c.idx === n);
      if (cite) onJumpToPage(cite.page);
    },
    [onJumpToPage]
  );

  const send = useCallback(async () => {
    const question = input.trim();
    if (!question || busy) return;
    const selectionText = pinnedSelection;
    setInput('');
    setError(null);
    setBusy(true);

    const userMsg: AskMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: question,
      selectionText,
      createdAt: Date.now()
    };
    const assistantId = `a-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      userMsg,
      { id: assistantId, role: 'assistant', content: '', createdAt: Date.now() }
    ]);
    if (selectionText) onClearSelection?.();

    try {
      const { getFirebaseAuth } = await import('@/lib/firebase/client');
      const user = getFirebaseAuth().currentUser;
      if (!user) throw new Error('Not signed in');
      const token = await user.getIdToken();
      const res = await fetch(`/api/papers/${paperId}/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ question, selectionText })
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? 'ask_failed');
      }

      // Stream the answer; the tail of the body is a meta frame with citations.
      const reader = res.body?.getReader();
      if (!reader) throw new Error('ask_failed');
      const decoder = new TextDecoder();
      let buffer = '';
      let answerSoFar = '';
      let meta: AskStreamMeta | null = null;

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const sentinelAt = buffer.indexOf(ASK_META_SENTINEL);
        if (sentinelAt === -1) {
          answerSoFar = buffer;
        } else {
          answerSoFar = buffer.slice(0, sentinelAt);
          const metaJson = buffer.slice(sentinelAt + ASK_META_SENTINEL.length);
          try {
            meta = JSON.parse(metaJson) as AskStreamMeta;
          } catch {
            meta = null;
          }
        }
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantId ? { ...m, content: answerSoFar.trim() } : m))
        );
      }
      if (meta) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  citations: meta.citations,
                  trustScore: meta.trustScore,
                  noAnswer: meta.noAnswer
                }
              : m
          )
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'ask_failed';
      setError(msg);
      setMessages((prev) => prev.filter((m) => m.id !== assistantId));
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  }, [busy, input, paperId, pinnedSelection, onClearSelection]);

  const onKey = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        send();
      }
    },
    [send]
  );

  const isEmpty = messages.length === 0;

  return (
    <div className='flex h-full min-h-0 flex-col'>
      {/* Conversation */}
      <div ref={scrollerRef} className='min-h-0 flex-1 space-y-4 overflow-y-auto px-3 py-4 text-sm'>
        {isEmpty && <EmptyState />}
        {messages.map((m) =>
          m.role === 'user' ? (
            <UserBubble key={m.id} content={m.content} selectionText={m.selectionText} />
          ) : (
            <AssistantBubble
              key={m.id}
              message={m}
              onAnswerClick={handleAnswerClick(m)}
              onJumpToPage={onJumpToPage}
            />
          )
        )}
        {error && (
          <div className='rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive'>
            {error === 'cost_guard_blocked'
              ? 'Đã vượt hạn mức Q&A hôm nay. Hãy thử lại vào ngày mai.'
              : error === 'rate_limited'
                ? 'Hỏi quá nhanh — chờ một chút rồi thử lại.'
                : 'Có lỗi khi gọi AI. Hãy thử lại.'}
          </div>
        )}
      </div>

      {/* Pinned selection preview */}
      {pinnedSelection && (
        <div className='mx-3 mt-2 rounded-md border-l-2 border-primary/60 bg-muted/40 px-2.5 py-1.5'>
          <div className='mb-0.5 flex items-center justify-between text-[10px] uppercase tracking-wide text-muted-foreground'>
            <span>Đoạn đã chọn từ paper</span>
            <button
              type='button'
              onClick={() => onClearSelection?.()}
              className='hover:text-foreground'
              aria-label='Bỏ đoạn đã chọn'
            >
              Bỏ
            </button>
          </div>
          <p className='line-clamp-2 text-xs italic text-muted-foreground'>{pinnedSelection}</p>
        </div>
      )}

      {/* Composer — same shape as the AI Assistant message-input: rounded-2xl
       *  container with an auto-grow textarea and a circular send button. The
       *  send button is muted when empty and primary when there's text. */}
      <div className='shrink-0 px-3 pb-3 pt-2'>
        <div
          className={cn(
            'rounded-2xl border bg-background transition-colors',
            busy && 'opacity-60',
            'border-input focus-within:border-primary'
          )}
        >
          <div className='flex items-end gap-1.5 p-1.5'>
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKey}
              placeholder='Hãy hỏi tôi bất cứ điều gì về paper này…'
              aria-label='Câu hỏi cho AI'
              rows={1}
              disabled={busy}
              className='max-h-[200px] min-h-[36px] flex-1 resize-none bg-transparent px-2 py-2 text-sm leading-relaxed outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed'
            />
            <button
              type='button'
              onClick={send}
              disabled={busy || !input.trim()}
              aria-label='Gửi câu hỏi'
              title='Gửi (Enter)'
              className={cn(
                'flex size-9 shrink-0 items-center justify-center rounded-xl transition-colors',
                busy || !input.trim()
                  ? 'bg-muted text-muted-foreground'
                  : 'bg-primary text-primary-foreground hover:bg-primary/90'
              )}
            >
              {busy ? (
                <IconLoader2 className='size-4 animate-spin' />
              ) : (
                <IconArrowUp className='size-4' />
              )}
            </button>
          </div>
        </div>
        <p className='mt-1.5 px-1 text-[10.5px] text-muted-foreground'>
          Câu trả lời chỉ dựa vào nội dung paper. Nếu không tìm thấy, tôi sẽ nói &quot;không tìm
          thấy&quot;.
        </p>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className='flex h-full flex-col items-center justify-center gap-2 px-4 text-center text-muted-foreground'>
      <div className='flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary'>
        <IconSparkles className='size-5' />
      </div>
      <p className='text-sm font-medium text-foreground'>Hỏi AI về paper này</p>
      <p className='text-xs leading-relaxed'>
        Mỗi câu trả lời sẽ trích nguồn chính xác từ paper. Bạn có thể bôi đen một đoạn để hỏi cụ thể
        về đoạn đó.
      </p>
    </div>
  );
}

function UserBubble({ content, selectionText }: { content: string; selectionText?: string }) {
  return (
    <div className='flex flex-col items-end gap-1.5'>
      {selectionText && (
        <div className='max-w-[88%] rounded-md border-l-2 border-primary/60 bg-muted/40 px-2.5 py-1.5'>
          <div className='mb-0.5 text-[10px] uppercase tracking-wide text-muted-foreground'>
            Hỏi về đoạn
          </div>
          <p className='line-clamp-2 text-[11.5px] italic text-muted-foreground'>{selectionText}</p>
        </div>
      )}
      <div className='max-w-[88%] rounded-xl rounded-tr-sm bg-primary px-3 py-2 text-sm text-primary-foreground'>
        {content}
      </div>
    </div>
  );
}

function AssistantBubble({
  message,
  onAnswerClick,
  onJumpToPage
}: {
  message: AskMessage;
  onAnswerClick: (e: React.MouseEvent<HTMLDivElement>) => void;
  onJumpToPage: (page: number) => void;
}) {
  const html = useMemo(() => renderAnswerHtml(message.content), [message.content]);
  const [copied, setCopied] = useState(false);
  const handleCopy = useCallback(() => {
    if (!message.content) return;
    void copyPapersRich(message.content);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  }, [message.content]);
  return (
    <div className='group flex flex-col gap-2'>
      <div className='flex max-w-full flex-col gap-1'>
        <div
          // The answer is dangerously-set because we control the HTML pipeline:
          // sanitizer escapes everything, then re-enables sub/sup/b/i and
          // citation buttons; KaTeX produces its own safe HTML for <math>.
          // Citation clicks bubble up to the parent listener.
          onClick={onAnswerClick}
          className={cn(
            'whitespace-pre-wrap text-sm leading-relaxed text-foreground',
            '[&_sub]:align-sub [&_sub]:text-[0.75em]',
            '[&_sup]:align-super [&_sup]:text-[0.75em]',
            '[&_b]:font-semibold',
            '[&_i]:italic',
            '[&_.katex]:mx-0.5',
            '[&_.ask-cite-btn]:mx-0.5',
            '[&_.ask-cite-btn]:inline-flex',
            '[&_.ask-cite-btn]:h-4',
            '[&_.ask-cite-btn]:items-center',
            '[&_.ask-cite-btn]:rounded',
            '[&_.ask-cite-btn]:bg-primary/10',
            '[&_.ask-cite-btn]:px-1',
            '[&_.ask-cite-btn]:text-[10.5px]',
            '[&_.ask-cite-btn]:font-medium',
            '[&_.ask-cite-btn]:text-primary',
            '[&_.ask-cite-btn]:hover:bg-primary/20',
            !message.content && 'text-muted-foreground'
          )}
          // oxlint-disable-next-line jsx-a11y/no-static-element-interactions
          role='presentation'
          dangerouslySetInnerHTML={{
            __html: message.content
              ? html
              : '<span class="inline-flex items-center gap-1"><span class="ask-dot">●</span> Đang tìm trong paper…</span>'
          }}
        />
        <div className='mt-1 flex items-center gap-2'>
          {(message.trustScore !== undefined || message.noAnswer) && (
            <TrustChip score={message.trustScore ?? 0} noAnswer={message.noAnswer ?? false} />
          )}
          {message.content && (
            <button
              type='button'
              onClick={handleCopy}
              className='ml-auto inline-flex items-center gap-1 rounded p-1 text-[10.5px] text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground group-hover:opacity-100'
              aria-label='Copy answer'
              title='Copy (giữ định dạng cho Word)'
            >
              {copied ? (
                <IconCheck className='size-3.5 text-primary' />
              ) : (
                <IconCopy className='size-3.5' />
              )}
            </button>
          )}
        </div>
      </div>
      {message.citations && message.citations.length > 0 && (
        <CitationList citations={message.citations} onJumpToPage={onJumpToPage} />
      )}
    </div>
  );
}

function CitationList({
  citations,
  onJumpToPage
}: {
  citations: AskCitation[];
  onJumpToPage: (page: number) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className='rounded-md border border-border bg-muted/30 px-2.5 py-1.5'
    >
      <CollapsibleTrigger className='flex w-full items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground'>
        <IconChevronRight
          className={cn('size-3 transition-transform', open && 'rotate-90')}
          aria-hidden
        />
        {citations.length} trích nguồn
      </CollapsibleTrigger>
      <CollapsibleContent className='mt-2 space-y-1.5'>
        {citations.map((c) => (
          <button
            key={c.chunkId}
            type='button'
            onClick={() => onJumpToPage(c.page)}
            className='flex w-full gap-2 rounded p-1 text-left transition-colors hover:bg-muted'
            title={`Tới trang ${c.page}`}
          >
            <span className='h-fit shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-[10.5px] font-medium text-primary'>
              [{c.idx}]
            </span>
            <span className='min-w-0 flex-1'>
              <span className='block text-[10.5px] text-muted-foreground'>
                Trang {c.page}
                {c.section ? ` · ${c.section}` : ''}
              </span>
              <span className='line-clamp-2 text-[11.5px] italic text-muted-foreground'>
                &ldquo;{c.snippet}&rdquo;
              </span>
            </span>
          </button>
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}
