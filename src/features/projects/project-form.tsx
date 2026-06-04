'use client';

/**
 * Create / edit a project. shadcn Form + react-hook-form + zod. Writes go
 * straight to Firestore via the project query helpers (client-side, like
 * collections). Designed to live inside a Dialog (onSuccess/onCancel close it).
 *
 * MVP: owner is the current user (individual). Group ownership + members +
 * advisor pickers are v2 (need a members/groups picker) — the data model
 * already supports them.
 *
 * @phase R264 — Project entity (MVP UI)
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useTenantId } from '@/lib/auth';
import { useAuth } from '@/lib/auth/use-auth';
import { createProject, updateProject } from '@/lib/firestore/queries/projects';
import {
  GRANT_LEVELS,
  PROJECT_STATUSES,
  PROJECT_TYPES,
  type Project,
  type ProjectInput,
  projectInputSchema
} from '@/types/project';

interface ProjectFormProps {
  /** Present when editing an existing project. */
  project?: Project;
  onSuccess: () => void;
  onCancel: () => void;
}

const orUndef = (s?: string): string | undefined => {
  const t = s?.trim();
  return t ? t : undefined;
};

export function ProjectForm({ project, onSuccess, onCancel }: ProjectFormProps) {
  const t = useTranslations('projects');
  const tenantId = useTenantId();
  const { user } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const isEdit = Boolean(project);

  const form = useForm<ProjectInput>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(projectInputSchema) as any,
    defaultValues: {
      name: project?.name ?? '',
      description: project?.description ?? '',
      type: project?.type ?? 'phd',
      ownerType: project?.ownerType ?? 'individual',
      ownerId: project?.ownerId ?? user?.uid ?? '',
      memberIds: project?.memberIds ?? [],
      advisorId: project?.advisorId ?? '',
      grantLevel: project?.grantLevel,
      grantCode: project?.grantCode ?? '',
      startDate: project?.startDate ?? '',
      dueDate: project?.dueDate ?? '',
      status: project?.status ?? 'planning'
    }
  });

  const type = form.watch('type');

  const onSubmit = async (values: ProjectInput) => {
    if (!tenantId) {
      toast.error(t('saveFailed'));
      return;
    }
    setSubmitting(true);
    try {
      const payload: ProjectInput = {
        ...values,
        ownerId: values.ownerId || user?.uid || '',
        description: orUndef(values.description),
        grantCode: orUndef(values.grantCode),
        startDate: orUndef(values.startDate),
        dueDate: orUndef(values.dueDate),
        grantLevel: values.type === 'funded' ? values.grantLevel : undefined
      };
      if (project) {
        await updateProject(tenantId, project.id, payload);
      } else {
        await createProject(tenantId, payload);
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
          name='type'
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
                  {PROJECT_TYPES.map((pt) => (
                    <SelectItem key={pt} value={pt}>
                      {t(`types.${pt}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        {type === 'funded' && (
          <div className='grid grid-cols-1 gap-4 sm:grid-cols-2'>
            <FormField
              control={form.control}
              name='grantLevel'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('grantLevel')} *</FormLabel>
                  <Select value={field.value ?? ''} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder={t('grantLevelPlaceholder')} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {GRANT_LEVELS.map((gl) => (
                        <SelectItem key={gl} value={gl}>
                          {t(`grantLevels.${gl}`)}
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
              name='grantCode'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('grantCode')}</FormLabel>
                  <FormControl>
                    <Input placeholder={t('grantCodePlaceholder')} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        )}

        <div className='grid grid-cols-1 gap-4 sm:grid-cols-2'>
          <FormField
            control={form.control}
            name='startDate'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('startDate')}</FormLabel>
                <FormControl>
                  <Input type='date' {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name='dueDate'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('dueDate')}</FormLabel>
                <FormControl>
                  <Input type='date' {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {isEdit && (
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
                    {PROJECT_STATUSES.map((ps) => (
                      <SelectItem key={ps} value={ps}>
                        {t(`statuses.${ps}`)}
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
