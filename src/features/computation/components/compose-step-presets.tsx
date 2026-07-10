'use client';

/**
 * Step preset control for the compose node editor — a "favourites" library.
 * Save the current step's parameters under a name, then load them into any step
 * of the same calc type later (quick setup for a similar material/calculation).
 *
 * @phase R280 — step presets
 */
import { IconDeviceFloppy, IconStar, IconTrash } from '@tabler/icons-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { NodeParams } from '@/features/computation/compose-model';
import { useDftStepPresets } from '@/features/computation/use-dft-presets';
import { useTenantId } from '@/lib/auth/use-claims';
import { createDftStepPreset, deleteDftStepPreset } from '@/lib/firestore/queries/dft-presets';
import type { DftCalcType } from '@/types/dft';

export function ComposeStepPresets({
  calcType,
  params,
  onApply
}: {
  calcType: DftCalcType;
  params: NodeParams;
  onApply: (params: NodeParams) => void;
}) {
  const t = useTranslations('computation');
  const tenantId = useTenantId();
  const { presets } = useDftStepPresets();
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);

  const forType = presets.filter((p) => p.calcType === calcType);

  const save = async () => {
    if (!tenantId || !name.trim()) return;
    setSaving(true);
    try {
      await createDftStepPreset(tenantId, name, calcType, params);
      setName('');
    } catch {
      // swallow — rules/network failure; popover stays open for a retry
    } finally {
      setSaving(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant='outline' size='sm' className='h-8 shrink-0 gap-1.5'>
          <IconStar className='size-3.5' />
          {t('presets')}
          {forType.length > 0 ? (
            <span className='text-muted-foreground'>({forType.length})</span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align='end' className='w-72 space-y-3'>
        <div className='space-y-1.5'>
          <p className='text-xs font-medium'>{t('presetSaveTitle')}</p>
          <div className='flex items-center gap-1.5'>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void save();
                }
              }}
              placeholder={t('presetNamePlaceholder')}
              className='h-8 text-sm'
            />
            <Button
              size='sm'
              className='h-8 shrink-0'
              disabled={!name.trim() || saving}
              onClick={() => void save()}
              aria-label={t('presetSave')}
            >
              <IconDeviceFloppy className='size-4' />
            </Button>
          </div>
          <p className='text-[11px] text-muted-foreground'>
            {t('presetSaveHint', { type: calcType })}
          </p>
        </div>

        <div className='space-y-1 border-t pt-2'>
          <p className='text-xs font-medium'>{t('presetLoadTitle', { type: calcType })}</p>
          {forType.length === 0 ? (
            <p className='text-[11px] text-muted-foreground'>{t('presetNone')}</p>
          ) : (
            <div className='max-h-48 space-y-0.5 overflow-y-auto'>
              {forType.map((preset) => (
                <div key={preset.id} className='flex items-center gap-1'>
                  <button
                    type='button'
                    onClick={() => {
                      onApply(preset.params);
                      setOpen(false);
                    }}
                    className='flex-1 truncate rounded px-2 py-1 text-left text-xs hover:bg-muted'
                  >
                    {preset.name}
                  </button>
                  <Button
                    variant='ghost'
                    size='icon'
                    className='size-6 shrink-0 text-muted-foreground'
                    onClick={() => {
                      if (tenantId) void deleteDftStepPreset(tenantId, preset.id);
                    }}
                    aria-label={t('presetDelete')}
                  >
                    <IconTrash className='size-3' />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
