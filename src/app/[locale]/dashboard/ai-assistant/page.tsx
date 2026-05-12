import { ChatShell } from '@/features/ai/components/chat-shell';
import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('ai');
  return { title: t('title') };
}

export default function AiAssistantPage() {
  return <ChatShell />;
}
