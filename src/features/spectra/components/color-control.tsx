'use client';

/**
 * ColorControl — Origin-style colour picker for a single line colour.
 * Quick swatches + hex text input + native colour wheel + one-click
 * scientific palettes (colorblind-safe). Controlled: value + onChange.
 *
 * @phase R206 (Figure Studio)
 */

import { useState } from 'react';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  isValidHex,
  LINE_COLOR_SWATCHES,
  SCIENTIFIC_PALETTES
} from '@/features/spectra/figure-config';

interface ColorControlProps {
  value: string;
  onChange: (hex: string) => void;
}

export function ColorControl({ value, onChange }: ColorControlProps) {
  // Local draft for the hex input so partial typing ("#1f4") doesn't reset.
  const [draft, setDraft] = useState(value);

  const commitHex = (raw: string) => {
    setDraft(raw);
    if (isValidHex(raw)) onChange(raw.trim());
  };

  return (
    <div className='space-y-3'>
      <div className='space-y-1.5'>
        <Label className='text-muted-foreground text-xs'>Line color</Label>
        <div className='flex items-center gap-2'>
          {/* Native colour wheel */}
          <input
            type='color'
            aria-label='Color wheel'
            value={isValidHex(value) ? value : '#1f4e9c'}
            onChange={(e) => {
              setDraft(e.target.value);
              onChange(e.target.value);
            }}
            className='size-8 cursor-pointer rounded border border-border bg-transparent p-0.5'
          />
          {/* Hex input */}
          <Input
            value={draft}
            onChange={(e) => commitHex(e.target.value)}
            placeholder='#1f4e9c'
            spellCheck={false}
            className='h-8 w-28 font-mono text-xs'
          />
        </div>
        {/* Quick swatches */}
        <div className='flex gap-2 pt-1'>
          {LINE_COLOR_SWATCHES.map((c) => (
            <button
              key={c}
              type='button'
              aria-label={`Color ${c}`}
              onClick={() => {
                setDraft(c);
                onChange(c);
              }}
              className='size-6 rounded-full border-2 transition'
              style={{
                backgroundColor: c,
                borderColor:
                  value.toLowerCase() === c.toLowerCase() ? 'hsl(var(--ring))' : 'transparent'
              }}
            />
          ))}
        </div>
      </div>

      {/* Scientific palettes — pick a colorblind-safe / print-ready primary */}
      <div className='space-y-1.5'>
        <Label className='text-muted-foreground text-xs'>Scientific palettes</Label>
        <div className='space-y-2'>
          {Object.entries(SCIENTIFIC_PALETTES).map(([key, palette]) => (
            <div key={key} className='space-y-1'>
              <span className='text-[11px] text-muted-foreground'>{palette.label}</span>
              <div className='flex gap-1'>
                {palette.colors.map((c) => (
                  <button
                    key={c}
                    type='button'
                    aria-label={`${palette.label} ${c}`}
                    onClick={() => {
                      setDraft(c);
                      onChange(c);
                    }}
                    className='size-5 rounded-sm border transition hover:scale-110'
                    style={{
                      backgroundColor: c,
                      borderColor:
                        value.toLowerCase() === c.toLowerCase()
                          ? 'hsl(var(--ring))'
                          : 'hsl(var(--border))'
                    }}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
