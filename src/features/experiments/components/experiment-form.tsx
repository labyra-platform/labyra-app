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
import type { Experiment } from '@/types/experiments';
import { type ExperimentFormValues, experimentFormSchema } from '../schema';

interface ExperimentFormProps {
  defaultValues?: Partial<Experiment>;
  experimentId?: string;
  onSuccess?: () => void;
  onCancel?: () => void;
}

const TYPES = ['synthesis', 'characterization', 'measurement', 'analysis', 'other'] as const;
const STATUSES = ['planned', 'running', 'completed', 'failed', 'cancelled'] as const;

export function ExperimentForm({
  defaultValues,
  experimentId,
  onSuccess,
  onCancel
}: ExperimentFormProps) {
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations('experiments.form');
  const tType = useTranslations('experiments.type');
  const tStatus = useTranslations('experiments.status');
  const [submitting, setSubmitting] = useState(false);

  const form = useForm<ExperimentFormValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(experimentFormSchema) as any,
    defaultValues: {
      experimentCode: defaultValues?.experimentCode ?? '',
      title: defaultValues?.title ?? '',
      description: defaultValues?.description ?? '',
      experimentType: defaultValues?.experimentType ?? 'measurement',
      workflowStatus: defaultValues?.workflowStatus ?? 'planned',
      equipmentUsed: defaultValues?.equipmentUsed ?? [],
      temperature: defaultValues?.temperature,
      pressure: defaultValues?.pressure,
      duration: defaultValues?.duration,
      notes: defaultValues?.notes ?? ''
    }
  });

  const onSubmit = async (values: ExperimentFormValues) => {
    setSubmitting(true);
    try {
      const user = getFirebaseAuth().currentUser;
      if (!user) throw new Error('not_authenticated');
      const token = await user.getIdToken();
      const url = experimentId ? `/api/experiments/${experimentId}` : '/api/experiments';
      const method = experimentId ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${token}`
        },
        body: JSON.stringify(values)
      });
      if (!res.ok) throw new Error(await res.text());
      toast.success(experimentId ? t('update') : t('create'));
      if (onSuccess) {
        onSuccess();
      } else {
        router.push(`/${locale}/dashboard/experiments`);
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
            name='experimentCode'
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
            name='experimentType'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('type')} *</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {TYPES.map((tp) => (
                      <SelectItem key={tp} value={tp}>
                        {tType(tp)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name='title'
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('title')} *</FormLabel>
              <FormControl>
                <Input placeholder={t('titlePlaceholder')} {...field} />
              </FormControl>
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
                <Textarea rows={2} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className='grid grid-cols-1 gap-4 md:grid-cols-3'>
          <FormField
            control={form.control}
            name='temperature'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('temperature')}</FormLabel>
                <FormControl>
                  <Input type='number' step='any' {...field} value={field.value ?? ''} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name='pressure'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('pressure')}</FormLabel>
                <FormControl>
                  <Input type='number' step='any' {...field} value={field.value ?? ''} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name='duration'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('duration')}</FormLabel>
                <FormControl>
                  <Input type='number' step='any' {...field} value={field.value ?? ''} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name='workflowStatus'
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
                <Textarea rows={4} {...field} />
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
            {submitting ? t('saving') : experimentId ? t('update') : t('create')}
          </Button>
        </div>
      </form>
    </Form>
  );
}
