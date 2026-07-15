'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { IconSearch } from '@tabler/icons-react';
import { getFirebaseAuth } from '@/lib/firebase/client';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { GhsPictogram } from '@/components/chemicals/ghs-pictogram';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { GHS_LABELS, type Chemical, type GHSPictogram } from '@/types/chemical';
import { type ChemicalFormValues, chemicalFormSchema } from '../schema';

const ALL_GHS: GHSPictogram[] = [
  'GHS01',
  'GHS02',
  'GHS03',
  'GHS04',
  'GHS05',
  'GHS06',
  'GHS07',
  'GHS08',
  'GHS09'
];
const UNITS = ['g', 'kg', 'mg', 'mL', 'L', 'mol', 'mmol', 'piece'] as const;
const STATES = ['solid', 'liquid', 'gas'] as const;
/** R504: CAS is digits + hyphens only (7732-18-5). Keystrokes outside that set
 *  never reach the field, so the format error can't be typed in the first
 *  place — the zod rule stays as the submit-time backstop. */
const CAS_ALLOWED_RE = /[^\d-]/g;
/** Same shape the zod schema and the lookup API enforce (7732-18-5). */
const CAS_VALID_RE = /^\d{2,7}-\d{2}-\d$/;

/** R504: one titled zone of the form. Image-4 grouping: identity → safety →
 *  inventory, separated so the panel reads as three short forms, not one long
 *  column of unrelated fields. */
function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className='border-border space-y-4 border-t pt-5 first:border-t-0 first:pt-0'>
      <h3 className='text-muted-foreground text-xs font-semibold tracking-wide uppercase'>
        {title}
      </h3>
      {children}
    </section>
  );
}

interface ChemicalFormProps {
  defaultValues?: Partial<Chemical>;
  chemicalId?: string;
  onSuccess?: () => void;
  onCancel?: () => void;
}

async function authedFetch(path: string, init?: RequestInit): Promise<Response> {
  const user = getFirebaseAuth().currentUser;
  if (!user) throw new Error('not_authenticated');
  const token = await user.getIdToken();
  return fetch(path, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      ...(init?.body ? { 'content-type': 'application/json' } : {}),
      ...init?.headers
    }
  });
}

export function ChemicalForm({
  defaultValues,
  chemicalId,
  onSuccess,
  onCancel
}: ChemicalFormProps) {
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations('chemicals.form');
  const [submitting, setSubmitting] = useState(false);
  const [looking, setLooking] = useState(false);

  const form = useForm<ChemicalFormValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(chemicalFormSchema) as any,
    defaultValues: {
      chemicalCode: defaultValues?.chemicalCode ?? '',
      name: defaultValues?.name ?? '',
      casNumber: defaultValues?.casNumber ?? '',
      formula: defaultValues?.formula ?? '',
      ghsHazards: defaultValues?.ghsHazards ?? [],
      hazardStatements: defaultValues?.hazardStatements ?? [],
      signalWord: defaultValues?.signalWord,
      purity: defaultValues?.purity ?? '',
      grade: defaultValues?.grade ?? '',
      manufacturer: defaultValues?.manufacturer ?? '',
      catalogNumber: defaultValues?.catalogNumber ?? '',
      lotNumber: defaultValues?.lotNumber ?? '',
      // R504: no phantom 0 — an untouched field must fail validation,
      // not silently book a zero-quantity chemical into the inventory.
      quantity: defaultValues?.quantity,
      unit: defaultValues?.unit ?? 'g',
      state: defaultValues?.state ?? 'solid',
      reorderThreshold: defaultValues?.reorderThreshold,
      location: defaultValues?.location ?? '',
      storageConditions: defaultValues?.storageConditions ?? '',
      expiryAt: defaultValues?.expiryAt
    }
  });

  const selectedHazards = form.watch('ghsHazards') ?? [];

  function toggleHazard(code: GHSPictogram) {
    const current = form.getValues('ghsHazards') ?? [];
    const next = current.includes(code) ? current.filter((c) => c !== code) : [...current, code];
    form.setValue('ghsHazards', next, { shouldDirty: true });
  }

  async function handleLookup() {
    const cas = form.getValues('casNumber');
    if (!cas) return;
    setLooking(true);
    try {
      const res = await authedFetch(`/api/chemicals/lookup?cas=${encodeURIComponent(cas)}`);
      const data = (await res.json()) as {
        result: {
          name?: string;
          formula?: string;
          ghsHazards: GHSPictogram[];
          hazardStatements: string[];
          signalWord?: 'Danger' | 'Warning';
        } | null;
        notFound?: boolean;
      };
      if (!data.result) {
        toast.warning(t('casNotFound'));
        return;
      }
      const r = data.result;
      if (r.name && !form.getValues('name')) form.setValue('name', r.name, { shouldDirty: true });
      if (r.formula) form.setValue('formula', r.formula, { shouldDirty: true });
      if (r.ghsHazards.length > 0) form.setValue('ghsHazards', r.ghsHazards, { shouldDirty: true });
      if (r.hazardStatements.length > 0)
        form.setValue('hazardStatements', r.hazardStatements, { shouldDirty: true });
      if (r.signalWord) form.setValue('signalWord', r.signalWord, { shouldDirty: true });
      toast.success(t('lookupSuccess'));
    } catch {
      toast.error(t('lookupFailed'));
    } finally {
      setLooking(false);
    }
  }

  const onSubmit = async (values: ChemicalFormValues) => {
    setSubmitting(true);
    try {
      const url = chemicalId ? `/api/chemicals/${chemicalId}` : '/api/chemicals';
      const method = chemicalId ? 'PATCH' : 'POST';
      const res = await authedFetch(url, { method, body: JSON.stringify(values) });
      if (!res.ok) throw new Error(await res.text());
      toast.success(chemicalId ? t('update') : t('create'));
      if (onSuccess) {
        onSuccess();
      } else {
        router.push(`/${locale}/dashboard/chemicals`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Form {...form}>
      {/* R504: @container, not viewport breakpoints. This form renders inside a
          440px sheet; `md:grid-cols-4` keyed off the viewport packed 4 columns
          into ~95px each on desktop, so labels wrapped to two lines and pushed
          their controls out of alignment with the neighbours. Container queries
          size the grid to the FORM, so it is correct in the sheet and on a wide
          page alike. */}
      <form onSubmit={form.handleSubmit(onSubmit)} className='@container max-w-3xl space-y-6'>
        <FormSection title={t('sectionIdentity')}>
          <div className='grid grid-cols-1 gap-4 @sm:grid-cols-2'>
            <FormField
              control={form.control}
              name='chemicalCode'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('code')} *</FormLabel>
                  <FormControl>
                    <Input placeholder={t('codePlaceholder')} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name='name'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('name')} *</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className='grid grid-cols-1 gap-4 @sm:grid-cols-2'>
            <FormField
              control={form.control}
              name='casNumber'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('cas')}</FormLabel>
                  <div className='flex gap-2'>
                    <FormControl>
                      <Input
                        placeholder='7732-18-5'
                        inputMode='numeric'
                        {...field}
                        onChange={(e) => field.onChange(e.target.value.replace(CAS_ALLOWED_RE, ''))}
                      />
                    </FormControl>
                    <Button
                      type='button'
                      variant='outline'
                      onClick={() => void handleLookup()}
                      // R504: gate on a well-formed CAS. The lookup API rejects
                      // anything else with 400, which surfaced as a misleading
                      // "not found" toast — as if the chemical didn't exist.
                      disabled={looking || !CAS_VALID_RE.test(field.value ?? '')}
                    >
                      <IconSearch className='size-4' />
                      {looking ? t('looking') : t('lookup')}
                    </Button>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name='formula'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('formula')}</FormLabel>
                  <FormControl>
                    <Input className='font-mono' placeholder='NaCl' {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className='grid grid-cols-2 gap-4 @lg:grid-cols-3'>
            <FormField
              control={form.control}
              name='purity'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('purity')}</FormLabel>
                  <FormControl>
                    <Input placeholder='99.9%' {...field} />
                  </FormControl>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name='manufacturer'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('manufacturer')}</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name='lotNumber'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('lotNumber')}</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                </FormItem>
              )}
            />
          </div>
        </FormSection>

        <FormSection title={t('sectionSafety')}>
          <div className='grid grid-cols-2 gap-4 @lg:grid-cols-3'>
            <FormField
              control={form.control}
              name='state'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('state')} *</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className='w-full'>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    {/* R504: the shared SelectContent floors at min-w-[8rem], so a
                        narrow trigger opened a menu wider than itself. Pin both
                        bounds to the trigger width. */}
                    <SelectContent className='w-[var(--radix-select-trigger-width)] min-w-[var(--radix-select-trigger-width)]'>
                      {STATES.map((s) => (
                        <SelectItem key={s} value={s}>
                          {t(`states.${s}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <FormItem>
            <FormLabel>{t('hazards')}</FormLabel>
            {/* R504: aligned grid instead of ragged flex-wrap; unselected
                pictograms go greyscale so the coloured ones read as the answer. */}
            <div className='grid grid-cols-2 gap-2 @lg:grid-cols-3'>
              {ALL_GHS.map((code) => {
                const active = selectedHazards.includes(code);
                return (
                  <button
                    key={code}
                    type='button'
                    onClick={() => toggleHazard(code)}
                    title={GHS_LABELS[code]}
                    aria-pressed={active}
                    className={`flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-xs transition ${
                      active
                        ? 'border-primary bg-primary/5'
                        : 'border-input opacity-60 grayscale hover:opacity-100 hover:grayscale-0'
                    }`}
                  >
                    <GhsPictogram code={code} />
                    <span className='truncate'>{GHS_LABELS[code]}</span>
                  </button>
                );
              })}
            </div>
          </FormItem>
        </FormSection>

        <FormSection title={t('sectionInventory')}>
          <div className='grid grid-cols-2 gap-4 @lg:grid-cols-3'>
            <FormField
              control={form.control}
              name='quantity'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('quantity')} *</FormLabel>
                  <FormControl>
                    <Input
                      type='number'
                      step='any'
                      placeholder={t('quantityPlaceholder')}
                      value={field.value ?? ''}
                      onChange={(e) => {
                        const n = parseFloat(e.target.value);
                        field.onChange(e.target.value === '' || Number.isNaN(n) ? undefined : n);
                      }}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name='unit'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('unit')} *</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className='w-full'>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent className='w-[var(--radix-select-trigger-width)] min-w-[var(--radix-select-trigger-width)]'>
                      {UNITS.map((u) => (
                        <SelectItem key={u} value={u}>
                          {u}
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
              name='reorderThreshold'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('reorderThreshold')}</FormLabel>
                  <FormControl>
                    <Input
                      type='number'
                      step='any'
                      value={field.value ?? ''}
                      onChange={(e) =>
                        field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)
                      }
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className='grid grid-cols-1 gap-4 @sm:grid-cols-2'>
            <FormField
              control={form.control}
              name='location'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('location')}</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name='storageConditions'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('storageConditions')}</FormLabel>
                  <FormControl>
                    <Textarea rows={1} placeholder={t('storagePlaceholder')} {...field} />
                  </FormControl>
                </FormItem>
              )}
            />
          </div>
        </FormSection>

        <div className='flex justify-end gap-2 pt-2'>
          <Button
            type='button'
            variant='outline'
            onClick={() => (onCancel ? onCancel() : router.push(`/${locale}/dashboard/chemicals`))}
          >
            {t('cancel')}
          </Button>
          {/* R504: the button announces the action, not its outcome. It shared
              t('create') with the success toast, so it read "Chemical created"
              / "Đã tạo hóa chất" before anything had been created. */}
          <Button type='submit' disabled={submitting}>
            {submitting ? t('saving') : chemicalId ? t('updateAction') : t('createAction')}
          </Button>
        </div>
      </form>
    </Form>
  );
}
