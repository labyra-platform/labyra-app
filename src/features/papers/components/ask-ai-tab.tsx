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
  IconZoomScan,
  IconTrash
} from '@tabler/icons-react';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSelectionActionStore } from '@/features/papers/stores/selection-action-store';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { copyPapersRich, renderPapersAnswerHtml } from '@/features/papers/lib/copy-rich';
import { formatSciNode } from '@/features/spectra/utils/format-units';
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
  // A contiguous run of plain-prose words from the cited chunk, used to flash the
  // cited text in the PDF. cleanSnippet strips LaTeX/HTML; we then skip formula
  // residue (digits, subscripts) so the phrase is prose that matches the PDF text
  // layer verbatim — highlightItemClass needs an exact substring within one item,
  // and a phrase carrying "WO_3"/"E_g" never matches "WO₃"/"E_g" as rendered.
  const words = cleanSnippet(snippet).split(' ');
  const prose: string[] = [];
  for (const w of words) {
    if (w === '' || /[\d_^\\]/.test(w)) {
      if (prose.length >= 3) break;
      prose.length = 0;
      continue;
    }
    prose.push(w);
    if (prose.length >= 6) break;
  }
  return prose.join(' ').slice(0, 48).trim();
}

/**
 * Strip OCR LaTeX/HTML artefacts ($\text{WO}_3$, <sup>[27]</sup>) out of a raw
 * chunk snippet so citation previews read as plain text instead of raw markup.
 */
function cleanSnippet(s: string): string {
  return s
    .replace(/<[^>]+>/g, ' ')
    .replace(/_\{([^}]*)\}/g, '$1') // WO_{2.92} → WO2.92
    .replace(/\^\{([^}]*)\}/g, '$1') // superscript braces
    .replace(/\$\$?/g, '')
    .replace(/\\(?:text|mathrm|mathbf|mathit)\{([^}]*)\}/g, '$1')
    .replace(/\\[a-zA-Z]+/g, ' ')
    .replace(/[{}]/g, '')
    .replace(/_([A-Za-z0-9])/g, '$1') // WO_3 → WO3, E_g → Eg
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * R268: a slightly longer preview of the cited chunk for the hover popover
 * (§11 L2). Capped at 15 words so it stays a glance, not a wall of text.
 */
function citationExcerpt(snippet: string): string {
  const words = cleanSnippet(snippet).split(' ');
  return words.length <= 15 ? words.join(' ') : `${words.slice(0, 15).join(' ')}…`;
}

function TrustChip({
  noAnswer
}: {
  score: number;
  noAnswer: boolean;
  verification?: NumericVerification;
}) {
  const t = useTranslations('papersAsk');
  // Verification / source-match badge removed per product decision; only the
  // critical "not found in the paper" signal remains.
  if (!noAnswer) return null;
  return (
    <span className='inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10.5px] font-medium text-amber-900 dark:bg-amber-950/50 dark:text-amber-200'>
      <IconAlertCircle className='size-3' />
      {t('noAnswerBadge')}
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
  const t = useTranslations('papersAsk');
  const locale = useLocale();
  const [messages, setMessages] = useState<AskMessage[]>([]);
  const [input, setInput] = useState('');

  /**
   * R539: a selection sent from the reader's context menu lands in the box —
   * it does not send itself. The person picked a sentence, not a question;
   * firing a request on their behalf would spend a model call on an intent
   * they have not finished expressing. Quoted so the question stays legible
   * once they type around it.
   */
  const pendingSelection = useSelectionActionStore((s) => s.pending);
  const consumeSelection = useSelectionActionStore((s) => s.consume);
  useEffect(() => {
    if (pendingSelection?.kind !== 'ask') return;
    const intent = consumeSelection();
    if (!intent) return;
    setInput((prev) => `${prev ? `${prev}\n\n` : ''}"${intent.text.trim()}"\n\n`);
  }, [pendingSelection, consumeSelection]);
  const [busy, setBusy] = useState(false);
  const [researchMode, setResearchMode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [figuresByName, setFiguresByName] = useState<Record<string, { url: string; page: number }>>(
    {}
  );

  // Fetch this document's figures (name → signed URL) so the assistant can embed
  // the ones it references with [[FIG:name]] markers.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { getFirebaseAuth } = await import('@/lib/firebase/client');
        const user = getFirebaseAuth().currentUser;
        if (!user) return;
        const token = await user.getIdToken();
        const res = await fetch(`/api/papers/${paperId}/figures`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as {
          figures?: { name: string; page: number; url: string }[];
        };
        if (cancelled) return;
        const map: Record<string, { url: string; page: number }> = {};
        for (const f of data.figures ?? []) map[f.name] = { url: f.url, page: f.page };
        setFiguresByName(map);
      } catch {
        // ignore — figures just won't render inline
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [paperId]);

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
    if (!window.confirm(t('clearConfirm'))) return;
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
      setError(t('clearError'));
    }
  }, [busy, messages, paperId, t]);

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
      const selectionText = override !== undefined || researchMode ? undefined : pinnedSelection;
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
        const res = await fetch(`/api/papers/${paperId}/${researchMode ? 'research' : 'ask'}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(
            researchMode ? { question, locale } : { question, selectionText, locale }
          ),
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
        // R501: flush held-back bytes for an incomplete multi-byte char. The
        // meta frame (citations/trustScore JSON) is at the very tail, so a
        // dropped final byte broke JSON.parse → citations lost → chips missing
        // or misnumbered. Re-parse once the buffer is complete.
        buffer += decoder.decode();
        {
          const sentinelAt = buffer.indexOf(ASK_META_SENTINEL);
          if (sentinelAt !== -1) {
            answerSoFar = buffer.slice(0, sentinelAt);
            try {
              meta = JSON.parse(
                buffer.slice(sentinelAt + ASK_META_SENTINEL.length)
              ) as AskStreamMeta;
            } catch {
              meta = null;
            }
          }
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
    [busy, input, paperId, pinnedSelection, onClearSelection, researchMode, locale]
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
            title={t('clearTitle')}
          >
            <IconTrash size={13} />
            {t('clearButton')}
          </button>
        </div>
      )}
      {/* Conversation */}
      <div ref={scrollerRef} className='min-h-0 flex-1 space-y-4 overflow-y-auto px-3 py-4 text-sm'>
        {isEmpty && <EmptyState onAsk={(q) => void send(q)} />}
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
              figuresByName={figuresByName}
            />
          )
        )}
        {error && (
          <div className='rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive'>
            {error === 'cost_guard_blocked'
              ? t('errRateDaily')
              : error === 'rate_limited'
                ? t('errRateFast')
                : error === 'Not signed in' ||
                    error.startsWith('missing_token') ||
                    error.startsWith('invalid_token') ||
                    error.startsWith('missing_tenant_claim')
                  ? t('errAuth')
                  : error.startsWith('retrieval_failed')
                    ? `${t('errRetrieval')} ${error.includes(':') ? error.slice(error.indexOf(':') + 1).trim() : t('errConfig')}`
                    : t('errGeneric', { error })}
          </div>
        )}
      </div>

      {/* Pinned selection preview */}
      {pinnedSelection && (
        <div className='mx-3 mt-2 rounded-md border-l-2 border-primary/60 bg-muted/40 px-2.5 py-1.5'>
          <div className='mb-0.5 flex items-center justify-between text-[10px] uppercase tracking-wide text-muted-foreground'>
            <span>{t('selectionLabel')}</span>
            <button
              type='button'
              onClick={() => onClearSelection?.()}
              className='hover:text-foreground'
              aria-label={t('clearSelection')}
            >
              {t('clearShort')}
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
            <button
              type='button'
              onClick={() => setResearchMode((v) => !v)}
              disabled={busy}
              aria-pressed={researchMode}
              title={researchMode ? t('researchOnTip') : t('researchOffTip')}
              className={cn(
                'flex size-9 shrink-0 items-center justify-center rounded-xl transition-colors disabled:opacity-50',
                researchMode
                  ? 'bg-primary/15 text-primary'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              <IconZoomScan className='size-4' />
            </button>
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKey}
              placeholder={researchMode ? t('placeholderResearch') : t('placeholderAsk')}
              aria-label={t('questionAria')}
              rows={1}
              disabled={busy}
              className='max-h-[200px] min-h-[36px] flex-1 resize-none bg-transparent px-2 py-2 text-sm leading-relaxed outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed'
            />
            <button
              type='button'
              onClick={() => (busy ? stop() : void send())}
              disabled={busy ? false : !input.trim()}
              aria-label={busy ? t('stopAria') : t('sendAria')}
              title={busy ? t('stopTitle') : t('sendTitle')}
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
        <p className='mt-1.5 px-1 text-[10.5px] text-muted-foreground'>{t('inputFootnote')}</p>
      </div>
    </div>
  );
}

const STARTER_KEYS = ['starter1', 'starter2', 'starter3', 'starter4'] as const;

function EmptyState({ onAsk }: { onAsk: (q: string) => void }) {
  const t = useTranslations('papersAsk');
  return (
    <div className='flex h-full flex-col items-center justify-center gap-3 px-4 text-center text-muted-foreground'>
      <div className='bg-primary/10 text-primary flex size-10 items-center justify-center rounded-full'>
        <IconSparkles className='size-5' />
      </div>
      <p className='text-foreground text-sm font-medium'>{t('emptyTitle')}</p>
      <p className='max-w-sm text-xs leading-relaxed'>{t('emptyDesc')}</p>
      <div className='mt-1 flex w-full max-w-sm flex-col gap-1.5'>
        {STARTER_KEYS.map((k) => {
          const q = t(k);
          return (
            <button
              key={k}
              type='button'
              onClick={() => onAsk(q)}
              className='hover:bg-muted hover:text-foreground rounded-lg border px-3 py-2 text-left text-xs transition-colors'
            >
              {q}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function UserBubble({ content, selectionText }: { content: string; selectionText?: string }) {
  const t = useTranslations('papersAsk');
  return (
    <div className='flex flex-col items-end gap-1.5'>
      {selectionText && (
        <div className='max-w-[88%] rounded-md border-l-2 border-primary/60 bg-muted/40 px-2.5 py-1.5'>
          <div className='mb-0.5 text-[10px] uppercase tracking-wide text-muted-foreground'>
            {t('askAboutSelection')}
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

const FIG_MARKER_RE = /\[\[FIG:([^\]]+)\]\]/g;

/** Pull [[FIG:name]] markers out of the answer, returning the cleaned text and
 *  the de-duplicated figure names the model referenced. */
function stripFigureMarkers(text: string): { text: string; figureNames: string[] } {
  const names: string[] = [];
  const cleaned = text.replace(FIG_MARKER_RE, (_m, name: string) => {
    const n = name.trim();
    if (n && !names.includes(n)) names.push(n);
    return '';
  });
  return { text: cleaned.replace(/\n{3,}/g, '\n\n').trim(), figureNames: names };
}

function AssistantBubble({
  message,
  onAnswerClick,
  onJumpToPage,
  onAsk,
  isLast,
  figuresByName
}: {
  message: AskMessage;
  onAnswerClick: (e: React.MouseEvent<HTMLDivElement>) => void;
  onJumpToPage: (page: number, y?: number, highlight?: string) => void;
  onAsk: (question: string) => void;
  isLast: boolean;
  figuresByName: Record<string, { url: string; page: number }>;
}) {
  const t = useTranslations('papersAsk');
  const { cleanText, figureNames } = useMemo(() => {
    const stripped = stripFigureMarkers(stripFollowupArtifact(message.content));
    return { cleanText: stripped.text, figureNames: stripped.figureNames };
  }, [message.content]);
  const html = useMemo(
    () =>
      renderPapersAnswerHtml(cleanText, {
        mathAs: 'html',
        citeButtons: true
      }),
    [cleanText]
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
          left: Math.max(8, Math.min(rect.left, window.innerWidth - 288))
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
            // R538: -translate-y-0.5, was -1. A 14px chip lifted a full 4px off
            // a 14px line box clears the ascenders and starts reading as part of
            // the line above. Half that still marks it as a superscript and
            // keeps it inside its own line.
            '[&_.ask-cite-btn]:mx-[1.5px] [&_.ask-cite-btn]:-translate-y-0.5 [&_.ask-cite-btn]:align-top',
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
              : `<span class="inline-flex items-center gap-1"><span class="ask-dot">●</span> ${t('searchingInPaper')}</span>`
          }}
        />
        {figureNames.length > 0 && (
          <div className='mt-3 space-y-2'>
            {figureNames.map((name) => {
              const fig = figuresByName[name];
              if (!fig) return null;
              return (
                <button
                  key={name}
                  type='button'
                  onClick={() => onJumpToPage(fig.page)}
                  className='hover:border-primary block w-full overflow-hidden rounded-lg border text-left transition-colors'
                >
                  {/* Signed external URL — next/image isn't a fit for short-lived links. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={fig.url} alt={name} className='bg-muted w-full' loading='lazy' />
                  {fig.page > 0 && (
                    <div className='text-muted-foreground px-2 py-1 text-[10.5px]'>
                      p. {fig.page}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}
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
              aria-label={t('copyAria')}
              title={t('copyTitle')}
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
              <span>{formatSciNode(cleanSnippet(q))}</span>
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
  const t = useTranslations('papersAsk');
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
        {t('citationCount', { count: citations.length })}
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
                &ldquo;{formatSciNode(cleanSnippet(c.snippet))}&rdquo;
              </span>
            </span>
          </button>
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}
