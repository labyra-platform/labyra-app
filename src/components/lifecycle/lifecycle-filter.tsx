/**
 * Filter dropdown to include deprecated/retracted records in list views.
 *
 * @phase R164-phase-7
 */
'use client';
import { useTranslations } from 'next-intl';
import { IconFilter } from '@tabler/icons-react';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';

export interface LifecycleFilterValue {
  includeDeprecated: boolean;
  includeRetracted: boolean;
}

interface LifecycleFilterProps {
  value: LifecycleFilterValue;
  onChange: (value: LifecycleFilterValue) => void;
}

export function LifecycleFilter({ value, onChange }: LifecycleFilterProps) {
  const t = useTranslations('lifecycle.filter');
  const tStatus = useTranslations('lifecycle.status');
  const activeCount = (value.includeDeprecated ? 1 : 0) + (value.includeRetracted ? 1 : 0);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant='outline' size='sm'>
          <IconFilter className='mr-2 h-4 w-4' />
          {t('label')}
          {activeCount > 0 ? ` (+${activeCount})` : ''}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align='end' className='w-56'>
        <DropdownMenuLabel>{t('title')}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem
          checked={value.includeDeprecated}
          onCheckedChange={(checked) => onChange({ ...value, includeDeprecated: Boolean(checked) })}
        >
          {tStatus('deprecated')}
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem
          checked={value.includeRetracted}
          onCheckedChange={(checked) => onChange({ ...value, includeRetracted: Boolean(checked) })}
        >
          {tStatus('retracted')}
        </DropdownMenuCheckboxItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
