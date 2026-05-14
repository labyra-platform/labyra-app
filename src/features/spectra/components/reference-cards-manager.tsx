// R164-phase-6b: fetch URL migrated /api/reference-cards → /api/references
// R163-4c-2-narrow-manager
/**
 * ReferenceCardsManager — list tenant's reference cards with toggle + delete.
 *
 * @phase R160-spectra-4a-pdf
 */
'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { getFirebaseAuth } from '@/lib/firebase/client';
import { SciText } from '@/features/spectra/utils/format-units';
import type { ReferenceCard } from '@/types/spectra';

interface ReferenceCardsManagerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cards: ReferenceCard[];
  activeIds: string[];
  onToggle: (id: string) => void;
  onChanged: () => void;
}

export function ReferenceCardsManager({
  open,
  onOpenChange,
  cards,
  activeIds,
  onToggle,
  onChanged
}: ReferenceCardsManagerProps) {
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this reference card permanently?')) return;
    setDeletingId(id);
    try {
      const user = getFirebaseAuth().currentUser;
      if (!user) throw new Error('Not authenticated');
      const token = await user.getIdToken();
      const res = await fetch(`/api/references/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Delete failed');
      toast.success('Reference card deleted');
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='max-w-2xl max-h-[85vh] overflow-y-auto'>
        <DialogHeader>
          <DialogTitle>Reference Cards</DialogTitle>
        </DialogHeader>

        {cards.length === 0 ? (
          <div className='py-8 text-center text-sm text-muted-foreground'>
            No reference cards yet. Use "+ Add reference" to create one.
          </div>
        ) : (
          <div className='space-y-2'>
            {cards.map((card) => (
              <div key={card.id} className='flex items-center gap-3 rounded-md border bg-card p-3'>
                <Checkbox
                  checked={activeIds.includes(card.id)}
                  onCheckedChange={() => onToggle(card.id)}
                  id={`ref-toggle-${card.id}`}
                />
                <div className='flex-1 min-w-0'>
                  <div className='flex flex-wrap items-baseline gap-x-3 gap-y-1'>
                    <span className='font-medium text-sm'>
                      <SciText>{card.phaseName}</SciText>
                    </span>
                    <span className='text-xs text-muted-foreground'>{card.cardNumber}</span>
                  </div>
                  <div className='flex flex-wrap gap-x-3 text-xs text-muted-foreground'>
                    {card.formula && (
                      <span>
                        Formula: <SciText>{card.formula}</SciText>
                      </span>
                    )}
                    {card.spectrumType === 'xrd' && card.anode && <span>Anode: {card.anode}</span>}
                    <span>{card.peaks.length} peaks</span>
                  </div>
                </div>
                <Button
                  variant='ghost'
                  size='sm'
                  onClick={() => handleDelete(card.id)}
                  disabled={deletingId === card.id}
                >
                  {deletingId === card.id ? '...' : 'Delete'}
                </Button>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
