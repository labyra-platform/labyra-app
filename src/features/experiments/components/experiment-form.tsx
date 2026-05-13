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
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { experimentFormSchema, type ExperimentFormValues } from '../schema';
import type { Experiment } from '@/types/experiments';

interface ExperimentFormProps {
  defaultValues?: Partial<Experiment>;
  experimentId?: string;
}

export function ExperimentForm({ defaultValues, experimentId }: ExperimentFormProps) {
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations('experiments');
  const [submitting, setSubmitting] = useState(false);

  const form = useForm<ExperimentFormValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(experimentFormSchema) as any,
    defaultValues: {
      experimentCode: defaultValues?.experimentCode ?? '',
      title: defaultValues?.title ?? '',
      description: defaultValues?.description ?? '',
      experimentType: defaultValues?.experimentType ?? 'measurement',
      status: defaultValues?.status ?? 'planned',
      sampleIds: defaultValues?.sampleIds ?? [],
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
      const user = getAuth().currentUser;
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
      toast.success(experimentId ? t('toastUpdated') : t('toastCreated'));
      router.push(`/${locale}/dashboard/experiments`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('toastUpdated'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className='space-y-4 max-w-2xl'>
      <div className='grid grid-cols-2 gap-4'>
        <div className='space-y-1.5'>
          <Label>Mã *</Label>
          <Input {...form.register('experimentCode')} placeholder='E-2026-001' />
        </div>
        <div className='space-y-1.5'>
          <Label>Loại *</Label>
          <Select
            value={form.watch('experimentType')}
            onValueChange={(v) =>
              form.setValue('experimentType', v as ExperimentFormValues['experimentType'])
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='synthesis'>Synthesis</SelectItem>
              <SelectItem value='characterization'>Characterization</SelectItem>
              <SelectItem value='measurement'>Measurement</SelectItem>
              <SelectItem value='analysis'>Analysis</SelectItem>
              <SelectItem value='other'>Other</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className='space-y-1.5'>
        <Label>Tiêu đề *</Label>
        <Input {...form.register('title')} placeholder='Hydrothermal synthesis of WO3' />
      </div>

      <div className='space-y-1.5'>
        <Label>Mô tả</Label>
        <Textarea {...form.register('description')} rows={2} />
      </div>

      <div className='grid grid-cols-3 gap-4'>
        <div className='space-y-1.5'>
          <Label>Nhiệt độ (°C)</Label>
          <Input type='number' step='any' {...form.register('temperature')} />
        </div>
        <div className='space-y-1.5'>
          <Label>Áp suất</Label>
          <Input type='number' step='any' {...form.register('pressure')} />
        </div>
        <div className='space-y-1.5'>
          <Label>Thời lượng (phút)</Label>
          <Input type='number' step='any' {...form.register('duration')} />
        </div>
      </div>

      <div className='space-y-1.5'>
        <Label>Trạng thái *</Label>
        <Select
          value={form.watch('status')}
          onValueChange={(v) => form.setValue('status', v as ExperimentFormValues['status'])}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='planned'>Planned</SelectItem>
            <SelectItem value='running'>Running</SelectItem>
            <SelectItem value='completed'>Completed</SelectItem>
            <SelectItem value='failed'>Failed</SelectItem>
            <SelectItem value='cancelled'>Cancelled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className='space-y-1.5'>
        <Label>Ghi chú</Label>
        <Textarea {...form.register('notes')} rows={4} />
      </div>

      <div className='flex gap-2 justify-end'>
        <Button
          type='button'
          variant='outline'
          onClick={() => router.push(`/${locale}/dashboard/experiments`)}
        >
          Hủy
        </Button>
        <Button type='submit' disabled={submitting}>
          {submitting ? 'Đang lưu...' : experimentId ? 'Cập nhật' : 'Tạo mới'}
        </Button>
      </div>
    </form>
  );
}
