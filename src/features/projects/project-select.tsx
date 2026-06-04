'use client';

/**
 * Reusable project picker. Lists the tenant's projects plus a "No project"
 * option. Emits `undefined` when unset so callers store nothing rather than an
 * empty string. Used by entity forms (R265c) to link work to a project.
 *
 * @phase R265 — Project linking
 */
import { useTranslations } from 'next-intl';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { useProjects } from '@/features/projects/use-projects';

const NONE = '__none__';

export function ProjectSelect({
  value,
  onChange,
  disabled
}: {
  value?: string;
  onChange: (projectId: string | undefined) => void;
  disabled?: boolean;
}) {
  const t = useTranslations('projects');
  const { projects } = useProjects();

  return (
    <Select
      value={value ?? NONE}
      onValueChange={(v) => onChange(v === NONE ? undefined : v)}
      disabled={disabled}
    >
      <SelectTrigger>
        <SelectValue placeholder={t('selectPlaceholder')} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>{t('none')}</SelectItem>
        {projects.map((p) => (
          <SelectItem key={p.id} value={p.id}>
            {p.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
