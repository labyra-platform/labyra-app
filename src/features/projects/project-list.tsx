'use client';

/**
 * Projects management surface: lists the tenant's projects, opens a dialog to
 * create / edit, and archives via the row kebab. Read through useProjects;
 * writes through the project query helpers. Empty + loading states included.
 *
 * @phase R264 — Project entity (MVP UI)
 */
import {
  IconArchive,
  IconDotsVertical,
  IconFolders,
  IconPencil,
  IconPlus
} from '@tabler/icons-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { ProjectForm } from '@/features/projects/project-form';
import { useProjects } from '@/features/projects/use-projects';
import { Link } from '@/i18n/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { ListSkeleton } from '@/components/ui/list-skeleton';
import { useTenantId } from '@/lib/auth';
import { archiveProject } from '@/lib/firestore/queries/projects';
import type { Project } from '@/types/project';

export function ProjectList() {
  const t = useTranslations('projects');
  const tenantId = useTenantId();
  const { projects, isLoading } = useProjects();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);

  const openCreate = () => {
    setEditing(null);
    setOpen(true);
  };
  const openEdit = (p: Project) => {
    setEditing(p);
    setOpen(true);
  };

  const handleArchive = async (p: Project) => {
    if (!tenantId) return;
    try {
      await archiveProject(tenantId, p.id);
      toast.success(t('archived'));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('saveFailed'));
    }
  };

  return (
    <div className='space-y-4'>
      <div className='flex items-center justify-end'>
        <Button onClick={openCreate} size='sm'>
          <IconPlus className='size-4' />
          {t('new')}
        </Button>
      </div>

      {isLoading ? (
        <ListSkeleton rows={5} />
      ) : projects.length === 0 ? (
        <div className='flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center'>
          <IconFolders className='size-8 text-muted-foreground' />
          <p className='mt-3 text-sm font-medium'>{t('empty')}</p>
          <p className='mt-1 text-sm text-muted-foreground'>{t('emptyHint')}</p>
          <Button onClick={openCreate} size='sm' variant='outline' className='mt-4'>
            <IconPlus className='size-4' />
            {t('new')}
          </Button>
        </div>
      ) : (
        <ul className='divide-y rounded-lg border'>
          {projects.map((p) => (
            <li key={p.id} className='flex items-center gap-3 px-4 py-3'>
              <div className='min-w-0 flex-1'>
                <div className='flex items-center gap-2'>
                  <Link
                    href={`/dashboard/projects/${p.id}`}
                    className='truncate text-sm font-medium hover:underline'
                  >
                    {p.name}
                  </Link>
                  <Badge variant='outline'>{t(`types.${p.type}`)}</Badge>
                  <Badge variant={p.status === 'archived' ? 'outline' : 'secondary'}>
                    {t(`statuses.${p.status}`)}
                  </Badge>
                </div>
                {(p.dueDate || p.grantCode) && (
                  <p className='mt-0.5 text-xs text-muted-foreground'>
                    {p.dueDate ? t('dueBy', { date: p.dueDate }) : ''}
                    {p.dueDate && p.grantCode ? ' · ' : ''}
                    {p.grantCode ?? ''}
                  </p>
                )}
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant='ghost' size='icon' className='size-8 shrink-0'>
                    <IconDotsVertical className='size-4' />
                    <span className='sr-only'>{t('actions')}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align='end'>
                  <DropdownMenuItem onClick={() => openEdit(p)}>
                    <IconPencil className='size-4' />
                    {t('edit')}
                  </DropdownMenuItem>
                  {p.status !== 'archived' && (
                    <DropdownMenuItem onClick={() => void handleArchive(p)}>
                      <IconArchive className='size-4' />
                      {t('archive')}
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className='sm:max-w-lg'>
          <DialogHeader>
            <DialogTitle>{editing ? t('editTitle') : t('newTitle')}</DialogTitle>
            <DialogDescription>{t('formHint')}</DialogDescription>
          </DialogHeader>
          <ProjectForm
            key={editing?.id ?? 'new'}
            project={editing ?? undefined}
            onSuccess={() => setOpen(false)}
            onCancel={() => setOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
