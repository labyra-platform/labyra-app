'use client';
import { zodResolver } from '@hookform/resolvers/zod';
import { getAuth } from 'firebase/auth';
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
import type { Equipment } from '@/types/equipment';
import { type EquipmentFormValues, equipmentFormSchema } from '../schema';

interface EquipmentFormProps {
  defaultValues?: Partial<Equipment>;
  equipmentId?: string;
}

const CATEGORIES = [
  'reactor',
  'measurement',
  'furnace',
  'computer',
  'spectrometer',
  'microscope',
  'other'
] as const;
const STATUSES = ['available', 'in_use', 'maintenance', 'broken', 'retired'] as const;

export function EquipmentForm({ defaultValues, equipmentId }: EquipmentFormProps) {
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations('equipment.form');
  const tCat = useTranslations('equipment.category');
  const tStatus = useTranslations('equipment.status');
  const [submitting, setSubmitting] = useState(false);

  const form = useForm<EquipmentFormValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(equipmentFormSchema) as any,
    defaultValues: {
      equipmentCode: defaultValues?.equipmentCode ?? '',
      name: defaultValues?.name ?? '',
      description: defaultValues?.description ?? '',
      category: defaultValues?.category ?? 'measurement',
      manufacturer: defaultValues?.manufacturer ?? '',
      model: defaultValues?.model ?? '',
      serialNumber: defaultValues?.serialNumber ?? '',
      location: defaultValues?.location ?? '',
      status: defaultValues?.status ?? 'available',
      notes: defaultValues?.notes ?? ''
    }
  });

  const onSubmit = async (values: EquipmentFormValues) => {
    setSubmitting(true);
    try {
      const user = getAuth().currentUser;
      if (!user) throw new Error('not_authenticated');
      const token = await user.getIdToken();
      const url = equipmentId ? `/api/equipment/${equipmentId}` : '/api/equipment';
      const method = equipmentId ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${token}`
        },
        body: JSON.stringify(values)
      });
      if (!res.ok) throw new Error(await res.text());
      toast.success(equipmentId ? t('update') : t('create'));
      router.push(`/${locale}/dashboard/equipment`);
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
            name='equipmentCode'
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
                  <Input placeholder={t('namePlaceholder')} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name='description'
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('description')}</FormLabel>
              <FormControl>
                <Textarea rows={2} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
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
            name='status'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('status')} *</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {tStatus(s)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
          <FormField
            control={form.control}
            name='manufacturer'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('manufacturer')}</FormLabel>
                <FormControl>
                  <Input placeholder={t('manufacturerPlaceholder')} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name='model'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('model')}</FormLabel>
                <FormControl>
                  <Input {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name='serialNumber'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('serialNumber')}</FormLabel>
                <FormControl>
                  <Input {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

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

        <FormField
          control={form.control}
          name='notes'
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('notes')}</FormLabel>
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
            {submitting ? t('saving') : equipmentId ? t('update') : t('create')}
          </Button>
        </div>
      </form>
    </Form>
  );
}
