'use client';

/**
 * Inspector panel for the protocol editor: edits the selected node's label,
 * kind, one-line detail, and its on-node inputs (the Blender-style reagent /
 * parameter list — reagent name + amount/value), and deletes it.
 *
 * @phase R270d — on-node inputs
 */
import { IconPlus, IconTrash, IconX } from '@tabler/icons-react';
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
import type { ProtocolInput } from '@/types/protocol-template';

interface Props {
  node: WfNode;
  onChange: (patch: Partial<WorkflowNodeData>) => void;
  onDelete: () => void;
}

export function ProtocolNodeInspector({ node, onChange, onDelete }: Props) {
  const t = useTranslations('protocolTemplates');
  const inputs = (node.data.inputs as ProtocolInput[] | undefined) ?? [];

  const addInput = () =>
    onChange({ inputs: [...inputs, { id: crypto.randomUUID(), label: '', value: '' }] });
  const updateInput = (i: number, patch: Partial<ProtocolInput>) =>
    onChange({ inputs: inputs.map((inp, idx) => (idx === i ? { ...inp, ...patch } : inp)) });
  const removeInput = (i: number) => onChange({ inputs: inputs.filter((_, idx) => idx !== i) });

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

      <div className='space-y-1.5'>
        <div className='flex items-center justify-between'>
          <Label className='text-xs'>{t('nodeInputs')}</Label>
          <Button
            variant='ghost'
            size='sm'
            className='h-6 gap-1 px-1.5 text-xs text-muted-foreground'
            onClick={addInput}
          >
            <IconPlus className='size-3' />
            {t('addInput')}
          </Button>
        </div>
        {inputs.length === 0 ? (
          <p className='text-[11px] text-muted-foreground'>{t('noInputs')}</p>
        ) : (
          <div className='space-y-1.5'>
            {inputs.map((inp, i) => (
              <div key={inp.id} className='flex items-center gap-1'>
                <Input
                  value={inp.label}
                  onChange={(e) => updateInput(i, { label: e.target.value })}
                  placeholder={t('inputLabelPlaceholder')}
                  className='h-7 text-xs'
                />
                <Input
                  value={inp.value ?? ''}
                  onChange={(e) => updateInput(i, { value: e.target.value })}
                  placeholder={t('inputValuePlaceholder')}
                  className='h-7 w-20 shrink-0 text-xs tabular-nums'
                />
                <Button
                  variant='ghost'
                  size='icon'
                  className='size-6 shrink-0 text-muted-foreground'
                  onClick={() => removeInput(i)}
                >
                  <IconX className='size-3' />
                  <span className='sr-only'>{t('removeInput')}</span>
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
