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
import type { Sample } from '@/types/samples';
import { CompositionField } from './composition-field';
import { useExperiments } from '@/lib/firestore/queries/experiments';
import { type SampleFormValues, sampleFormSchema } from '../schema';

interface SampleFormProps {
  defaultValues?: Partial<Sample>;
  sampleId?: string;
}

const STATUSES = ['prepared', 'in_use', 'consumed', 'archived', 'discarded'] as const;

export function SampleForm({ defaultValues, sampleId }: SampleFormProps) {
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations('samples.form');
  const tStatus = useTranslations('samples.status');
  const [submitting, setSubmitting] = useState(false);
  const { experiments } = useExperiments();

  const form = useForm<SampleFormValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(sampleFormSchema) as any,
    defaultValues: {
      sampleCode: defaultValues?.sampleCode ?? '',
      name: defaultValues?.name ?? '',
      description: defaultValues?.description ?? '',
      experimentId: defaultValues?.experimentId ?? '',
      parentMaterialIds: defaultValues?.parentMaterialIds ?? [],
      mass: defaultValues?.mass,
      volume: defaultValues?.volume,
      concentration: defaultValues?.concentration,
      concentrationUnit: defaultValues?.concentrationUnit ?? '',
      workflowStatus: defaultValues?.workflowStatus ?? 'prepared',
      location: defaultValues?.location ?? '',
      protocol: defaultValues?.protocol ?? '',
      composition: defaultValues?.composition ?? [],
      compositeType: defaultValues?.compositeType ?? undefined
    }
  });

  const onSubmit = async (values: SampleFormValues) => {
    setSubmitting(true);
    try {
      const user = getFirebaseAuth().currentUser;
      if (!user) throw new Error('not_authenticated');
      const token = await user.getIdToken();
      const url = sampleId ? `/api/samples/${sampleId}` : '/api/samples';
      const method = sampleId ? 'PATCH' : 'POST';
      // R185-hotfix3: inject required PROV-O fields for create
      const payload = sampleId
        ? values
        : {
            ...values,
            preparedAt: Date.now(),
            preparedBy: user.uid,
            // R186-2b: PROV-O wasGeneratedBy mirror
            generatedBy: values.experimentId
          };
      const res = await fetch(url, {
        method,
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error(await res.text());
      toast.success(sampleId ? t('update') : t('create'));
      router.push(`/${locale}/dashboard/samples`);
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
            name='sampleCode'
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

        {/* R183-3: Material Knowledge Panel */}

        {/* R186-2b: parent Experiment (PROV-O wasGeneratedBy) — required */}
        <FormField
          control={form.control}
          name='experimentId'
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('experiment') ?? 'Experiment'} *</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue
                      placeholder={
                        t('experimentPlaceholder') ??
                        'Select the experiment that produced this sample'
                      }
                    />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {experiments.length === 0 ? (
                    <div className='px-2 py-1.5 text-xs text-muted-foreground'>
                      {t('noExperiments') ?? 'No experiments yet. Create one first.'}
                    </div>
                  ) : (
                    experiments.map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        <span className='font-mono text-xs'>{e.experimentCode}</span>
                        <span className='ml-2 text-muted-foreground'>{e.title}</span>
                      </SelectItem>
                    ))
                  )}
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
                <Textarea rows={2} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
          <FormField
            control={form.control}
            name='mass'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('mass')}</FormLabel>
                <FormControl>
                  <Input type='number' step='any' {...field} value={field.value ?? ''} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name='volume'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('volume')}</FormLabel>
                <FormControl>
                  <Input type='number' step='any' {...field} value={field.value ?? ''} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name='concentration'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('concentration')}</FormLabel>
                <FormControl>
                  <Input type='number' step='any' {...field} value={field.value ?? ''} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
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

        <FormField
          control={form.control}
          name='protocol'
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('protocol')}</FormLabel>
              <FormControl>
                <Textarea rows={3} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* R185-4b: composition section */}
        <CompositionField form={form} />

        <div className='flex justify-end gap-2'>
          <Button type='button' variant='outline' onClick={() => router.back()}>
            {t('cancel')}
          </Button>
          <Button type='submit' disabled={submitting}>
            {submitting ? t('saving') : sampleId ? t('update') : t('create')}
          </Button>
        </div>
      </form>
    </Form>
  );
}
