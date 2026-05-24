'use client';

/**
 * Message composer (ADR-036 R200) — Claude-style single rounded container:
 *   [＋ attach] [auto-grow textarea] [send ●]
 * - Send button: muted when empty, primary (active) when text/files present.
 * - Textarea auto-grows from 1 row up to a max, then scrolls.
 * - Image attachments: ＋ button + drag-drop, preview chips with remove.
 * - Enter sends, Shift+Enter newline.
 *
 * Holds File objects locally; actual upload happens in the send handler
 * (use-chat-stream) which has the conversationId.
 */
import { IconPaperclip, IconArrowUp, IconX, IconPhoto } from '@tabler/icons-react';
import { useTranslations } from 'next-intl';
import { type KeyboardEvent, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

const ACCEPT = 'image/png,image/jpeg,image/webp,image/gif';
const ALLOWED = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
const MAX_SIZE = 5 * 1024 * 1024;
const MAX_FILES = 4;

interface PendingFile {
  id: string;
  file: File;
  previewUrl: string;
}

export function MessageInput({
  onSend,
  disabled
}: {
  onSend: (text: string, files: File[]) => void;
  disabled?: boolean;
}) {
  const t = useTranslations('ai');
  const [text, setText] = useState('');
  const [files, setFiles] = useState<PendingFile[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // auto-grow textarea
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`;
  }, [text]);

  // revoke object URLs on unmount
  useEffect(
    () => () => {
      for (const f of files) URL.revokeObjectURL(f.previewUrl);
    },
    [files]
  );

  const canSend = (text.trim().length > 0 || files.length > 0) && !disabled;

  const addFiles = (incoming: FileList | File[]) => {
    const next: PendingFile[] = [];
    for (const file of Array.from(incoming)) {
      if (!ALLOWED.has(file.type)) continue;
      if (file.size > MAX_SIZE) continue;
      next.push({
        id: `${file.name}-${file.size}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        file,
        previewUrl: URL.createObjectURL(file)
      });
    }
    setFiles((prev) => [...prev, ...next].slice(0, MAX_FILES));
  };

  const removeFile = (id: string) => {
    setFiles((prev) => {
      const target = prev.find((f) => f.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((f) => f.id !== id);
    });
  };

  const handleSend = () => {
    if (!canSend) return;
    onSend(
      text.trim(),
      files.map((f) => f.file)
    );
    setText('');
    setFiles([]);
  };

  const handleKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        if (!disabled && e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
      }}
      className={cn(
        'rounded-2xl border bg-background transition-colors',
        dragOver ? 'border-primary ring-2 ring-primary/30' : 'border-input',
        disabled && 'opacity-60'
      )}
    >
      {/* attachment previews */}
      {files.length > 0 && (
        <div className='flex flex-wrap gap-2 p-2 pb-0'>
          {files.map((f) => (
            <div
              key={f.id}
              className='group relative size-16 overflow-hidden rounded-lg border bg-muted'
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={f.previewUrl} alt={f.file.name} className='size-full object-cover' />
              <button
                type='button'
                onClick={() => removeFile(f.id)}
                aria-label={t('attachRemove')}
                className='absolute right-0.5 top-0.5 rounded-full bg-background/80 p-0.5 text-foreground opacity-0 transition-opacity group-hover:opacity-100'
              >
                <IconX className='size-3.5' />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className='flex items-end gap-1.5 p-1.5'>
        <input
          ref={inputRef}
          type='file'
          accept={ACCEPT}
          multiple
          hidden
          aria-label={t('attachAdd')}
          onChange={(e) => {
            if (e.target.files?.length) addFiles(e.target.files);
            e.target.value = '';
          }}
        />
        <button
          type='button'
          onClick={() => inputRef.current?.click()}
          disabled={disabled || files.length >= MAX_FILES}
          aria-label={t('attachAdd')}
          className='flex size-9 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40'
        >
          <IconPaperclip className='size-5' />
        </button>

        <textarea
          ref={taRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKey}
          placeholder={t('placeholder')}
          rows={1}
          aria-label={t('placeholder')}
          disabled={disabled}
          className='max-h-[200px] min-h-[36px] flex-1 resize-none bg-transparent px-1 py-2 text-sm leading-relaxed outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed'
        />

        <button
          type='button'
          onClick={handleSend}
          disabled={!canSend}
          aria-label={t('send')}
          className={cn(
            'flex size-9 shrink-0 items-center justify-center rounded-xl transition-colors',
            canSend
              ? 'bg-primary text-primary-foreground hover:bg-primary/90'
              : 'bg-muted text-muted-foreground'
          )}
        >
          <IconArrowUp className='size-5' />
        </button>
      </div>

      {/* drag hint overlay */}
      {dragOver && (
        <div className='pointer-events-none flex items-center justify-center gap-2 pb-2 text-xs text-primary'>
          <IconPhoto className='size-4' />
          {t('attachDrop')}
        </div>
      )}
    </div>
  );
}
