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
import { IconList, IconPhoto } from '@tabler/icons-react';
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
}
interface OutlineNode {
  title: string;
  dest: string | unknown[] | null;
  items: OutlineNode[];
}

/** A flattened outline entry with its resolved 1-based page (or null). */
interface FlatOutline {
  title: string;
  page: number | null;
  depth: number;
}

async function resolvePage(pdf: PdfProxy, dest: string | unknown[] | null): Promise<number | null> {
  try {
    const explicit = typeof dest === 'string' ? await pdf.getDestination(dest) : dest;
    const ref = explicit?.[0];
    if (!ref || typeof ref !== 'object') return null;
    const idx = await pdf.getPageIndex(ref as object);
    return idx + 1;
  } catch {
    return null;
  }
}

async function flattenOutline(
  pdf: PdfProxy,
  nodes: OutlineNode[],
  depth: number,
  out: FlatOutline[]
): Promise<void> {
  for (const n of nodes) {
    out.push({ title: n.title, page: await resolvePage(pdf, n.dest), depth });
    if (n.items?.length) await flattenOutline(pdf, n.items, depth + 1, out);
  }
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
  onJump: (page: number) => void;
}) {
  const t = useTranslations('papers');
  const [tab, setTab] = useState<Tab>('thumbnails');
  const [outline, setOutline] = useState<FlatOutline[] | null>(null);
  const [outlineLoading, setOutlineLoading] = useState(false);

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
        const flat: FlatOutline[] = [];
        await flattenOutline(pdf, nodes, 0, flat);
        if (!cancelled) setOutline(flat);
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
            currentPage={currentPage}
            onJump={onJump}
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
  currentPage,
  onJump,
  emptyLabel
}: {
  outline: FlatOutline[] | null;
  loading: boolean;
  currentPage: number;
  onJump: (page: number) => void;
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
      {outline.map((item, i) => (
        <li key={`${item.title}-${i}`}>
          <button
            type='button'
            disabled={item.page === null}
            onClick={() => item.page && onJump(item.page)}
            className={cn(
              'w-full rounded px-2 py-1 text-left text-xs transition-colors',
              item.page === null ? 'cursor-default text-muted-foreground/60' : 'hover:bg-muted',
              item.page === currentPage && 'bg-muted font-medium text-foreground'
            )}
            style={{ paddingLeft: `${0.5 + item.depth * 0.75}rem` }}
          >
            <span className='line-clamp-2'>{item.title}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
