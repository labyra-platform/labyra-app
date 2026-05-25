'use client';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
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
import { getFirebaseAuth } from '@/lib/firebase/client';
import type { Material, MaterialCategory } from '@/types/materials';
import { type MaterialFormValues, materialFormSchema } from '../schema';

interface MaterialFormProps {
  defaultValues?: Partial<Material>;
  materialId?: string;
  /** When provided (e.g. inside a Sheet), called after success instead of navigating. */
  onSuccess?: () => void;
  /** Cancel handler (e.g. close the Sheet). Falls back to router.back(). */
  onCancel?: () => void;
}

const CATEGORIES: MaterialCategory[] = [
  'oxide',
  'sulfide',
  'nitride',
  'carbon',
  'metal',
  'polymer',
  'composite',
  'perovskite',
  'two_dimensional',
  'other'
];

export function MaterialForm({
  defaultValues,
  materialId,
  onSuccess,
  onCancel
}: MaterialFormProps) {
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations('materials.form');
  const tCat = useTranslations('materials.category');
  const [submitting, setSubmitting] = useState(false);

  const form = useForm<MaterialFormValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(materialFormSchema) as any,
    defaultValues: {
      name: defaultValues?.name ?? '',
      formula: defaultValues?.formula ?? '',
      category: defaultValues?.category ?? 'oxide',
      description: defaultValues?.description ?? ''
    }
  });

  const onSubmit = async (values: MaterialFormValues) => {
    setSubmitting(true);
    try {
      const user = getFirebaseAuth().currentUser;
      if (!user) throw new Error('not_authenticated');
      const token = await user.getIdToken();
      const url = materialId ? `/api/materials/${materialId}` : '/api/materials';
      const method = materialId ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${token}`
        },
        body: JSON.stringify(values)
      });
      if (!res.ok) throw new Error(await res.text());
      toast.success(materialId ? t('update') : t('create'));
      if (onSuccess) {
        onSuccess();
      } else {
        router.push(`/${locale}/dashboard/materials`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className='max-w-3xl space-y-6'>
        <div className='grid grid-cols-1 gap-4 md:grid-cols-2'>
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

        <FormField
          control={form.control}
          name='category'
          render={({ field }) => (
            <FormItem className='max-w-xs'>
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
          name='description'
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('description')}</FormLabel>
              <FormControl>
                <Textarea rows={4} placeholder={t('descriptionPlaceholder')} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className='flex justify-end gap-2'>
          <Button
            type='button'
            variant='outline'
            onClick={() => (onCancel ? onCancel() : router.back())}
          >
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
