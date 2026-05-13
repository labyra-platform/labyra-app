'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useLocale, useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { getAuth } from 'firebase/auth';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { materialFormSchema, type MaterialFormValues } from '../schema';
import type { Material } from '@/types/materials';

interface MaterialFormProps {
  defaultValues?: Partial<Material>;
  materialId?: string;
}

const CATEGORIES = [
  'chemical',
  'reagent',
  'solvent',
  'gas',
  'consumable',
  'equipment',
  'other'
] as const;
const UNITS = ['g', 'kg', 'mg', 'mL', 'L', 'µL', 'mol', 'mmol', 'piece', 'box'] as const;
const HAZARDS = ['none', 'low', 'medium', 'high', 'extreme'] as const;

export function MaterialForm({ defaultValues, materialId }: MaterialFormProps) {
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations('materials.form');
  const tCat = useTranslations('materials.category');
  const tHaz = useTranslations('materials.hazard');
  const [submitting, setSubmitting] = useState(false);

  const form = useForm<MaterialFormValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(materialFormSchema) as any,
    defaultValues: {
      name: defaultValues?.name ?? '',
      formula: defaultValues?.formula ?? '',
      category: defaultValues?.category ?? 'chemical',
      cas: defaultValues?.cas ?? '',
      quantity: defaultValues?.quantity ?? 0,
      unit: defaultValues?.unit ?? 'g',
      location: defaultValues?.location ?? '',
      supplier: defaultValues?.supplier ?? '',
      lotNumber: defaultValues?.lotNumber ?? '',
      hazardLevel: defaultValues?.hazardLevel ?? 'none',
      hazardNotes: defaultValues?.hazardNotes ?? ''
    }
  });

  const onSubmit = async (values: MaterialFormValues) => {
    setSubmitting(true);
    try {
      const user = getAuth().currentUser;
      if (!user) throw new Error('not_authenticated');
      const token = await user.getIdToken();
      const url = materialId ? `/api/materials/${materialId}` : '/api/materials';
      const method = materialId ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify(values)
      });
      if (!res.ok) throw new Error(await res.text());
      toast.success(materialId ? t('update') : t('create'));
      router.push(`/${locale}/dashboard/materials`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className='space-y-6 max-w-3xl'>
        <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
          <FormField
            control={form.control}
            name='name'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('name')} *</FormLabel>
                <FormControl>
                  <Input placeholder={t('namePlaceholder')} {...field} />
                </FormControl>
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
                  <Input placeholder={t('formulaPlaceholder')} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
          <FormField
            control={form.control}
            name='category'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('category')} *</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {tCat(c)}
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
            name='cas'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('cas')}</FormLabel>
                <FormControl>
                  <Input placeholder={t('casPlaceholder')} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name='location'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('location')}</FormLabel>
                <FormControl>
                  <Input placeholder={t('locationPlaceholder')} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
          <FormField
            control={form.control}
            name='quantity'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('quantity')} *</FormLabel>
                <FormControl>
                  <Input type='number' step='any' {...field} />
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
        </div>

        <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
          <FormField
            control={form.control}
            name='supplier'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('supplier')}</FormLabel>
                <FormControl>
                  <Input placeholder={t('supplierPlaceholder')} {...field} />
                </FormControl>
                <FormMessage />
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
                  <Input placeholder={t('lotPlaceholder')} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name='hazardLevel'
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('hazardLevel')} *</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {HAZARDS.map((h) => (
                    <SelectItem key={h} value={h}>
                      {tHaz(h)}
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
          name='hazardNotes'
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('hazardNotes')}</FormLabel>
              <FormControl>
                <Textarea rows={3} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className='flex justify-end gap-2'>
          <Button type='button' variant='outline' onClick={() => router.back()}>
            {t('cancel')}
          </Button>
          <Button type='submit' disabled={submitting}>
            {submitting ? t('saving') : materialId ? t('update') : t('create')}
          </Button>
        </div>
      </form>
    </Form>
  );
}
