'use client';

/**
 * Feature-access form (R487) — admin toggles which features (sidebar tabs from
 * Lineage up) tenant members can access. Admins themselves are never gated.
 * Dashboard is not listed: it is the redirect target for blocked routes.
 */
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Icons } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { gateableFeatures } from '@/config/nav-config';
import { refreshFeatureAccess } from '@/hooks/use-feature-access';

const FEATURES = gateableFeatures();

async function authHeader(): Promise<{ Authorization: string }> {
  const { getFirebaseAuth } = await import('@/lib/firebase/client');
  const token = await getFirebaseAuth().currentUser?.getIdToken();
  return { Authorization: `Bearer ${token ?? ''}` };
}

function FeatureRow({
  label,
  icon,
  checked,
  indent,
  onChange
}: {
  label: string;
  icon?: keyof typeof Icons;
  checked: boolean;
  indent?: boolean;
  onChange: (on: boolean) => void;
}) {
  const Icon = icon ? Icons[icon] : null;
  return (
    <div className={`flex items-center justify-between py-2.5 ${indent ? 'pl-8' : ''}`}>
      <div className='flex min-w-0 items-center gap-2.5 text-sm'>
        {Icon && <Icon className='text-muted-foreground size-4 shrink-0' aria-hidden='true' />}
        <span className='truncate font-medium'>{label}</span>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} aria-label={label} />
    </div>
  );
}

export function FeatureAccessForm() {
  const t = useTranslations('settings.featureAccess');
  const tNav = useTranslations();
  const [disabled, setDisabled] = useState<Set<string> | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/tenant/feature-access', { headers: await authHeader() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { disabled: string[] };
      setDisabled(new Set(data.disabled));
    } catch {
      toast.error(t('loadError'));
      setDisabled(new Set());
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const labelOf = (title: string, titleKey?: string) =>
    titleKey && tNav.has(titleKey) ? tNav(titleKey) : title;

  const toggle = (key: string, on: boolean) => {
    setDisabled((prev) => {
      const next = new Set(prev ?? []);
      if (on) next.delete(key);
      else next.add(key);
      return next;
    });
    setDirty(true);
  };

  const save = async () => {
    if (!disabled) return;
    setSaving(true);
    try {
      const res = await fetch('/api/tenant/feature-access', {
        method: 'PUT',
        headers: { ...(await authHeader()), 'Content-Type': 'application/json' },
        body: JSON.stringify({ disabled: [...disabled] })
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      refreshFeatureAccess();
      setDirty(false);
      toast.success(t('saved'));
    } catch {
      toast.error(t('saveError'));
    } finally {
      setSaving(false);
    }
  };

  if (disabled === null) {
    return (
      <Card className='max-w-2xl'>
        <CardHeader>
          <Skeleton className='h-5 w-44' />
          <Skeleton className='h-4 w-72' />
        </CardHeader>
        <CardContent className='space-y-3'>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className='flex items-center justify-between'>
              <Skeleton className='h-4 w-40' />
              <Skeleton className='h-5 w-9 rounded-full' />
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className='max-w-2xl'>
      <CardHeader>
        <CardTitle className='flex items-center gap-2'>
          <Icons.lock className='size-4' aria-hidden='true' />
          {t('cardTitle')}
        </CardTitle>
        <CardDescription>{t('cardDesc')}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className='divide-border divide-y'>
          {FEATURES.map((f) => (
            <div key={f.key}>
              <FeatureRow
                label={labelOf(f.title, f.titleKey)}
                icon={f.icon}
                checked={!disabled.has(f.key)}
                onChange={(on) => toggle(f.key, on)}
              />
              {!disabled.has(f.key) &&
                f.children.map((c) => (
                  <FeatureRow
                    key={c.key}
                    label={labelOf(c.title, c.titleKey)}
                    icon={c.icon}
                    checked={!disabled.has(c.key)}
                    indent
                    onChange={(on) => toggle(c.key, on)}
                  />
                ))}
            </div>
          ))}
        </div>
        <div className='mt-4 flex items-center justify-between gap-3'>
          <p className='text-muted-foreground text-xs'>{t('adminNote')}</p>
          <Button onClick={() => void save()} disabled={!dirty || saving}>
            {saving ? t('saving') : t('save')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
