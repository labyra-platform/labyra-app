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
import { materialFormSchema, type MaterialFormValues } from '../schema';
import type { Material } from '@/types/materials';

interface MaterialFormProps {
  defaultValues?: Partial<Material>;
  materialId?: string;
}

export function MaterialForm({ defaultValues, materialId }: MaterialFormProps) {
  const router = useRouter();
  const locale = useLocale();
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
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${token}`
        },
        body: JSON.stringify(values)
      });
      if (!res.ok) throw new Error(await res.text());
      toast.success(materialId ? 'Đã cập nhật' : 'Đã tạo material mới');
      router.push(`/${locale}/dashboard/materials`);
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
          <Label>Tên *</Label>
          <Input {...form.register('name')} placeholder='e.g. WO3 powder' />
          {form.formState.errors.name && (
            <p className='text-destructive text-xs'>{form.formState.errors.name.message}</p>
          )}
        </div>
        <div className='space-y-1.5'>
          <Label>Công thức</Label>
          <Input {...form.register('formula')} placeholder='e.g. WO₃' />
        </div>
      </div>

      <div className='grid grid-cols-3 gap-4'>
        <div className='space-y-1.5'>
          <Label>Loại *</Label>
          <Select
            value={form.watch('category')}
            onValueChange={(v) => form.setValue('category', v as MaterialFormValues['category'])}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='chemical'>Chemical</SelectItem>
              <SelectItem value='reagent'>Reagent</SelectItem>
              <SelectItem value='solvent'>Solvent</SelectItem>
              <SelectItem value='gas'>Gas</SelectItem>
              <SelectItem value='consumable'>Consumable</SelectItem>
              <SelectItem value='equipment'>Equipment</SelectItem>
              <SelectItem value='other'>Other</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className='space-y-1.5'>
          <Label>CAS</Label>
          <Input {...form.register('cas')} placeholder='12345-67-8' />
        </div>
        <div className='space-y-1.5'>
          <Label>Vị trí</Label>
          <Input {...form.register('location')} placeholder='Shelf A3' />
        </div>
      </div>

      <div className='grid grid-cols-2 gap-4'>
        <div className='space-y-1.5'>
          <Label>Số lượng *</Label>
          <Input type='number' step='any' {...form.register('quantity')} />
          {form.formState.errors.quantity && (
            <p className='text-destructive text-xs'>{form.formState.errors.quantity.message}</p>
          )}
        </div>
        <div className='space-y-1.5'>
          <Label>Đơn vị *</Label>
          <Select
            value={form.watch('unit')}
            onValueChange={(v) => form.setValue('unit', v as MaterialFormValues['unit'])}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(['g', 'kg', 'mg', 'mL', 'L', 'µL', 'mol', 'mmol', 'piece', 'box'] as const).map(
                (u) => (
                  <SelectItem key={u} value={u}>
                    {u}
                  </SelectItem>
                )
              )}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className='grid grid-cols-2 gap-4'>
        <div className='space-y-1.5'>
          <Label>Nhà cung cấp</Label>
          <Input {...form.register('supplier')} placeholder='Sigma-Aldrich' />
        </div>
        <div className='space-y-1.5'>
          <Label>Số lô</Label>
          <Input {...form.register('lotNumber')} placeholder='Lot 2024-XYZ' />
        </div>
      </div>

      <div className='space-y-1.5'>
        <Label>Mức nguy hiểm *</Label>
        <Select
          value={form.watch('hazardLevel')}
          onValueChange={(v) =>
            form.setValue('hazardLevel', v as MaterialFormValues['hazardLevel'])
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='none'>None</SelectItem>
            <SelectItem value='low'>Low</SelectItem>
            <SelectItem value='medium'>Medium</SelectItem>
            <SelectItem value='high'>High</SelectItem>
            <SelectItem value='extreme'>Extreme</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className='space-y-1.5'>
        <Label>Ghi chú an toàn</Label>
        <Textarea {...form.register('hazardNotes')} rows={3} />
      </div>

      <div className='flex gap-2 justify-end'>
        <Button
          type='button'
          variant='outline'
          onClick={() => router.push(`/${locale}/dashboard/materials`)}
        >
          Hủy
        </Button>
        <Button type='submit' disabled={submitting}>
          {submitting ? 'Đang lưu...' : materialId ? 'Cập nhật' : 'Tạo mới'}
        </Button>
      </div>
    </form>
  );
}
