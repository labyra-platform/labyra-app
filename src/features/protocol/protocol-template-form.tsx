'use client';

/**
 * Create / edit a protocol template (name + description). shadcn Form + RHF +
 * zod, client Firestore writes. Lives inside a Dialog (onSuccess/onCancel close
 * it). The graph itself (steps + edges) is edited separately (R270c).
 *
 * @phase R270b — Protocol Template UI
 */
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
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
import { Textarea } from '@/components/ui/textarea';
import { useTenantId } from '@/lib/auth';
import {
  createProtocolTemplate,
  updateProtocolTemplate
} from '@/lib/firestore/queries/protocol-templates';
import {
  type ProtocolTemplate,
  type ProtocolTemplateInput,
  protocolTemplateInputSchema
} from '@/types/protocol-template';

interface Props {
  /** Present when editing an existing template. */
  template?: ProtocolTemplate;
  onSuccess: () => void;
  onCancel: () => void;
}

const orUndef = (s?: string): string | undefined => {
  const v = s?.trim();
  return v ? v : undefined;
};

export function ProtocolTemplateForm({ template, onSuccess, onCancel }: Props) {
  const t = useTranslations('protocolTemplates');
  const tenantId = useTenantId();
  const [submitting, setSubmitting] = useState(false);
  const isEdit = Boolean(template);

  const form = useForm<ProtocolTemplateInput>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(protocolTemplateInputSchema) as any,
    defaultValues: {
      name: template?.name ?? '',
      description: template?.description ?? ''
    }
  });

  const onSubmit = async (values: ProtocolTemplateInput) => {
    if (!tenantId) {
      toast.error(t('saveFailed'));
      return;
    }
    setSubmitting(true);
    try {
      const payload: ProtocolTemplateInput = {
        name: values.name,
        description: orUndef(values.description)
      };
      if (template) {
        await updateProtocolTemplate(tenantId, template.id, payload);
      } else {
        await createProtocolTemplate(tenantId, payload);
      }
      toast.success(isEdit ? t('updated') : t('created'));
      onSuccess();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('saveFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className='space-y-5'>
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
          name='description'
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('description')}</FormLabel>
              <FormControl>
                <Textarea rows={3} placeholder={t('descriptionPlaceholder')} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className='flex justify-end gap-2 pt-1'>
          <Button type='button' variant='ghost' onClick={onCancel} disabled={submitting}>
            {t('cancel')}
          </Button>
          <Button type='submit' disabled={submitting}>
            {submitting ? t('saving') : isEdit ? t('save') : t('create')}
          </Button>
        </div>
      </form>
    </Form>
  );
}
