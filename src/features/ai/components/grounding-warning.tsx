'use client';
/**
 * Grounding warning banner — appears below message when L2/L3 finds issues.
 * Click to open modal with details.
 * @phase R160-ai-5e-1
 */
import { useState } from 'react';
import { IconAlertTriangle, IconX } from '@tabler/icons-react';
import type { NumberMatch, UnsourcedClaim } from '@/lib/ai/grounding';

export interface GroundingDetails {
  unverifiedNumbers: number;
  unsourcedClaims: number;
  details: {
    numbers: NumberMatch[];
    claims: UnsourcedClaim[];
  };
}

export function GroundingWarning({ grounding }: { grounding: GroundingDetails }) {
  const [open, setOpen] = useState(false);
  const total = grounding.unverifiedNumbers + grounding.unsourcedClaims;

  if (total === 0) return null;

  return (
    <>
      <button
        type='button'
        onClick={() => setOpen(true)}
        className='mt-2 flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-700 dark:text-amber-400 hover:bg-amber-500/20 transition-colors'
      >
        <IconAlertTriangle size={14} />
        <span>
          {total} {total === 1 ? 'cảnh báo' : 'cảnh báo'} — Xem chi tiết
        </span>
      </button>

      {open && (
        <div
          className='fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm'
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className='relative w-full max-w-xl max-h-[80vh] overflow-y-auto rounded-xl border bg-card shadow-xl'>
            <div className='sticky top-0 flex items-start justify-between border-b bg-card px-5 py-4'>
              <div className='flex items-center gap-2'>
                <IconAlertTriangle size={18} className='text-amber-500' />
                <h3 className='text-base font-semibold'>Kiểm tra grounding</h3>
              </div>
              <button
                type='button'
                onClick={() => setOpen(false)}
                className='rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground'
              >
                <IconX size={18} />
              </button>
            </div>

            <div className='px-5 py-4 space-y-4'>
              {grounding.details.numbers.length > 0 && (
                <div>
                  <h4 className='text-sm font-semibold mb-2 text-amber-700 dark:text-amber-400'>
                    Số liệu chưa xác thực ({grounding.unverifiedNumbers})
                  </h4>
                  <p className='text-xs text-muted-foreground mb-2'>
                    Các số này không tìm thấy trong nguồn paper retrieve được. AI có thể nhớ sai.
                  </p>
                  <ul className='space-y-1.5'>
                    {grounding.details.numbers.map((n, i) => (
                      <li key={i} className='text-xs bg-muted/50 rounded px-2 py-1.5'>
                        <code className='font-mono text-amber-700 dark:text-amber-400'>
                          {n.raw}
                        </code>
                        <span className='text-muted-foreground ml-2'>...{n.context}...</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {grounding.details.claims.length > 0 && (
                <div>
                  <h4 className='text-sm font-semibold mb-2 text-amber-700 dark:text-amber-400'>
                    Claim không citation ({grounding.unsourcedClaims})
                  </h4>
                  <p className='text-xs text-muted-foreground mb-2'>
                    Các câu chứa thông tin cụ thể (số, tên, năm) nhưng không có chip [N] gần.
                  </p>
                  <ul className='space-y-1.5'>
                    {grounding.details.claims.map((c, i) => (
                      <li key={i} className='text-xs bg-muted/50 rounded px-2 py-1.5'>
                        <span className='font-medium text-amber-700 dark:text-amber-400'>
                          [{c.reason}]
                        </span>
                        <span className='text-muted-foreground ml-2'>{c.sentence}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className='text-xs text-muted-foreground border-t pt-3'>
                Cảnh báo này dựa trên rule-based check. AI có thể vẫn đúng — cross-check với paper
                gốc.
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
