'use client';

/**
 * Personal account settings — profile (display name + avatar + email), appearance
 * (light/dark + colour theme), and language. Reuses the existing theme + locale
 * controls; display name is editable via Firebase Auth updateProfile.
 *
 * @phase R300 — personal settings
 */
import { updateProfile } from 'firebase/auth';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';

import { LocaleSwitcher } from '@/components/locale-switcher';
import { ThemeModeToggle } from '@/components/themes/theme-mode-toggle';
import { ThemeSelector } from '@/components/themes/theme-selector';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/lib/auth/use-auth';

function initialsOf(name: string, email: string): string {
  const base = name.trim() || email.split('@')[0] || '';
  return (
    base
      .split(/\s+/)
      .map((w) => w[0])
      .slice(0, 2)
      .join('')
      .toUpperCase() || 'U'
  );
}

export function AccountSettings() {
  const t = useTranslations('settings.account');
  const { user, refreshUser } = useAuth();
  const email = user?.email ?? '';
  const [name, setName] = useState(user?.displayName ?? '');
  const [saving, setSaving] = useState(false);

  const dirty = name.trim().length > 0 && name.trim() !== (user?.displayName ?? '');

  const saveName = async () => {
    if (!user || !dirty) return;
    setSaving(true);
    try {
      await updateProfile(user, { displayName: name.trim() });
      await refreshUser();
      toast.success(t('profileSaved'));
    } catch {
      toast.error(t('profileSaveError'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className='max-w-2xl space-y-6'>
      <Card>
        <CardHeader>
          <CardTitle>{t('profileTitle')}</CardTitle>
          <CardDescription>{t('profileDesc')}</CardDescription>
        </CardHeader>
        <CardContent className='space-y-4'>
          <div className='flex items-center gap-4'>
            <Avatar className='size-16'>
              <AvatarImage src={user?.photoURL ?? undefined} alt={name || email} />
              <AvatarFallback className='text-lg'>{initialsOf(name, email)}</AvatarFallback>
            </Avatar>
            <div className='min-w-0 text-sm'>
              <div className='truncate font-medium'>{user?.displayName || t('noName')}</div>
              <div className='text-muted-foreground truncate'>{email}</div>
            </div>
          </div>
          <div className='space-y-1.5'>
            <Label htmlFor='display-name'>{t('displayName')}</Label>
            <div className='flex gap-2'>
              <Input
                id='display-name'
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('displayNamePlaceholder')}
                className='max-w-sm'
              />
              <Button onClick={() => void saveName()} disabled={!dirty || saving}>
                {t('save')}
              </Button>
            </div>
          </div>
          <div className='space-y-1.5'>
            <Label htmlFor='email'>{t('email')}</Label>
            <Input id='email' value={email} disabled className='max-w-sm' />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('appearanceTitle')}</CardTitle>
          <CardDescription>{t('appearanceDesc')}</CardDescription>
        </CardHeader>
        <CardContent className='space-y-4'>
          <div className='flex items-center justify-between gap-4'>
            <div>
              <div className='text-sm font-medium'>{t('themeMode')}</div>
              <div className='text-muted-foreground text-xs'>{t('themeModeDesc')}</div>
            </div>
            <ThemeModeToggle />
          </div>
          <div className='flex items-center justify-between gap-4'>
            <div>
              <div className='text-sm font-medium'>{t('colorTheme')}</div>
              <div className='text-muted-foreground text-xs'>{t('colorThemeDesc')}</div>
            </div>
            <ThemeSelector />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('languageTitle')}</CardTitle>
          <CardDescription>{t('languageDesc')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className='flex items-center justify-between gap-4'>
            <div>
              <div className='text-sm font-medium'>{t('language')}</div>
              <div className='text-muted-foreground text-xs'>{t('languageHint')}</div>
            </div>
            <LocaleSwitcher />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
