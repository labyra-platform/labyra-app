/**
 * CompositionField — field array for declaring multi-phase sample composition.
 *
 * Each row: formula + role + nominalFraction.
 * Add/remove rows via buttons.
 * Each formula triggers MaterialKnowledgePanel preview if it matches a known material.
 *
 * UI standards (R169 skills):
 *   - 44px touch targets on action buttons
 *   - Semantic Tailwind tokens only
 *   - shadcn Form/FormField pattern
 *   - WCAG AA contrast
 *
 * @phase R185-4b-sample-composition-ui
 */
'use client';

import { IconPlus, IconTrash } from '@tabler/icons-react';
import { useFieldArray, type UseFormReturn } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import type { SampleFormValues } from '../schema';

const ROLES: Array<{
  value: SampleFormValues['composition'] extends (infer T)[] | undefined
    ? T extends { role: infer R }
      ? R
      : never
    : never;
  labelKey: string;
}> = [
  { value: 'matrix' as const, labelKey: 'matrix' },
  { value: 'core' as const, labelKey: 'core' },
  { value: 'active' as const, labelKey: 'active' },
  { value: 'shell' as const, labelKey: 'shell' },
  { value: 'support' as const, labelKey: 'support' },
  { value: 'filler' as const, labelKey: 'filler' },
  { value: 'dopant' as const, labelKey: 'dopant' },
  { value: 'substrate' as const, labelKey: 'substrate' }
];

interface CompositionFieldProps {
  form: UseFormReturn<SampleFormValues>;
}

export function CompositionField({ form }: CompositionFieldProps) {
  const t = useTranslations('samples.composition');
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'composition'
  });

  return (
    <div className='space-y-3'>
      <div className='flex items-start justify-between gap-4 flex-wrap'>
        <div>
          <p className='text-sm font-medium'>{t('title')}</p>
          <p className='text-xs text-muted-foreground mt-0.5'>{t('description')}</p>
        </div>
        <Button
          type='button'
          variant='outline'
          size='sm'
          onClick={() => append({ formula: '', role: 'matrix', nominalFraction: undefined })}
          className='min-h-[36px]'
        >
          <IconPlus className='h-4 w-4 mr-1' aria-hidden='true' />
          {t('addComponent')}
        </Button>
      </div>

      {fields.length === 0 ? (
        <p className='text-xs text-muted-foreground italic py-3'>{t('emptyHint')}</p>
      ) : (
        <div className='space-y-3'>
          {fields.map((field, index) => (
            <div
              key={field.id}
              className='grid grid-cols-1 md:grid-cols-[1.5fr_1fr_0.8fr_auto] gap-3 items-start p-3 rounded-md border border-border bg-muted/20'
            >
              <FormField
                control={form.control}
                name={`composition.${index}.formula`}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className='text-xs'>{t('formula')}</FormLabel>
                    <FormControl>
                      <Input placeholder='e.g. MoS2, WO3, C' className='font-mono' {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name={`composition.${index}.role`}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className='text-xs'>{t('role')}</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {ROLES.map((r) => (
                          <SelectItem key={String(r.value)} value={String(r.value)}>
                            {t(`roles.${r.labelKey}`)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name={`composition.${index}.nominalFraction`}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className='text-xs'>{t('fraction')}</FormLabel>
                    <FormControl>
                      <Input
                        type='number'
                        step='0.01'
                        min='0'
                        max='1'
                        placeholder='0–1'
                        {...field}
                        value={field.value ?? ''}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className='flex items-end pt-5'>
                <Button
                  type='button'
                  variant='ghost'
                  size='icon'
                  onClick={() => remove(index)}
                  aria-label={t('removeAria', { index: index + 1 })}
                  className='min-w-[44px] min-h-[44px] text-destructive hover:text-destructive hover:bg-destructive/10'
                >
                  <IconTrash className='h-4 w-4' aria-hidden='true' />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <FormField
        control={form.control}
        name='compositeType'
        render={({ field }) => (
          <FormItem className='max-w-xs'>
            <FormLabel className='text-xs'>{t('compositeType')}</FormLabel>
            <Select value={field.value ?? ''} onValueChange={field.onChange}>
              <FormControl>
                <SelectTrigger>
                  <SelectValue placeholder={t('compositeTypePlaceholder')} />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                <SelectItem value='single-phase'>{t('compositeTypes.single-phase')}</SelectItem>
                <SelectItem value='heterostructure'>
                  {t('compositeTypes.heterostructure')}
                </SelectItem>
                <SelectItem value='doped'>{t('compositeTypes.doped')}</SelectItem>
                <SelectItem value='mixed-phase'>{t('compositeTypes.mixed-phase')}</SelectItem>
                <SelectItem value='core-shell'>{t('compositeTypes.core-shell')}</SelectItem>
                <SelectItem value='composite'>{t('compositeTypes.composite')}</SelectItem>
              </SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );
}
