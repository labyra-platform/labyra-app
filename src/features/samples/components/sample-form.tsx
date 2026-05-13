'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useLocale } from 'next-intl';
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
import { sampleFormSchema, type SampleFormValues } from '../schema';
import type { Sample } from '@/types/samples';

interface SampleFormProps {
  defaultValues?: Partial<Sample>;
  sampleId?: string;
}

export function SampleForm({ defaultValues, sampleId }: SampleFormProps) {
  const router = useRouter();
  const locale = useLocale();
  const [submitting, setSubmitting] = useState(false);

  const form = useForm<SampleFormValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(sampleFormSchema) as any,
    defaultValues: {
      sampleCode: defaultValues?.sampleCode ?? '',
      name: defaultValues?.name ?? '',
      description: defaultValues?.description ?? '',
      parentMaterialIds: defaultValues?.parentMaterialIds ?? [],
      mass: defaultValues?.mass,
      volume: defaultValues?.volume,
      concentration: defaultValues?.concentration,
      concentrationUnit: defaultValues?.concentrationUnit ?? '',
      status: defaultValues?.status ?? 'prepared',
      location: defaultValues?.location ?? '',
      protocol: defaultValues?.protocol ?? ''
    }
  });

  const onSubmit = async (values: SampleFormValues) => {
    setSubmitting(true);
    try {
      const user = getAuth().currentUser;
      if (!user) throw new Error('not_authenticated');
      const token = await user.getIdToken();
      const url = sampleId ? `/api/samples/${sampleId}` : '/api/samples';
      const method = sampleId ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${token}`
        },
        body: JSON.stringify(values)
      });
      if (!res.ok) throw new Error(await res.text());
      toast.success(sampleId ? 'Đã cập nhật' : 'Đã tạo sample mới');
      router.push(`/${locale}/dashboard/samples`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Lỗi');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className='space-y-4 max-w-2xl'>
      <div className='grid grid-cols-2 gap-4'>
        <div className='space-y-1.5'>
          <Label>Mã sample *</Label>
          <Input {...form.register('sampleCode')} placeholder='S-2026-001' />
          {form.formState.errors.sampleCode && (
            <p className='text-destructive text-xs'>{form.formState.errors.sampleCode.message}</p>
          )}
        </div>
        <div className='space-y-1.5'>
          <Label>Tên *</Label>
          <Input {...form.register('name')} placeholder='WO3 nanopowder batch A' />
          {form.formState.errors.name && (
            <p className='text-destructive text-xs'>{form.formState.errors.name.message}</p>
          )}
        </div>
      </div>

      <div className='space-y-1.5'>
        <Label>Mô tả</Label>
        <Textarea {...form.register('description')} rows={2} />
      </div>

      <div className='grid grid-cols-3 gap-4'>
        <div className='space-y-1.5'>
          <Label>Khối lượng (g)</Label>
          <Input type='number' step='any' {...form.register('mass')} />
        </div>
        <div className='space-y-1.5'>
          <Label>Thể tích (mL)</Label>
          <Input type='number' step='any' {...form.register('volume')} />
        </div>
        <div className='space-y-1.5'>
          <Label>Nồng độ</Label>
          <Input type='number' step='any' {...form.register('concentration')} />
        </div>
      </div>

      <div className='grid grid-cols-2 gap-4'>
        <div className='space-y-1.5'>
          <Label>Trạng thái *</Label>
          <Select
            value={form.watch('status')}
            onValueChange={(v) => form.setValue('status', v as SampleFormValues['status'])}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='prepared'>Prepared</SelectItem>
              <SelectItem value='in_use'>In use</SelectItem>
              <SelectItem value='consumed'>Consumed</SelectItem>
              <SelectItem value='archived'>Archived</SelectItem>
              <SelectItem value='discarded'>Discarded</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className='space-y-1.5'>
          <Label>Vị trí</Label>
          <Input {...form.register('location')} placeholder='Fridge 1, Shelf B' />
        </div>
      </div>

      <div className='space-y-1.5'>
        <Label>Protocol</Label>
        <Textarea {...form.register('protocol')} rows={3} />
      </div>

      <div className='flex gap-2 justify-end'>
        <Button
          type='button'
          variant='outline'
          onClick={() => router.push(`/${locale}/dashboard/samples`)}
        >
          Hủy
        </Button>
        <Button type='submit' disabled={submitting}>
          {submitting ? 'Đang lưu...' : sampleId ? 'Cập nhật' : 'Tạo mới'}
        </Button>
      </div>
    </form>
  );
}
