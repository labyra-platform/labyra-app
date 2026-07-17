'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Panel } from '@/components/ui-extra/panel';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import {
  AI_PREFERENCES_DEFAULTS,
  type AiPreferencesInput,
  aiPreferencesSchema
} from '@/lib/schemas/ai-preferences-schema';
import { authedFetch } from '@/lib/api/authed-fetch';

export function AiPreferencesForm() {
  const t = useTranslations('settings.aiPreferences');
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);

  const form = useForm<AiPreferencesInput>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(aiPreferencesSchema) as any,
    defaultValues: AI_PREFERENCES_DEFAULTS
  });

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const res = await authedFetch('/api/me/ai-preferences');
        if (!res.ok) throw new Error(await res.text());
        const data = (await res.json()) as { preferences: Partial<AiPreferencesInput> };
        if (active && data.preferences) {
          form.reset({ ...AI_PREFERENCES_DEFAULTS, ...data.preferences });
        }
      } catch {
        // keep defaults; non-fatal
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onSubmit = async (values: AiPreferencesInput) => {
    setSubmitting(true);
    try {
      const res = await authedFetch('/api/me/ai-preferences', {
        method: 'PUT',
        body: JSON.stringify(values)
      });
      if (!res.ok) throw new Error(await res.text());
      toast.success(t('saved'));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <Panel title={t('title')} description={t('subtitle')}>
        <div className='bg-muted h-40 w-full animate-pulse rounded' />
      </Panel>
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className='max-w-2xl space-y-6'>
        {/* R560: one panel, not three.
            
            language, verbosity, mathNotation and tone all answer the same
            question — how the AI talks to *me* — so splitting them would be
            splitting for the sake of it. lab-context-form got three panels
            because it genuinely asks three questions; the number of panels
            should follow the number of questions, not a house style. */}
        <Panel title={t('title')} description={t('subtitle')}>
          <div className='space-y-6'>
            <div className='grid grid-cols-1 gap-4 md:grid-cols-2'>
              <FormField
                control={form.control}
                name='language'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('language')}</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value='auto'>{t('languageAuto')}</SelectItem>
                        <SelectItem value='vi'>Tiếng Việt</SelectItem>
                        <SelectItem value='en'>English</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name='verbosity'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('verbosity')}</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value='concise'>{t('verbosityConcise')}</SelectItem>
                        <SelectItem value='normal'>{t('verbosityNormal')}</SelectItem>
                        <SelectItem value='detailed'>{t('verbosityDetailed')}</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name='mathNotation'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('mathNotation')}</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value='latex'>LaTeX</SelectItem>
                        <SelectItem value='unicode'>Unicode</SelectItem>
                        <SelectItem value='plaintext'>{t('mathPlaintext')}</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name='tone'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('tone')}</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value='formal'>{t('toneFormal')}</SelectItem>
                        <SelectItem value='casual'>{t('toneCasual')}</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name='includeReferences'
              render={({ field }) => (
                <FormItem className='flex items-center justify-between rounded-lg border p-4'>
                  <div className='space-y-0.5'>
                    <FormLabel>{t('includeReferences')}</FormLabel>
                    <FormDescription>{t('includeReferencesDesc')}</FormDescription>
                  </div>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name='enableMemory'
              render={({ field }) => (
                <FormItem className='flex items-center justify-between rounded-lg border p-4'>
                  <div className='space-y-0.5'>
                    <FormLabel>{t('enableMemory')}</FormLabel>
                    <FormDescription>{t('enableMemoryDesc')}</FormDescription>
                  </div>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )}
            />
          </div>
        </Panel>

        <Button type='submit' disabled={submitting}>
          {submitting ? '…' : t('save')}
        </Button>
      </form>
    </Form>
  );
}
