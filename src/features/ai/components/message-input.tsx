'use client';

import { IconSend } from '@tabler/icons-react';
import { useTranslations } from 'next-intl';
import { type KeyboardEvent, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

export function MessageInput({
  onSend,
  disabled
}: {
  onSend: (text: string) => void;
  disabled?: boolean;
}) {
  const t = useTranslations('ai');
  const [text, setText] = useState('');

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setText('');
  };

  const handleKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className='flex items-end gap-2'>
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKey}
        placeholder={t('placeholder')}
        rows={2}
        className='resize-none'
        disabled={disabled}
      />
      <Button onClick={handleSend} disabled={disabled || !text.trim()} size='icon'>
        <IconSend className='size-4' />
      </Button>
    </div>
  );
}
