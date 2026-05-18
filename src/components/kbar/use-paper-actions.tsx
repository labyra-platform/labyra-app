'use client';

/**
 * R180-2: kbar dynamic actions for paper search.
 *
 * Subscribes to top 30 recent active papers and registers each as a
 * kbar action under the "Papers" section. Title is searched by kbar's
 * built-in match. Selecting jumps to /dashboard/papers/{id}.
 *
 * @phase R180-2
 * @r180-applied
 */
import { useRegisterActions } from 'kbar';
import { useParams, useRouter } from 'next/navigation';
import { useMemo } from 'react';
import { usePapers } from '@/lib/firestore/queries/papers';

export function usePaperActions() {
  const router = useRouter();
  const params = useParams();
  const locale = (params?.locale as string) ?? 'en';
  const { papers } = usePapers();

  const actions = useMemo(() => {
    // Limit to top 30 most-recent to avoid kbar lag with hundreds of papers
    const top = (papers ?? []).filter((p) => p.lifecycleStatus !== 'deprecated').slice(0, 30);

    return top.map((paper) => ({
      id: `paper-${paper.id}`,
      name: paper.title || 'Untitled',
      keywords: [paper.title, ...(paper.authors ?? []), paper.doi ?? '', paper.journal ?? '']
        .filter(Boolean)
        .join(' '),
      section: 'Papers',
      subtitle: [paper.year > 0 ? String(paper.year) : null, paper.authors?.[0], paper.journal]
        .filter(Boolean)
        .join(' · '),
      perform: () => router.push(`/${locale}/dashboard/papers/${paper.id}`)
    }));
  }, [papers, router, locale]);

  useRegisterActions(actions, [actions]);
}
