'use client';

/**
 * PdfNavSidebar — left navigation pane for the PDF reader (R237n / C2).
 *
 * Two tabs, Edge/Adobe-style:
 *   - Thumbnails: a scaled <Page> per page; click to jump. Always available.
 *   - Outline: the document's embedded bookmarks (pdf.getOutline()). Many papers
 *     have none — pdfjs returns null — so the tab shows an empty state then.
 *
 * The sidebar is rendered by pdf-viewer when open; it receives the live
 * PDFDocumentProxy (for outline + dest→page resolution), the page count, the
 * current page, and a jump callback. Thumbnails reuse the same dynamic <Page>
 * import the viewer uses, at a small fixed width — cheap, and only the open
 * sidebar mounts them.
 */
import { IconChevronRight, IconList, IconPhoto } from '@tabler/icons-react';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

const Document = dynamic(() => import('react-pdf').then((m) => m.Document), { ssr: false });
const Page = dynamic(() => import('react-pdf').then((m) => m.Page), { ssr: false });

const THUMB_WIDTH = 116;

/** Minimal shape of the pieces of PDFDocumentProxy we use (avoids a deep pdfjs
 *  type import that varies by version). */
interface PdfProxy {
  numPages: number;
  getOutline: () => Promise<unknown[] | null>;
  getDestination: (id: string) => Promise<unknown[] | null>;
  getPageIndex: (ref: object) => Promise<number>;
  getPage: (pageNumber: number) => Promise<PdfPageLike>;
}
interface PdfPageLike {
  getViewport: (params: { scale: number }) => { width: number; height: number };
}
interface OutlineNode {
  title: string;
  dest: string | unknown[] | null;
  items: OutlineNode[];
}

/** An outline node with its resolved 1-based page (or null), a stable id, and
 *  the vertical position of its target within the page as a fraction from the
 *  top (0 = page top, 1 = page bottom) so jumps land the header at the top. */
interface OutlineItem {
  id: string;
  title: string;
  page: number | null;
  yRatio: number | null;
  children: OutlineItem[];
}

async function resolveDest(
  pdf: PdfProxy,
  dest: string | unknown[] | null
): Promise<{ page: number; yRatio: number | null } | null> {
  try {
    const explicit = typeof dest === 'string' ? await pdf.getDestination(dest) : dest;
    if (!Array.isArray(explicit)) return null;
    const ref = explicit[0];
    if (!ref || typeof ref !== 'object') return null;
    const idx = await pdf.getPageIndex(ref as object);
    const page = idx + 1;
    // dest = [pageRef, {name}, x, y, zoom]. y (index 3) is in PDF points from
    // the page BOTTOM. Convert to a fraction from the TOP using page height.
    const yPt = typeof explicit[3] === 'number' ? (explicit[3] as number) : null;
    let yRatio: number | null = null;
    if (yPt !== null) {
      try {
        const vp = (await pdf.getPage(page)).getViewport({ scale: 1 });
        if (vp.height > 0) yRatio = Math.max(0, Math.min(1, (vp.height - yPt) / vp.height));
      } catch {
        yRatio = null;
      }
    }
    return { page, yRatio };
  } catch {
    return null;
  }
}

async function buildOutlineTree(
  pdf: PdfProxy,
  nodes: OutlineNode[],
  prefix: string
): Promise<OutlineItem[]> {
  const out: OutlineItem[] = [];
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    const id = `${prefix}${i}`;
    const resolved = await resolveDest(pdf, n.dest);
    const children = n.items?.length ? await buildOutlineTree(pdf, n.items, `${id}-`) : [];
    out.push({
      id,
      title: n.title,
      page: resolved?.page ?? null,
      yRatio: resolved?.yRatio ?? null,
      children
    });
  }
  return out;
}

/** Ids of every node that has children — used to expand all by default. */
function collectExpandable(items: OutlineItem[], acc: Set<string>): Set<string> {
  for (const it of items) {
    if (it.children.length) {
      acc.add(it.id);
      collectExpandable(it.children, acc);
    }
  }
  return acc;
}

type Tab = 'thumbnails' | 'outline';

export function PdfNavSidebar({
  pdf,
  fileUrl,
  pdfOptions,
  numPages,
  currentPage,
  onJump
}: {
  pdf: PdfProxy | null;
  fileUrl: string | null;
  pdfOptions: object;
  numPages: number;
  currentPage: number;
  onJump: (page: number, yRatio?: number | null) => void;
}) {
  const t = useTranslations('papers');
  const [tab, setTab] = useState<Tab>('thumbnails');
  const [outline, setOutline] = useState<OutlineItem[] | null>(null);
  const [outlineLoading, setOutlineLoading] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Resolve the outline once the pdf proxy is ready.
  useEffect(() => {
    let cancelled = false;
    if (!pdf) return;
    setOutlineLoading(true);
    pdf
      .getOutline()
      .then(async (raw) => {
        const nodes = raw as OutlineNode[] | null;
        if (!nodes || nodes.length === 0) {
          if (!cancelled) setOutline([]);
          return;
        }
        const tree = await buildOutlineTree(pdf, nodes, '');
        if (!cancelled) {
          setOutline(tree);
          setExpanded(collectExpandable(tree, new Set())); // expand all by default
        }
      })
      .catch(() => {
        if (!cancelled) setOutline([]);
      })
      .finally(() => {
        if (!cancelled) setOutlineLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [pdf]);

  const toggleExpand = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <aside className='flex h-full w-56 shrink-0 flex-col border-r bg-muted/20'>
      {/* Tab switcher */}
      <div className='flex shrink-0 items-center gap-1 border-b p-1.5'>
        <SidebarTabButton
          active={tab === 'thumbnails'}
          onClick={() => setTab('thumbnails')}
          label={t('navThumbnails')}
        >
          <IconPhoto className='size-4' />
        </SidebarTabButton>
        <SidebarTabButton
          active={tab === 'outline'}
          onClick={() => setTab('outline')}
          label={t('navOutline')}
        >
          <IconList className='size-4' />
        </SidebarTabButton>
      </div>

      <div className='min-h-0 flex-1 overflow-y-auto p-2'>
        {tab === 'thumbnails' ? (
          fileUrl ? (
            <Document file={fileUrl} options={pdfOptions} loading={null} error={null}>
              <ul className='flex flex-col items-center gap-3'>
                {Array.from({ length: numPages }, (_, i) => i + 1).map((p) => (
                  <li key={p} className='flex flex-col items-center gap-1'>
                    <button
                      type='button'
                      onClick={() => onJump(p)}
                      aria-current={p === currentPage ? 'page' : undefined}
                      className={cn(
                        'overflow-hidden rounded-sm border-2 transition-colors',
                        p === currentPage
                          ? 'border-primary'
                          : 'border-transparent hover:border-border'
                      )}
                    >
                      <Page
                        pageNumber={p}
                        width={THUMB_WIDTH}
                        renderTextLayer={false}
                        renderAnnotationLayer={false}
                      />
                    </button>
                    <span className='text-xs tabular-nums text-muted-foreground'>{p}</span>
                  </li>
                ))}
              </ul>
            </Document>
          ) : null
        ) : (
          <OutlinePanel
            outline={outline}
            loading={outlineLoading}
            expanded={expanded}
            selectedId={selectedId}
            onToggle={toggleExpand}
            onSelect={(item) => {
              setSelectedId(item.id);
              if (item.page) onJump(item.page, item.yRatio);
            }}
            emptyLabel={t('navOutlineEmpty')}
          />
        )}
      </div>
    </aside>
  );
}

function SidebarTabButton({
  active,
  onClick,
  label,
  children
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type='button'
      onClick={onClick}
      aria-pressed={active}
      title={label}
      aria-label={label}
      className={cn(
        'inline-flex h-8 flex-1 items-center justify-center rounded-md transition-colors',
        active ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:bg-muted'
      )}
    >
      {children}
    </button>
  );
}

function OutlinePanel({
  outline,
  loading,
  expanded,
  selectedId,
  onToggle,
  onSelect,
  emptyLabel
}: {
  outline: OutlineItem[] | null;
  loading: boolean;
  expanded: Set<string>;
  selectedId: string | null;
  onToggle: (id: string) => void;
  onSelect: (item: OutlineItem) => void;
  emptyLabel: string;
}) {
  if (loading || outline === null) {
    return <p className='px-1 py-2 text-xs text-muted-foreground'>…</p>;
  }
  if (outline.length === 0) {
    return <p className='px-1 py-2 text-xs text-muted-foreground'>{emptyLabel}</p>;
  }
  return (
    <ul className='flex flex-col'>
      {outline.map((item) => (
        <OutlineRow
          key={item.id}
          item={item}
          depth={0}
          expanded={expanded}
          selectedId={selectedId}
          onToggle={onToggle}
          onSelect={onSelect}
        />
      ))}
    </ul>
  );
}

function OutlineRow({
  item,
  depth,
  expanded,
  selectedId,
  onToggle,
  onSelect
}: {
  item: OutlineItem;
  depth: number;
  expanded: Set<string>;
  selectedId: string | null;
  onToggle: (id: string) => void;
  onSelect: (item: OutlineItem) => void;
}) {
  const hasChildren = item.children.length > 0;
  const isOpen = expanded.has(item.id);
  const isSelected = selectedId === item.id;
  // Triangle sits in a fixed-width gutter; rows without children align via an
  // empty gutter so titles share a clean left edge at each depth (Edge-style).
  return (
    <li>
      <div
        className={cn(
          'flex items-start rounded transition-colors',
          isSelected ? 'bg-muted' : 'hover:bg-muted/60'
        )}
        style={{ paddingLeft: `${depth * 0.85}rem` }}
      >
        <button
          type='button'
          aria-label={isOpen ? 'collapse' : 'expand'}
          onClick={() => hasChildren && onToggle(item.id)}
          tabIndex={hasChildren ? 0 : -1}
          className={cn(
            'mt-0.5 flex size-5 shrink-0 items-center justify-center text-muted-foreground',
            hasChildren ? 'hover:text-foreground' : 'invisible'
          )}
        >
          <IconChevronRight
            className={cn('size-3.5 transition-transform', isOpen && 'rotate-90')}
          />
        </button>
        <button
          type='button'
          disabled={item.page === null}
          onClick={() => onSelect(item)}
          className={cn(
            'flex-1 py-1 pr-2 text-left text-xs transition-colors',
            item.page === null
              ? 'cursor-default text-muted-foreground/60'
              : 'hover:text-foreground',
            isSelected ? 'font-medium text-foreground' : 'text-foreground/80'
          )}
        >
          <span className='line-clamp-2'>{item.title}</span>
        </button>
      </div>
      {hasChildren && isOpen && (
        <ul className='flex flex-col'>
          {item.children.map((child) => (
            <OutlineRow
              key={child.id}
              item={child}
              depth={depth + 1}
              expanded={expanded}
              selectedId={selectedId}
              onToggle={onToggle}
              onSelect={onSelect}
            />
          ))}
        </ul>
      )}
    </li>
  );
}
