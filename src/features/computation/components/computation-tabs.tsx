/**
 * Computation page tabs — Workflows / Builder / Templates.
 *
 * Client wrapper (Radix Tabs). Workflows + Templates are server-rendered slots;
 * Builder hosts the interactive node-DAG editor.
 *
 * @phase R241-dag-editor
 */
'use client';

import type { ReactNode } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { WorkflowDagEditor } from '@/features/computation/components/workflow-dag-editor';

interface Props {
  labels: {
    workflows: string;
    builder: string;
    templates: string;
  };
  workflowsSlot: ReactNode;
  templatesSlot: ReactNode;
}

export function ComputationTabs({ labels, workflowsSlot, templatesSlot }: Props) {
  return (
    <Tabs defaultValue='workflows' className='w-full'>
      <TabsList className='flex h-auto flex-wrap justify-start'>
        <TabsTrigger value='workflows'>{labels.workflows}</TabsTrigger>
        <TabsTrigger value='builder'>{labels.builder}</TabsTrigger>
        <TabsTrigger value='templates'>{labels.templates}</TabsTrigger>
      </TabsList>
      <TabsContent value='workflows' className='mt-4'>
        {workflowsSlot}
      </TabsContent>
      <TabsContent value='builder' className='mt-4'>
        <WorkflowDagEditor />
      </TabsContent>
      <TabsContent value='templates' className='mt-4'>
        {templatesSlot}
      </TabsContent>
    </Tabs>
  );
}
