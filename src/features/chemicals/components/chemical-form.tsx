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

interface ChemicalFormProps {
  defaultValues?: Partial<Chemical>;
  chemicalId?: string;
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

export function ChemicalForm({ defaultValues, chemicalId }: ChemicalFormProps) {
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
      quantity: defaultValues?.quantity ?? 0,
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
      toast.success('Auto-filled from PubChem');
    } catch {
      toast.error('Lookup failed');
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
      router.push(`/${locale}/dashboard/chemicals`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className='max-w-3xl space-y-6'>
        {/* Identity */}
        <div className='grid grid-cols-1 gap-4 md:grid-cols-2'>
          <FormField
            control={form.control}
            name='chemicalCode'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('code')} *</FormLabel>
                <FormControl>
                  <Input {...field} />
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

        {/* CAS + lookup */}
        <div className='grid grid-cols-1 gap-4 md:grid-cols-2'>
          <FormField
            control={form.control}
            name='casNumber'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('cas')}</FormLabel>
                <div className='flex gap-2'>
                  <FormControl>
                    <Input placeholder='7732-18-5' {...field} />
                  </FormControl>
                  <Button
                    type='button'
                    variant='outline'
                    onClick={() => void handleLookup()}
                    disabled={looking || !field.value}
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
                  <Input className='font-mono' {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* GHS hazards multi-select */}
        <FormItem>
          <FormLabel>{t('hazards')}</FormLabel>
          <div className='flex flex-wrap gap-2'>
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
                      : 'border-input opacity-50 hover:opacity-100'
                  }`}
                >
                  <GhsPictogram code={code} />
                  <span className='hidden sm:inline'>{GHS_LABELS[code]}</span>
                </button>
              );
            })}
          </div>
        </FormItem>

        {/* Inventory */}
        <div className='grid grid-cols-2 gap-4 md:grid-cols-4'>
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
                    {...field}
                    onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
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
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
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
            name='state'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('state')} *</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {STATES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
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

        {/* Quality + sourcing */}
        <div className='grid grid-cols-2 gap-4 md:grid-cols-3'>
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

        {/* Storage */}
        <div className='grid grid-cols-1 gap-4 md:grid-cols-2'>
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
                  <Textarea rows={1} {...field} />
                </FormControl>
              </FormItem>
            )}
          />
        </div>

        <div className='flex gap-2'>
          <Button type='submit' disabled={submitting}>
            {submitting ? '…' : chemicalId ? t('update') : t('create')}
          </Button>
          <Button
            type='button'
            variant='ghost'
            onClick={() => router.push(`/${locale}/dashboard/chemicals`)}
          >
            Cancel
          </Button>
        </div>
      </form>
    </Form>
  );
}
