import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ChatShell } from '@/features/ai/components/chat-shell';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('ai');
  return { title: t('title') };
}

export default function AiAssistantPage() {
  return <ChatShell />;
}
