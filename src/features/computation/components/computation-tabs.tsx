/**
 * Computation page tabs — Workflows / Submit / Templates.
 *
 * Client wrapper (Radix Tabs). Server-rendered content is passed in as slots
 * so the data fetching + i18n stay on the server.
 *
 * @phase R239-computation-tabs
 */
'use client';

import type { ReactNode } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface Props {
  labels: {
    workflows: string;
    submit: string;
    templates: string;
    submitSoon: string;
  };
  workflowsSlot: ReactNode;
  templatesSlot: ReactNode;
}

export function ComputationTabs({ labels, workflowsSlot, templatesSlot }: Props) {
  return (
    <Tabs defaultValue='workflows' className='w-full'>
      <TabsList className='flex h-auto flex-wrap justify-start'>
        <TabsTrigger value='workflows'>{labels.workflows}</TabsTrigger>
        <TabsTrigger value='submit'>{labels.submit}</TabsTrigger>
        <TabsTrigger value='templates'>{labels.templates}</TabsTrigger>
      </TabsList>
      <TabsContent value='workflows' className='mt-4'>
        {workflowsSlot}
      </TabsContent>
      <TabsContent value='submit' className='mt-4'>
        <p className='text-muted-foreground py-12 text-center text-sm'>{labels.submitSoon}</p>
      </TabsContent>
      <TabsContent value='templates' className='mt-4'>
        {templatesSlot}
      </TabsContent>
    </Tabs>
  );
}
