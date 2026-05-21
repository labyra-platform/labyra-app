'use client';
import { zodResolver } from '@hookform/resolvers/zod';
import { getFirebaseAuth } from '@/lib/firebase/client';
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
import { useEquipmentList } from '@/lib/firestore/queries/equipment';
import type { Booking } from '@/types/bookings';
import { type BookingFormValues, bookingFormSchema } from '../schema';

interface BookingFormProps {
  defaultValues?: Partial<Booking>;
  bookingId?: string;
}

const STATUSES = ['pending', 'approved', 'in_progress', 'completed', 'cancelled'] as const;

function toLocalInput(ms: number | undefined): string {
  if (!ms) return '';
  const d = new Date(ms);
  // Format YYYY-MM-DDTHH:MM (for datetime-local input)
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInput(s: string): number {
  return new Date(s).getTime();
}

export function BookingForm({ defaultValues, bookingId }: BookingFormProps) {
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations('bookings.form');
  const tStatus = useTranslations('bookings.status');
  const { equipment } = useEquipmentList();
  const [submitting, setSubmitting] = useState(false);

  const form = useForm<BookingFormValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(bookingFormSchema) as any,
    defaultValues: {
      equipmentId: defaultValues?.equipmentId ?? '',
      equipmentName: defaultValues?.equipmentName ?? '',
      startAt: defaultValues?.startAt ?? Date.now(),
      endAt: defaultValues?.endAt ?? Date.now() + 60 * 60 * 1000,
      purpose: defaultValues?.purpose ?? '',
      status: defaultValues?.status ?? 'pending',
      notes: defaultValues?.notes ?? ''
    }
  });

  const onSubmit = async (values: BookingFormValues) => {
    setSubmitting(true);
    try {
      const user = getFirebaseAuth().currentUser;
      if (!user) throw new Error('not_authenticated');
      const token = await user.getIdToken();
      // Denormalize equipment name
      const equip = equipment.find((e) => e.id === values.equipmentId);
      const payload = {
        ...values,
        equipmentName: equip?.name ?? values.equipmentName ?? ''
      };
      const url = bookingId ? `/api/bookings/${bookingId}` : '/api/bookings';
      const method = bookingId ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error(await res.text());
      toast.success(bookingId ? t('update') : t('create'));
      router.push(`/${locale}/dashboard/bookings`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className='space-y-6 max-w-3xl'>
        <FormField
          control={form.control}
          name='equipmentId'
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('equipment')} *</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder={t('selectEquipment')} />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {equipment.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.equipmentCode ?? e.id} — {e.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
          <FormField
            control={form.control}
            name='startAt'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('startAt')} *</FormLabel>
                <FormControl>
                  <Input
                    type='datetime-local'
                    value={toLocalInput(field.value)}
                    onChange={(e) => field.onChange(fromLocalInput(e.target.value))}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name='endAt'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('endAt')} *</FormLabel>
                <FormControl>
                  <Input
                    type='datetime-local'
                    value={toLocalInput(field.value)}
                    onChange={(e) => field.onChange(fromLocalInput(e.target.value))}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name='purpose'
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('purpose')} *</FormLabel>
              <FormControl>
                <Input placeholder={t('purposePlaceholder')} {...field} />
              </FormControl>
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
            {submitting ? t('saving') : bookingId ? t('update') : t('create')}
          </Button>
        </div>
      </form>
    </Form>
  );
}
