'use client';

/**
 * Manuscript editor (HITL). Renders the IMRaD sections in order; each can be
 * generated / regenerated on demand. Generation streams live text, then the
 * draft is saved to the section and any deterministic grounding warnings
 * (R276 — fabricated citations / unverified numbers) are surfaced.
 *
 * @phase R-aiscience-4
 * @see labyra-ai-science-manuscript-strategy.md §4
 */
import { IconRefresh, IconSparkles } from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { streamManuscriptSection } from '@/features/manuscript/generate-client';
import type {
  Manuscript,
  ManuscriptSection,
  ManuscriptSectionType
} from '@/features/manuscript/types';
import { IMRAD_ORDER } from '@/lib/ai/manuscript/section-order';
import { useTenantId } from '@/lib/auth';
import { upsertManuscriptSection } from '@/lib/firestore/queries/manuscripts';

const SECTION_LABEL_KEY: Record<ManuscriptSectionType, string> = {
  abstract: 'sectionAbstract',
  introduction: 'sectionIntroduction',
  materials: 'sectionMaterials',
  methods: 'sectionMethods',
  results_discussion: 'sectionResultsDiscussion',
  conclusion: 'sectionConclusion'
};

export function ManuscriptEditor({ manuscript }: { manuscript: Manuscript }) {
  const t = useTranslations('manuscript');
  const tenantId = useTenantId();
  const queryClient = useQueryClient();
  const [generating, setGenerating] = useState<ManuscriptSectionType | null>(null);
  const [streamText, setStreamText] = useState('');

  const byType = new Map(manuscript.sections.map((s) => [s.type, s]));

  async function generate(type: ManuscriptSectionType) {
    if (!tenantId || generating) return;
    setGenerating(type);
    setStreamText('');
    try {
      const result = await streamManuscriptSection({
        manuscript,
        sectionType: type,
        onDelta: (d) => setStreamText((prev) => prev + d)
      });
      const prev = byType.get(type);
      const section: ManuscriptSection = {
        type,
        order: IMRAD_ORDER.indexOf(type),
        content: result.draft,
        status: 'draft',
        citations: result.citations,
        linkedMeasurementIds: [],
        generatedByTier: 4,
        sectionVersion: (prev?.sectionVersion ?? 0) + 1
      };
      await upsertManuscriptSection(tenantId, manuscript.id, manuscript.sections, section);
      await queryClient.invalidateQueries({
        queryKey: ['tenant-collection', tenantId, 'manuscripts']
      });

      const { invalidCitations, unverifiedNumbers, totalWarnings } = result.grounding;
      if (totalWarnings > 0) {
        toast.warning(t('groundingWarn', { count: totalWarnings }), {
          description: t('groundingDetail', {
            cites: invalidCitations.length,
            nums: unverifiedNumbers.length
          })
        });
      } else {
        toast.success(t('sectionDone'));
      }
    } catch {
      toast.error(t('generateFailed'));
    } finally {
      setGenerating(null);
      setStreamText('');
    }
  }

  return (
    <div className='space-y-3'>
      <h2 className='text-lg font-semibold'>{manuscript.title}</h2>

      {IMRAD_ORDER.map((type) => {
        const sec = byType.get(type);
        const isGen = generating === type;
        return (
          <div key={type} className='rounded-lg border p-3'>
            <div className='mb-2 flex items-center justify-between gap-2'>
              <div className='flex min-w-0 items-center gap-2'>
                <span className='font-medium'>{t(SECTION_LABEL_KEY[type])}</span>
                {sec && (
                  <Badge variant='secondary' className='text-[10px]'>
                    {sec.status}
                  </Badge>
                )}
                {sec && sec.citations.length > 0 && (
                  <span className='text-xs text-muted-foreground'>
                    {t('citeCount', { count: sec.citations.length })}
                  </span>
                )}
              </div>
              <Button
                size='sm'
                variant={sec ? 'outline' : 'default'}
                disabled={generating !== null}
                onClick={() => void generate(type)}
              >
                {sec ? <IconRefresh className='size-3.5' /> : <IconSparkles className='size-3.5' />}
                {sec ? t('regenerate') : t('generate')}
              </Button>
            </div>
            {isGen ? (
              <p className='whitespace-pre-wrap text-sm text-muted-foreground'>
                {streamText || t('generating')}
              </p>
            ) : sec ? (
              <p className='whitespace-pre-wrap text-sm'>{sec.content}</p>
            ) : (
              <p className='text-sm text-muted-foreground'>{t('notGenerated')}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}
