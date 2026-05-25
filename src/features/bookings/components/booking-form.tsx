'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { IconWand } from '@tabler/icons-react';
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
import { useIsAdmin } from '@/lib/auth/use-claims';
import type { Booking } from '@/types/bookings';
import { MAX_DURATION_MS, isEquipmentBookable } from '../constants';
import { type BookingFormValues, bookingFormSchema } from '../schema';
import { DateTimePicker } from './datetime-picker';

interface BookingFormProps {
  defaultValues?: Partial<Booking>;
  bookingId?: string;
}

const STATUSES = ['pending', 'approved', 'in_progress', 'completed', 'cancelled'] as const;

// Map schema refine keys -> i18n. Keeps schema messages stable (shared w/ server).
const ERROR_KEYS = new Set(['too_short', 'too_long', 'too_far_ahead']);

// Quick-duration presets (minutes). All within MAX_DURATION_MS.
const DURATION_TAGS = [30, 60, 120, 240, 480] as const;

// Live status dots for the equipment dropdown.
const eqDotColor: Record<string, string> = {
  available: 'bg-green-500',
  in_use: 'bg-blue-500',
  maintenance: 'bg-amber-500',
  broken: 'bg-red-500',
  retired: 'bg-zinc-400'
};

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

export function BookingForm({ defaultValues, bookingId }: BookingFormProps) {
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations('bookings.form');
  const tStatus = useTranslations('bookings.status');
  const { equipment } = useEquipmentList();
  const isAdmin = useIsAdmin();
  const [submitting, setSubmitting] = useState(false);
  const [finding, setFinding] = useState(false);

  // Translate known schema error keys; pass through anything else.
  const errText = (msg: string | undefined): string | undefined =>
    msg && ERROR_KEYS.has(msg) ? t(`err.${msg}`) : msg;

  // Set endAt = startAt + minutes (clamped to MAX_DURATION_MS).
  const setDuration = (minutes: number) => {
    const start = form.getValues('startAt');
    const ms = Math.min(minutes * 60_000, MAX_DURATION_MS);
    form.setValue('endAt', start + ms, { shouldDirty: true, shouldValidate: true });
  };

  const form = useForm<BookingFormValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(bookingFormSchema) as any,
    defaultValues: {
      equipmentId: defaultValues?.equipmentId ?? '',
      equipmentName: defaultValues?.equipmentName ?? '',
      startAt: defaultValues?.startAt ?? Date.now(),
      endAt: defaultValues?.endAt ?? Date.now() + 60 * 60 * 1000,
      purpose: defaultValues?.purpose ?? '',
      status: defaultValues?.status ?? 'approved',
      notes: defaultValues?.notes ?? ''
    }
  });

  async function handleFindSlot() {
    const equipmentId = form.getValues('equipmentId');
    if (!equipmentId) {
      toast.warning(t('selectEquipmentFirst'));
      return;
    }
    setFinding(true);
    try {
      const start = form.getValues('startAt');
      const end = form.getValues('endAt');
      const durationMin = Math.max(Math.round((end - start) / 60000), 30);
      const day = new Date(start);
      const dateStr = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
      const tzOffsetMin = day.getTimezoneOffset();
      const res = await authedFetch(
        `/api/bookings/available?equipmentId=${equipmentId}&date=${dateStr}&durationMin=${durationMin}&tzOffsetMin=${tzOffsetMin}`
      );
      const data = (await res.json()) as { slots: Array<{ startAt: number; endAt: number }> };
      // Pick the first slot at/after the currently chosen start time.
      const slot = data.slots.find(
        (s) => s.endAt - s.startAt >= durationMin * 60000 && s.endAt > Date.now()
      );
      if (!slot) {
        toast.warning(t('noSlotFound'));
        return;
      }
      const slotStart = Math.max(slot.startAt, Date.now());
      form.setValue('startAt', slotStart, { shouldDirty: true });
      form.setValue('endAt', slotStart + durationMin * 60000, { shouldDirty: true });
      toast.success(t('slotFound'));
    } catch {
      toast.error(t('findSlotFailed'));
    } finally {
      setFinding(false);
    }
  }

  const onSubmit = async (values: BookingFormValues) => {
    setSubmitting(true);
    try {
      const equip = equipment.find((e) => e.id === values.equipmentId);
      const payload = { ...values, equipmentName: equip?.name ?? values.equipmentName ?? '' };
      const url = bookingId ? `/api/bookings/${bookingId}` : '/api/bookings';
      const method = bookingId ? 'PATCH' : 'POST';
      const res = await authedFetch(url, { method, body: JSON.stringify(payload) });
      if (res.status === 409) {
        const body = (await res.json()) as {
          conflicts?: Array<{ startAt: number; endAt: number }>;
        };
        const c = body.conflicts?.[0];
        if (c) {
          const from = new Date(c.startAt).toLocaleString();
          const to = new Date(c.endAt).toLocaleTimeString();
          toast.error(t('conflictWith', { from, to }));
        } else {
          toast.error(t('conflict'));
        }
        return;
      }
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
      <form onSubmit={form.handleSubmit(onSubmit)} className='max-w-3xl space-y-6'>
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
                  {equipment.map((e) => {
                    const status = (e as { status?: string }).status;
                    const bookable = isEquipmentBookable(status);
                    return (
                      <SelectItem key={e.id} value={e.id} disabled={!bookable}>
                        <span className='flex items-center gap-2'>
                          <span
                            className={`size-2 shrink-0 rounded-full ${eqDotColor[status ?? ''] ?? 'bg-zinc-300'}`}
                          />
                          <span>
                            {e.equipmentCode ?? e.id} — {e.name}
                          </span>
                          {!bookable && (
                            <span className='text-muted-foreground ml-1 text-xs'>
                              ({t('unavailable')})
                            </span>
                          )}
                        </span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className='grid grid-cols-1 gap-4 md:grid-cols-2'>
          <FormField
            control={form.control}
            name='startAt'
            render={({ field, fieldState }) => (
              <FormItem>
                <FormLabel>{t('startAt')} *</FormLabel>
                <FormControl>
                  <DateTimePicker value={field.value} onChange={field.onChange} />
                </FormControl>
                {fieldState.error && (
                  <p className='text-destructive text-sm font-medium'>
                    {errText(fieldState.error.message)}
                  </p>
                )}
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name='endAt'
            render={({ field, fieldState }) => (
              <FormItem>
                <FormLabel>{t('endAt')} *</FormLabel>
                <FormControl>
                  <DateTimePicker value={field.value} onChange={field.onChange} />
                </FormControl>
                {fieldState.error && (
                  <p className='text-destructive text-sm font-medium'>
                    {errText(fieldState.error.message)}
                  </p>
                )}
              </FormItem>
            )}
          />
        </div>

        <div className='flex flex-wrap items-center gap-2'>
          <span className='text-muted-foreground text-xs'>{t('quickDuration')}:</span>
          {DURATION_TAGS.map((min) => (
            <Button
              key={min}
              type='button'
              variant='outline'
              size='sm'
              className='h-7 px-2 text-xs'
              onClick={() => setDuration(min)}
            >
              {min < 60 ? `${min}m` : `${min / 60}h`}
            </Button>
          ))}
          <Button
            type='button'
            variant='outline'
            size='sm'
            className='h-7 px-2 text-xs'
            onClick={() => void handleFindSlot()}
            disabled={finding}
          >
            <IconWand className='mr-1 size-3.5' />
            {finding ? t('finding') : t('findSlot')}
          </Button>
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

        {/* Status only editable by admin when editing; create auto-approves. */}
        {bookingId && isAdmin && (
          <FormField
            control={form.control}
            name='status'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('status')}</FormLabel>
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
        )}

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
