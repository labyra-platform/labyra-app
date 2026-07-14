'use client';

/**
 * Feature-access form (R487, R491) — admin toggles which features tenant
 * members can use, per scope: the tenant default, or a per-group override
 * (full override; groups without one follow the default). Admins are never
 * gated. Dashboard is not listed: it is the blocked-route redirect target.
 */
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Icons } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { gateableFeatures } from '@/config/nav-config';
import { refreshFeatureAccess } from '@/hooks/use-feature-access';

const FEATURES = gateableFeatures();
const DEFAULT_SCOPE = '__default__';

interface FullAccess {
  disabled: string[];
  groups: Record<string, string[]>;
  groupList: { id: string; name: string }[];
}

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
  stateOn,
  stateOff,
  onChange
}: {
  label: string;
  icon?: keyof typeof Icons;
  checked: boolean;
  indent?: boolean;
  stateOn: string;
  stateOff: string;
  onChange: (on: boolean) => void;
}) {
  const Icon = icon ? Icons[icon] : null;
  return (
    <div className={`flex items-center justify-between py-2.5 ${indent ? 'pl-8' : ''}`}>
      <div className='flex min-w-0 items-center gap-2.5 text-sm'>
        {Icon && <Icon className='text-muted-foreground size-4 shrink-0' aria-hidden='true' />}
        <span className='truncate font-medium'>{label}</span>
      </div>
      <div className='flex shrink-0 items-center gap-2'>
        <span
          className={`text-xs ${checked ? 'text-muted-foreground' : 'text-destructive font-medium'}`}
        >
          {checked ? stateOn : stateOff}
        </span>
        <Switch checked={checked} onCheckedChange={onChange} aria-label={label} />
      </div>
    </div>
  );
}

export function FeatureAccessForm() {
  const t = useTranslations('settings.featureAccess');
  const tNav = useTranslations();
  const [data, setData] = useState<FullAccess | null>(null);
  const [scope, setScope] = useState<string>(DEFAULT_SCOPE);
  const [disabled, setDisabled] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/tenant/feature-access?full=true', {
        headers: await authHeader()
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d = (await res.json()) as FullAccess;
      setData(d);
      setDisabled(new Set(d.disabled));
    } catch {
      toast.error(t('loadError'));
      setData({ disabled: [], groups: {}, groupList: [] });
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  // R491: scope switch — group override if present, else default as baseline.
  const changeScope = (next: string) => {
    if (!data) return;
    setScope(next);
    setDirty(false);
    setDisabled(
      new Set(next === DEFAULT_SCOPE ? data.disabled : (data.groups[next] ?? data.disabled))
    );
  };

  const hasOverride = scope !== DEFAULT_SCOPE && data?.groups[scope] !== undefined;

  const labelOf = (title: string, titleKey?: string) =>
    titleKey && tNav.has(titleKey) ? tNav(titleKey) : title;

  const toggle = (key: string, on: boolean) => {
    setDisabled((prev) => {
      const next = new Set(prev);
      if (on) next.delete(key);
      else next.add(key);
      return next;
    });
    setDirty(true);
  };

  const save = useCallback(
    async (reset = false) => {
      setSaving(true);
      try {
        const body: Record<string, unknown> = { disabled: [...disabled] };
        if (scope !== DEFAULT_SCOPE) {
          body.groupId = scope;
          if (reset) body.reset = true;
        }
        const res = await fetch('/api/tenant/feature-access', {
          method: 'PUT',
          headers: { ...(await authHeader()), 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        refreshFeatureAccess();
        setDirty(false);
        toast.success(t('saved'));
        await load();
        if (reset) setDisabled(new Set(data?.disabled ?? []));
      } catch {
        toast.error(t('saveError'));
      } finally {
        setSaving(false);
      }
    },
    [disabled, scope, t, load, data]
  );

  if (data === null) {
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
        <div className='mb-3 flex flex-wrap items-center gap-2'>
          <Select value={scope} onValueChange={changeScope}>
            <SelectTrigger className='w-64' aria-label={t('scopeLabel')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={DEFAULT_SCOPE}>{t('scopeDefault')}</SelectItem>
              {data.groupList.map((g) => (
                <SelectItem key={g.id} value={g.id}>
                  {g.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {scope !== DEFAULT_SCOPE && (
            <span className='text-muted-foreground text-xs'>
              {hasOverride ? t('overrideActive') : t('followsDefault')}
            </span>
          )}
        </div>

        <p className='text-muted-foreground mb-3 text-xs'>
          {t('blockedCount', { count: disabled.size })}
        </p>
        {hasOverride && disabled.size === 0 && (
          <div className='border-destructive/40 bg-destructive/5 text-destructive mb-3 flex items-start gap-2 rounded-md border px-3 py-2 text-xs'>
            <Icons.warning className='mt-0.5 size-3.5 shrink-0' aria-hidden='true' />
            {t('allowAllWarning')}
          </div>
        )}

        <div className='divide-border divide-y'>
          {FEATURES.map((f) => (
            <div key={f.key}>
              <FeatureRow
                label={labelOf(f.title, f.titleKey)}
                icon={f.icon}
                checked={!disabled.has(f.key)}
                stateOn={t('stateAllowed')}
                stateOff={t('stateBlocked')}
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
                    stateOn={t('stateAllowed')}
                    stateOff={t('stateBlocked')}
                    onChange={(on) => toggle(c.key, on)}
                  />
                ))}
            </div>
          ))}
        </div>
        <div className='mt-4 flex items-center justify-between gap-3'>
          <p className='text-muted-foreground text-xs'>{t('adminNote')}</p>
          <div className='flex items-center gap-2'>
            {hasOverride && (
              <Button variant='outline' onClick={() => void save(true)} disabled={saving}>
                {t('useDefault')}
              </Button>
            )}
            <Button onClick={() => void save()} disabled={!dirty || saving}>
              {saving ? t('saving') : t('save')}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
