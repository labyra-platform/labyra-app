'use client';

/**
 * Protocol template library: lists the tenant's templates, opens a dialog to
 * create / edit (name + description), archives via the row kebab. Read through
 * useProtocolTemplates; writes through the query helpers.
 *
 * @phase R270b — Protocol Template UI
 */
import {
  IconArchive,
  IconDotsVertical,
  IconPencil,
  IconPlus,
  IconSubtask
} from '@tabler/icons-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { ProtocolTemplateForm } from '@/features/protocol/protocol-template-form';
import { useProtocolTemplates } from '@/features/protocol/use-protocol-templates';
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
import { archiveProtocolTemplate } from '@/lib/firestore/queries/protocol-templates';
import type { ProtocolTemplate } from '@/types/protocol-template';

export function ProtocolTemplateList() {
  const t = useTranslations('protocolTemplates');
  const tenantId = useTenantId();
  const { templates, isLoading } = useProtocolTemplates();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ProtocolTemplate | null>(null);

  const openCreate = () => {
    setEditing(null);
    setOpen(true);
  };
  const openEdit = (tpl: ProtocolTemplate) => {
    setEditing(tpl);
    setOpen(true);
  };

  const handleArchive = async (tpl: ProtocolTemplate) => {
    if (!tenantId) return;
    try {
      await archiveProtocolTemplate(tenantId, tpl.id);
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
      ) : templates.length === 0 ? (
        <div className='flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center'>
          <IconSubtask className='size-8 text-muted-foreground' />
          <p className='mt-3 text-sm font-medium'>{t('empty')}</p>
          <p className='mt-1 text-sm text-muted-foreground'>{t('emptyHint')}</p>
          <Button onClick={openCreate} size='sm' variant='outline' className='mt-4'>
            <IconPlus className='size-4' />
            {t('new')}
          </Button>
        </div>
      ) : (
        <ul className='divide-y rounded-lg border'>
          {templates.map((tpl) => (
            <li key={tpl.id} className='flex items-center gap-3 px-4 py-3'>
              <div className='min-w-0 flex-1'>
                <div className='flex items-center gap-2'>
                  <Link
                    href={`/dashboard/protocol-templates/${tpl.id}`}
                    className='truncate text-sm font-medium hover:underline'
                  >
                    {tpl.name}
                  </Link>
                  <Badge variant='secondary'>{t('stepCount', { count: tpl.steps.length })}</Badge>
                  {tpl.status === 'archived' && (
                    <Badge variant='outline'>{t('statusArchived')}</Badge>
                  )}
                </div>
                {tpl.description && (
                  <p className='mt-0.5 truncate text-xs text-muted-foreground'>{tpl.description}</p>
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
                  <DropdownMenuItem onClick={() => openEdit(tpl)}>
                    <IconPencil className='size-4' />
                    {t('edit')}
                  </DropdownMenuItem>
                  {tpl.status !== 'archived' && (
                    <DropdownMenuItem onClick={() => void handleArchive(tpl)}>
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
          <ProtocolTemplateForm
            key={editing?.id ?? 'new'}
            template={editing ?? undefined}
            onSuccess={() => setOpen(false)}
            onCancel={() => setOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
