'use client';

import { getFirebaseAuth } from '@/lib/firebase/client';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

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

// Form uses comma-joined strings + glossary text for ergonomics; converted to
// the schema shape (arrays + record) on submit.
interface LabContextFormValues {
  labName: string;
  labDescription: string;
  commonTechniques: string;
  commonMaterials: string;
  commonEquipment: string;
  houseStyle: string;
  glossary: string; // "term: definition" per line
}

const EMPTY: LabContextFormValues = {
  labName: '',
  labDescription: '',
  commonTechniques: '',
  commonMaterials: '',
  commonEquipment: '',
  houseStyle: '',
  glossary: ''
};

function splitCsv(s: string): string[] {
  return s
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, 50);
}

function parseGlossary(s: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of s.split('\n')) {
    const idx = line.indexOf(':');
    if (idx <= 0) continue;
    const term = line.slice(0, idx).trim();
    const def = line.slice(idx + 1).trim();
    if (term && def) out[term.slice(0, 100)] = def.slice(0, 500);
  }
  return out;
}

function glossaryToText(g: Record<string, string>): string {
  return Object.entries(g)
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n');
}

export function LabContextForm() {
  const t = useTranslations('settings.labContext');
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);

  const form = useForm<LabContextFormValues>({ defaultValues: EMPTY });

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const res = await authedFetch('/api/tenant/ai-context');
        if (!res.ok) throw new Error(await res.text());
        const data = (await res.json()) as {
          context: {
            labName?: string;
            labDescription?: string;
            commonTechniques?: string[];
            commonMaterials?: string[];
            commonEquipment?: string[];
            houseStyle?: string;
            glossary?: Record<string, string>;
          } | null;
        };
        if (active && data.context) {
          const c = data.context;
          form.reset({
            labName: c.labName ?? '',
            labDescription: c.labDescription ?? '',
            commonTechniques: (c.commonTechniques ?? []).join(', '),
            commonMaterials: (c.commonMaterials ?? []).join(', '),
            commonEquipment: (c.commonEquipment ?? []).join(', '),
            houseStyle: c.houseStyle ?? '',
            glossary: glossaryToText(c.glossary ?? {})
          });
        }
      } catch {
        // keep empty; non-fatal
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onSubmit = async (values: LabContextFormValues) => {
    setSubmitting(true);
    try {
      const payload = {
        labName: values.labName.trim(),
        labDescription: values.labDescription.trim(),
        commonTechniques: splitCsv(values.commonTechniques),
        commonMaterials: splitCsv(values.commonMaterials),
        commonEquipment: splitCsv(values.commonEquipment),
        houseStyle: values.houseStyle.trim(),
        glossary: parseGlossary(values.glossary)
      };
      const res = await authedFetch('/api/tenant/ai-context', {
        method: 'PUT',
        body: JSON.stringify(payload)
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
      <Card>
        <CardContent className='py-10'>
          <div className='bg-muted h-40 w-full animate-pulse rounded' />
        </CardContent>
      </Card>
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className='max-w-2xl space-y-6'>
        <Card>
          <CardContent className='space-y-4 pt-6'>
            <FormField
              control={form.control}
              name='labName'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('labName')}</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name='labDescription'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('labDescription')}</FormLabel>
                  <FormControl>
                    <Textarea rows={2} {...field} />
                  </FormControl>
                  <FormDescription>{t('labDescriptionDesc')}</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name='commonTechniques'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('commonTechniques')}</FormLabel>
                  <FormControl>
                    <Input placeholder='XRD, FTIR, Raman' {...field} />
                  </FormControl>
                  <FormDescription>{t('commaSeparated')}</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name='commonMaterials'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('commonMaterials')}</FormLabel>
                  <FormControl>
                    <Input placeholder='WO₃, WS₂' {...field} />
                  </FormControl>
                  <FormDescription>{t('commaSeparated')}</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name='commonEquipment'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('commonEquipment')}</FormLabel>
                  <FormControl>
                    <Input placeholder='Bruker D8, PerkinElmer' {...field} />
                  </FormControl>
                  <FormDescription>{t('commaSeparated')}</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name='glossary'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('glossary')}</FormLabel>
                  <FormControl>
                    <Textarea
                      rows={3}
                      placeholder={'GCD: galvanostatic charge-discharge'}
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>{t('glossaryDesc')}</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name='houseStyle'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('houseStyle')}</FormLabel>
                  <FormControl>
                    <Textarea rows={3} {...field} />
                  </FormControl>
                  <FormDescription>{t('houseStyleDesc')}</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        <Button type='submit' disabled={submitting}>
          {submitting ? '…' : t('save')}
        </Button>
      </form>
    </Form>
  );
}
