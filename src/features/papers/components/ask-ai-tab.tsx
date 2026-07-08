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
  IconPlayerStopFilled,
  IconPlus,
  IconSparkles,
  IconTrash
} from '@tabler/icons-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { copyPapersRich, renderPapersAnswerHtml } from '@/features/papers/lib/copy-rich';
import type { NumericVerification } from '@/lib/ai/verify/numeric-claims';
import { cn } from '@/lib/utils';
import {
  ASK_META_SENTINEL,
  type AskCitation,
  type AskMessage,
  type AskStreamMeta,
  splitFollowups,
  stripFollowupArtifact
} from '@/features/papers/ask/types';

/**
 * R260: derive a short, distinctive phrase from a citation snippet to flash on
 * the PDF page. The PDF text layer matches per text-item, so a long multi-line
 * snippet won't match — we take the first few words (capped) which usually sit
 * within one line/item and are enough to draw the eye to the cited passage.
 */
function citationPhrase(snippet: string): string {
  const cleaned = snippet.replace(/\s+/g, ' ').trim();
  return cleaned.split(' ').slice(0, 7).join(' ').slice(0, 56).trim();
}

/**
 * R268: a slightly longer preview of the cited chunk for the hover popover
 * (§11 L2). Capped at 15 words so it stays a glance, not a wall of text.
 */
function citationExcerpt(snippet: string): string {
  const words = snippet.replace(/\s+/g, ' ').trim().split(' ');
  return words.length <= 15 ? words.join(' ') : `${words.slice(0, 15).join(' ')}…`;
}

function TrustChip({
  score,
  noAnswer,
  verification
}: {
  score: number;
  noAnswer: boolean;
  verification?: NumericVerification;
}) {
  if (noAnswer) {
    return (
      <span className='inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10.5px] font-medium text-amber-900 dark:bg-amber-950/50 dark:text-amber-200'>
        <IconAlertCircle className='size-3' />
        Không có trong paper
      </span>
    );
  }
  // R416/R417: numeric values checked against the cited chunks — a far more
  // honest signal than the retrieval score, so it takes over the chip.
  // Contradicted (same unit, different value) → red; any unsourced → amber;
  // all found → green.
  if (verification && verification.total > 0) {
    const { verified, contradicted, total } = verification;
    if (contradicted > 0) {
      return (
        <span
          className='inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-[10.5px] font-medium text-rose-900 dark:bg-rose-950/50 dark:text-rose-200'
          title='Có số liệu trong câu trả lời mâu thuẫn với đoạn trích được trích dẫn (đơn vị khớp nhưng giá trị khác)'
        >
          <IconAlertCircle className='size-3' />
          {contradicted}/{total} số liệu mâu thuẫn nguồn
        </span>
      );
    }
    const allOk = verified === total;
    return (
      <span
        className={
          allOk
            ? 'inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10.5px] font-medium text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200'
            : 'inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10.5px] font-medium text-amber-900 dark:bg-amber-950/50 dark:text-amber-200'
        }
        title='Số liệu trong câu trả lời được đối chiếu trực tiếp với đoạn trích được trích dẫn'
      >
        {allOk ? '✓' : <IconAlertCircle className='size-3' />}
        {verified}/{total} số liệu khớp nguồn
      </span>
    );
  }
  // No numeric claims → fall back to retrieval match (labelled as such, not as
  // answer "confidence").
  const pct = Math.round(score * 100);
  if (score >= 0.7) {
    return (
      <span className='inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10.5px] font-medium text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200'>
        ✓ Khớp nguồn tốt · {pct}%
      </span>
    );
  }
  if (score >= 0.5) {
    return (
      <span className='inline-flex items-center gap-1 rounded-full bg-sky-100 px-2 py-0.5 text-[10.5px] font-medium text-sky-900 dark:bg-sky-950/50 dark:text-sky-200'>
        Khớp nguồn · {pct}%
      </span>
    );
  }
  return (
    <span className='inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10.5px] font-medium text-amber-900 dark:bg-amber-950/50 dark:text-amber-200'>
      <IconAlertCircle className='size-3' />
      Khớp nguồn yếu · {pct}%
    </span>
  );
}

interface AskAiTabProps {
  paperId: string;
  /** Called when a citation chip is clicked — viewer jumps to that page. */
  onJumpToPage: (page: number, y?: number, highlight?: string) => void;
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
  const abortRef = useRef<AbortController | null>(null);

  // Restore this paper's saved Ask AI conversation on mount (the backend persists
  // every turn). Best-effort — start empty on failure.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { getFirebaseAuth } = await import('@/lib/firebase/client');
        const user = getFirebaseAuth().currentUser;
        if (!user) return;
        const token = await user.getIdToken();
        const res = await fetch(`/api/papers/${paperId}/ask`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { messages?: AskMessage[] };
        if (!cancelled && Array.isArray(data.messages) && data.messages.length > 0) {
          setMessages(data.messages);
        }
      } catch {
        // ignore — conversation just starts empty
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [paperId]);

  const handleClearChat = useCallback(async () => {
    if (busy || messages.length === 0) return;
    if (!window.confirm('Xóa toàn bộ hội thoại Ask AI của paper này?')) return;
    const snapshot = messages;
    setMessages([]);
    setError(null);
    try {
      const { getFirebaseAuth } = await import('@/lib/firebase/client');
      const user = getFirebaseAuth().currentUser;
      if (!user) throw new Error('not signed in');
      const token = await user.getIdToken();
      const res = await fetch(`/api/papers/${paperId}/ask`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('delete failed');
    } catch {
      setMessages(snapshot);
      setError('Không xóa được hội thoại. Thử lại nhé.');
    }
  }, [busy, messages, paperId]);

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
      if (cite) onJumpToPage(cite.page, undefined, citationPhrase(cite.snippet));
    },
    [onJumpToPage]
  );

  const send = useCallback(
    async (override?: string) => {
      const question = (override ?? input).trim();
      if (!question || busy) return;
      const selectionText = override === undefined ? pinnedSelection : undefined;
      if (override === undefined) setInput('');
      setError(null);
      setBusy(true);
      const controller = new AbortController();
      abortRef.current = controller;

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
          body: JSON.stringify({ question, selectionText }),
          signal: controller.signal
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          const code = (data.error as string) ?? 'ask_failed';
          throw new Error(data.detail ? `${code}: ${data.detail}` : code);
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
          const { answer, questions } = splitFollowups(answerSoFar);
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? {
                    ...m,
                    content: answer.trim(),
                    citations: meta.citations,
                    trustScore: meta.trustScore,
                    verification: meta.verification,
                    noAnswer: meta.noAnswer,
                    suggestedQuestions: questions.length > 0 ? questions : undefined
                  }
                : m
            )
          );
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          // User stopped generation — keep whatever streamed so far, no error.
        } else {
          const msg = err instanceof Error ? err.message : 'ask_failed';
          setError(msg);
          setMessages((prev) => prev.filter((m) => m.id !== assistantId));
        }
      } finally {
        abortRef.current = null;
        setBusy(false);
        inputRef.current?.focus();
      }
    },
    [busy, input, paperId, pinnedSelection, onClearSelection]
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

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
      {!isEmpty && (
        <div className='flex shrink-0 items-center justify-end border-b border-border/50 px-3 py-1.5'>
          <button
            type='button'
            onClick={handleClearChat}
            disabled={busy}
            className='inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-50'
            title='Xóa toàn bộ hội thoại Ask AI của paper này'
          >
            <IconTrash size={13} />
            Xóa hội thoại
          </button>
        </div>
      )}
      {/* Conversation */}
      <div ref={scrollerRef} className='min-h-0 flex-1 space-y-4 overflow-y-auto px-3 py-4 text-sm'>
        {isEmpty && <EmptyState />}
        {messages.map((m, i) =>
          m.role === 'user' ? (
            <UserBubble key={m.id} content={m.content} selectionText={m.selectionText} />
          ) : (
            <AssistantBubble
              key={m.id}
              message={m}
              onAnswerClick={handleAnswerClick(m)}
              onJumpToPage={onJumpToPage}
              onAsk={send}
              isLast={i === messages.length - 1}
            />
          )
        )}
        {error && (
          <div className='rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive'>
            {error === 'cost_guard_blocked'
              ? 'Đã vượt hạn mức Q&A hôm nay. Hãy thử lại vào ngày mai.'
              : error === 'rate_limited'
                ? 'Hỏi quá nhanh — chờ một chút rồi thử lại.'
                : error === 'Not signed in' ||
                    error.startsWith('missing_token') ||
                    error.startsWith('invalid_token') ||
                    error.startsWith('missing_tenant_claim')
                  ? 'Phiên đăng nhập có vấn đề — đăng nhập lại rồi thử lại.'
                  : error.startsWith('retrieval_failed')
                    ? `Không truy xuất được nội dung paper (Voyage embeddings / Pinecone). ${error.includes(':') ? error.slice(error.indexOf(':') + 1).trim() : 'Kiểm tra paper đã xử lý xong + VOYAGE_API_KEY / PINECONE_API_KEY.'}`
                    : `Có lỗi khi gọi AI (${error}). Hãy thử lại.`}
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
              onClick={() => (busy ? stop() : void send())}
              disabled={busy ? false : !input.trim()}
              aria-label={busy ? 'Dừng tạo câu trả lời' : 'Gửi câu hỏi'}
              title={busy ? 'Dừng' : 'Gửi (Enter)'}
              className={cn(
                'flex size-9 shrink-0 items-center justify-center rounded-xl transition-colors',
                !busy && !input.trim()
                  ? 'bg-muted text-muted-foreground'
                  : 'bg-primary text-primary-foreground hover:bg-primary/90'
              )}
            >
              {busy ? (
                <IconPlayerStopFilled className='size-4' />
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
  onJumpToPage,
  onAsk,
  isLast
}: {
  message: AskMessage;
  onAnswerClick: (e: React.MouseEvent<HTMLDivElement>) => void;
  onJumpToPage: (page: number, y?: number, highlight?: string) => void;
  onAsk: (question: string) => void;
  isLast: boolean;
}) {
  const html = useMemo(
    () =>
      renderPapersAnswerHtml(stripFollowupArtifact(message.content), {
        mathAs: 'html',
        citeButtons: true
      }),
    [message.content]
  );
  const [copied, setCopied] = useState(false);
  const [citeHover, setCiteHover] = useState<{
    idx: number;
    excerpt: string;
    page: number;
    section: string;
    top: number;
    left: number;
  } | null>(null);
  const handleAnswerHover = useCallback(
    (e: React.MouseEvent<HTMLDivElement> | React.FocusEvent<HTMLDivElement>) => {
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-cite]');
      if (!btn || !message.citations) {
        setCiteHover(null);
        return;
      }
      const n = Number(btn.dataset.cite);
      setCiteHover((prev) => {
        if (prev?.idx === n) return prev;
        const cite = message.citations?.find((c) => c.idx === n);
        if (!cite) return null;
        const rect = btn.getBoundingClientRect();
        return {
          idx: n,
          excerpt: citationExcerpt(cite.snippet),
          page: cite.page,
          section: cite.section,
          top: rect.bottom + 6,
          left: rect.left
        };
      });
    },
    [message.citations]
  );
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
          onMouseOver={handleAnswerHover}
          onMouseLeave={() => setCiteHover(null)}
          onFocus={handleAnswerHover}
          onBlur={() => setCiteHover(null)}
          className={cn(
            'whitespace-pre-wrap text-sm leading-relaxed text-foreground',
            '[&_sub]:align-sub [&_sub]:text-[0.75em]',
            '[&_sup]:align-super [&_sup]:text-[0.75em]',
            '[&_b]:font-semibold',
            '[&_i]:italic',
            '[&_.katex]:mx-0.5',
            '[&_.ask-cite-btn]:mx-[1.5px] [&_.ask-cite-btn]:-translate-y-1 [&_.ask-cite-btn]:align-top',
            '[&_.ask-cite-btn]:inline-flex [&_.ask-cite-btn]:items-center [&_.ask-cite-btn]:justify-center',
            '[&_.ask-cite-btn]:h-[14px] [&_.ask-cite-btn]:min-w-[14px] [&_.ask-cite-btn]:rounded-full [&_.ask-cite-btn]:px-[3px]',
            '[&_.ask-cite-btn]:bg-primary [&_.ask-cite-btn]:text-primary-foreground',
            '[&_.ask-cite-btn]:text-[8.5px] [&_.ask-cite-btn]:font-bold [&_.ask-cite-btn]:leading-none [&_.ask-cite-btn]:tabular-nums',
            '[&_.ask-cite-btn]:cursor-pointer [&_.ask-cite-btn]:transition-colors [&_.ask-cite-btn]:hover:bg-primary/80',
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
        {citeHover && (
          <div
            className='pointer-events-none fixed z-50 max-w-[280px] rounded-md border bg-popover px-2.5 py-1.5 text-popover-foreground shadow-md'
            style={{ top: citeHover.top, left: citeHover.left }}
          >
            <p className='line-clamp-4 text-xs leading-snug'>{citeHover.excerpt}</p>
            <p className='mt-1 text-[10px] text-muted-foreground'>
              {citeHover.section ? `${citeHover.section} · ` : ''}p. {citeHover.page}
            </p>
          </div>
        )}
        <div className='mt-1 flex items-center gap-2'>
          {(message.trustScore !== undefined || message.noAnswer) && (
            <TrustChip
              score={message.trustScore ?? 0}
              noAnswer={message.noAnswer ?? false}
              verification={message.verification}
            />
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
      {isLast && message.suggestedQuestions && message.suggestedQuestions.length > 0 && (
        <div className='mt-2 flex flex-col gap-1'>
          {message.suggestedQuestions.map((q, i) => (
            <button
              key={i}
              type='button'
              onClick={() => onAsk(q)}
              className='flex items-center gap-1.5 rounded-md border border-border/60 px-2.5 py-1.5 text-left text-[12px] text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-foreground'
            >
              <IconPlus size={13} className='shrink-0 text-primary/60' />
              <span>{q}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function CitationList({
  citations,
  onJumpToPage
}: {
  citations: AskCitation[];
  onJumpToPage: (page: number, y?: number, highlight?: string) => void;
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
            onClick={() => onJumpToPage(c.page, undefined, citationPhrase(c.snippet))}
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
