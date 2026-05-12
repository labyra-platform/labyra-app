/**
 * Bucket conversations into time groups for sidebar display.
 * Buckets: Today / Yesterday / Last 7 days / Last 30 days / Earlier.
 * @phase R160-ai-2b
 */
import type { AiConversation } from '@/types/ai';

export type TimeGroupKey = 'today' | 'yesterday' | 'last7' | 'last30' | 'earlier';

export interface TimeGroup {
  key: TimeGroupKey;
  conversations: AiConversation[];
}

const ONE_DAY = 24 * 60 * 60 * 1000;

export function groupConversationsByTime(conversations: AiConversation[]): TimeGroup[] {
  const now = Date.now();
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const todayMs = startOfToday.getTime();
  const yesterdayMs = todayMs - ONE_DAY;
  const last7Ms = todayMs - 7 * ONE_DAY;
  const last30Ms = todayMs - 30 * ONE_DAY;

  const buckets: Record<TimeGroupKey, AiConversation[]> = {
    today: [],
    yesterday: [],
    last7: [],
    last30: [],
    earlier: []
  };

  for (const conv of conversations) {
    const t = conv.updatedAt;
    if (t >= todayMs) buckets.today.push(conv);
    else if (t >= yesterdayMs) buckets.yesterday.push(conv);
    else if (t >= last7Ms) buckets.last7.push(conv);
    else if (t >= last30Ms) buckets.last30.push(conv);
    else buckets.earlier.push(conv);
  }

  const order: TimeGroupKey[] = ['today', 'yesterday', 'last7', 'last30', 'earlier'];

  return order
    .filter((k) => buckets[k].length > 0)
    .map((k) => ({ key: k, conversations: buckets[k] }));
}
