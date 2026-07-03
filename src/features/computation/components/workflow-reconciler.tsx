/**
 * WorkflowReconciler — a headless client poller mounted only while a workflow is
 * running. Every 45s it asks the server to reconcile Batch state (catch units
 * stuck in QUEUED on unmet quota, or jobs Batch has garbage-collected), and calls
 * router.refresh() when something changed so the server-rendered status updates.
 * Without this, an unprovisionable job leaves the workflow on 'running' forever
 * (no Batch event ever fires).
 *
 * @phase R361-stuck-detection
 */
'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from '@/i18n/navigation';

export function WorkflowReconciler({
  workflowId,
  active
}: {
  workflowId: string;
  active: boolean;
}) {
  const router = useRouter();
  const busy = useRef(false);

  useEffect(() => {
    if (!active) return;
    let stop = false;

    const sweep = async () => {
      if (busy.current) return;
      busy.current = true;
      try {
        const res = await fetch('/api/dft/reconcile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ workflowId })
        });
        if (!stop && res.ok) {
          const data = (await res.json().catch(() => null)) as { changed?: unknown[] } | null;
          if (data?.changed && data.changed.length > 0) router.refresh();
        }
      } catch {
        // transient — try again next interval
      } finally {
        busy.current = false;
      }
    };

    const id = setInterval(() => void sweep(), 45000);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, [active, workflowId, router]);

  return null;
}
