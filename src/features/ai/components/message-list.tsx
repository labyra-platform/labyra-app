'use client';

import type { AiMessage } from '@/types/ai';
import { MessageBubble } from './message-bubble';
import { useEffect, useRef } from 'react';

export function MessageList({ messages }: { messages: AiMessage[] }) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages]);

  return (
    <div className='flex-1 space-y-4 overflow-y-auto rounded-lg border bg-card p-4'>
      {messages.length === 0 ? (
        <p className='text-muted-foreground py-8 text-center text-sm'>Start a conversation...</p>
      ) : (
        messages.map((m) => <MessageBubble key={m.id} message={m} />)
      )}
      <div ref={endRef} />
    </div>
  );
}
