'use client';

/**
 * Inspector panel for the protocol editor: edits the selected node's label,
 * kind and one-line detail, and deletes it. On-node inputs (the Blender-style
 * reagent/param list) are R270d.
 *
 * @phase R270c — Protocol editor
 */
import { IconTrash } from '@tabler/icons-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import type { WfNode, WorkflowNodeData, WorkflowNodeKind } from '@/features/workflow/types';

interface Props {
  node: WfNode;
  onChange: (patch: Partial<WorkflowNodeData>) => void;
  onDelete: () => void;
}

export function ProtocolNodeInspector({ node, onChange, onDelete }: Props) {
  const t = useTranslations('protocolTemplates');
  return (
    <div className='w-64 shrink-0 space-y-3 rounded-lg border p-3'>
      <div className='flex items-center justify-between'>
        <p className='text-sm font-medium'>{t('stepDetails')}</p>
        <Button variant='ghost' size='icon' className='size-7' onClick={onDelete}>
          <IconTrash className='size-4' />
          <span className='sr-only'>{t('deleteStep')}</span>
        </Button>
      </div>

      <div className='space-y-1.5'>
        <Label className='text-xs'>{t('nodeLabel')}</Label>
        <Input value={node.data.label} onChange={(e) => onChange({ label: e.target.value })} />
      </div>

      <div className='space-y-1.5'>
        <Label className='text-xs'>{t('nodeKind')}</Label>
        <Select
          value={node.data.kind}
          onValueChange={(v) => onChange({ kind: v as WorkflowNodeKind })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='process'>{t('kindProcess')}</SelectItem>
            <SelectItem value='data'>{t('kindData')}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className='space-y-1.5'>
        <Label className='text-xs'>{t('nodeSubtitle')}</Label>
        <Input
          value={node.data.subtitle ?? ''}
          onChange={(e) => onChange({ subtitle: e.target.value || undefined })}
          placeholder={t('nodeSubtitlePlaceholder')}
        />
      </div>
    </div>
  );
}
