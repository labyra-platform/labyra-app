/**
 * D3 force-directed lineage graph for PROV-O relationships.
 *
 * @phase R164-phase-8-9a-fix-ts (was R164-phase-8-9a)
 */
'use client';
import * as d3 from 'd3';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useRef } from 'react';
import {
  type EntityType,
  type LineageEdge,
  type LineageNode,
  useLineageData
} from './use-lineage-data';

interface LineageGraphProps {
  rootType: EntityType;
  rootId: string;
  maxDepth?: number;
  width?: number;
  height?: number;
}

const NODE_COLOR: Record<EntityType, string> = {
  material: '#a78bfa',
  sample: '#60a5fa',
  experiment: '#34d399',
  measurement: '#fbbf24',
  analysis: '#f97316',
  reference: '#a3e635',
  paper: '#06b6d4'
};

const COLLECTION_BY_TYPE: Record<EntityType, string> = {
  material: 'materials',
  sample: 'samples',
  experiment: 'experiments',
  measurement: 'measurements',
  analysis: 'analyses',
  reference: 'references',
  paper: 'papers'
};

// D3Node extends SimulationNodeDatum (provides x, y, vx, vy, fx, fy optional fields).
// R164-phase-8-9a-fix-ts2: explicit fields here because TS strict + interface inheritance order
// can occasionally fail to resolve SimulationNodeDatum's optional fields.
interface D3Node extends LineageNode {
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number | null;
  fy?: number | null;
  index?: number;
}

// R164-phase-8-9a-fix-ts3: explicit source/target — TS strict extends inheritance not resolving
interface D3Edge {
  source: string | D3Node;
  target: string | D3Node;
  index?: number;
  relation: LineageEdge['relation'];
}

export function LineageGraph({
  rootType,
  rootId,
  maxDepth = 3,
  width = 700,
  height = 500
}: LineageGraphProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations('lineage');
  const { data, loading, error } = useLineageData(rootType, rootId, maxDepth);

  useEffect(() => {
    if (!svgRef.current || data.nodes.length === 0) return;

    const svg = d3.select<SVGSVGElement, unknown>(svgRef.current);
    svg.selectAll('*').remove();

    const nodes: D3Node[] = data.nodes.map((n) => ({ ...n }));
    const edges: D3Edge[] = data.edges.map((e) => ({
      source: e.source,
      target: e.target,
      relation: e.relation
    }));

    const simulation = d3
      .forceSimulation<D3Node, D3Edge>(nodes)
      .force(
        'link',
        d3
          .forceLink<D3Node, D3Edge>(edges)
          .id((d: D3Node) => d.id)
          .distance(80)
      )
      .force('charge', d3.forceManyBody<D3Node>().strength(-200))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide<D3Node>().radius(35));

    // Edges
    const link = svg
      .append('g')
      .attr('stroke', '#94a3b8')
      .attr('stroke-opacity', 0.6)
      .selectAll<SVGLineElement, D3Edge>('line')
      .data(edges)
      .join('line')
      .attr('stroke-width', 1.5)
      .attr('stroke-dasharray', (d: D3Edge) => (d.relation === 'generatedBy' ? '4 2' : 'none'));

    // Nodes
    const node = svg
      .append('g')
      .selectAll<SVGCircleElement, D3Node>('circle')
      .data(nodes)
      .join('circle')
      .attr('r', (d: D3Node) => (d.depth === 0 ? 18 : 12))
      .attr('fill', (d: D3Node) => NODE_COLOR[d.type])
      .attr('stroke', '#fff')
      .attr('stroke-width', 2)
      .style('cursor', 'pointer')
      .on('click', (_event: PointerEvent, d: D3Node) => {
        router.push(`/${locale}/dashboard/${COLLECTION_BY_TYPE[d.type]}/${d.id}`);
      })
      .call(
        d3
          .drag<SVGCircleElement, D3Node>()
          .on('start', (event: d3.D3DragEvent<SVGCircleElement, D3Node, D3Node>, d: D3Node) => {
            if (!event.active) simulation.alphaTarget(0.3).restart();
            d.fx = d.x;
            d.fy = d.y;
          })
          .on('drag', (event: d3.D3DragEvent<SVGCircleElement, D3Node, D3Node>, d: D3Node) => {
            d.fx = event.x;
            d.fy = event.y;
          })
          .on('end', (event: d3.D3DragEvent<SVGCircleElement, D3Node, D3Node>, d: D3Node) => {
            if (!event.active) simulation.alphaTarget(0);
            d.fx = null;
            d.fy = null;
          })
      );

    // Labels
    const label = svg
      .append('g')
      .selectAll<SVGTextElement, D3Node>('text')
      .data(nodes)
      .join('text')
      .text((d: D3Node) => d.label.slice(0, 28))
      .attr('font-size', 10)
      .attr('text-anchor', 'middle')
      .attr('dy', '0.35em')
      .attr('fill', 'currentColor')
      .attr('pointer-events', 'none');

    // Tooltips
    node.append('title').text((d: D3Node) => `${d.type}: ${d.label}`);

    simulation.on('tick', () => {
      link
        .attr('x1', (d: D3Edge) => (d.source as D3Node).x ?? 0)
        .attr('y1', (d: D3Edge) => (d.source as D3Node).y ?? 0)
        .attr('x2', (d: D3Edge) => (d.target as D3Node).x ?? 0)
        .attr('y2', (d: D3Edge) => (d.target as D3Node).y ?? 0);

      node.attr('cx', (d: D3Node) => d.x ?? 0).attr('cy', (d: D3Node) => d.y ?? 0);
      label.attr('x', (d: D3Node) => d.x ?? 0).attr('y', (d: D3Node) => (d.y ?? 0) + 22);
    });

    return () => {
      simulation.stop();
    };
  }, [data, width, height, router, locale]);

  if (loading) {
    return <div className='py-8 text-center text-sm text-muted-foreground'>{t('loading')}</div>;
  }
  if (error) {
    return (
      <div className='py-8 text-center text-sm text-destructive'>{t('error', { msg: error })}</div>
    );
  }
  if (data.nodes.length === 0) {
    return (
      <div className='py-8 text-center text-sm text-muted-foreground italic'>{t('noLineage')}</div>
    );
  }

  return (
    <div className='border rounded-md bg-card overflow-hidden'>
      <svg
        ref={svgRef}
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className='block max-w-full h-auto'
      />
      <Legend />
    </div>
  );
}

function Legend() {
  const t = useTranslations('lineage.legend');
  const items: Array<{ type: EntityType; label: string }> = [
    { type: 'material', label: t('material') },
    { type: 'sample', label: t('sample') },
    { type: 'experiment', label: t('experiment') },
    { type: 'measurement', label: t('measurement') },
    { type: 'analysis', label: t('analysis') },
    { type: 'reference', label: t('reference') },
    { type: 'paper', label: t('paper') }
  ];
  return (
    <div className='border-t bg-muted/30 px-3 py-2 flex flex-wrap gap-3 text-xs'>
      {items.map((it) => (
        <div key={it.type} className='flex items-center gap-1.5'>
          <span
            className='inline-block w-3 h-3 rounded-full'
            style={{ backgroundColor: NODE_COLOR[it.type] }}
          />
          <span className='text-muted-foreground'>{it.label}</span>
        </div>
      ))}
    </div>
  );
}
