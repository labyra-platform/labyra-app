/**
 * JobsAutoRefresh — a headless client poller that keeps the server-rendered job
 * status live. While any unit is running or queued it calls router.refresh() on
 * an interval (default 10 s), re-running the Server Component so the pipeline
 * stepper, durations, and results update without a manual reload. It stops as soon
 * as nothing is active, so a page of finished jobs does no polling.
 *
 * The workflow DAG is advanced by Batch → Pub/Sub → /dft/advance server-side; this
 * only re-reads the resulting Firestore state, it does not drive execution.
 *
 * @phase R370-job-streaming
 */
'use client';

import { useEffect } from 'react';
import { useRouter } from '@/i18n/navigation';

export function JobsAutoRefresh({
  active,
  intervalMs = 10000
}: {
  /** True while any job/unit is running or queued. */
  active: boolean;
  intervalMs?: number;
}) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    let stopped = false;
    const id = setInterval(() => {
      // Skip refresh while the tab is hidden — no point re-fetching in the
      // background, and it resumes immediately on focus.
      if (!stopped && document.visibilityState === 'visible') router.refresh();
    }, intervalMs);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, [active, intervalMs, router]);
  return null;
}
