/**
 * Export a rendered recharts <svg> to a downloadable SVG or PNG. Computed styles
 * are inlined (recharts uses currentColor + CSS classes that don't survive a raw
 * serialize), and a white background is added so the figure reads on slides/print.
 * @phase R300
 */
const STYLE_PROPS = [
  'fill',
  'stroke',
  'stroke-width',
  'stroke-dasharray',
  'stroke-opacity',
  'fill-opacity',
  'opacity',
  'font-size',
  'font-family',
  'font-weight',
  'color'
];

function inlineStyles(src: Element, dst: Element): void {
  const cs = window.getComputedStyle(src);
  let style = '';
  for (const p of STYLE_PROPS) {
    const v = cs.getPropertyValue(p);
    if (v) style += `${p}:${v};`;
  }
  dst.setAttribute('style', style);
  const sc = src.children;
  const dc = dst.children;
  for (let i = 0; i < sc.length && i < dc.length; i++) inlineStyles(sc[i], dc[i]);
}

function serialize(svg: SVGSVGElement): { data: string; width: number; height: number } {
  const rect = svg.getBoundingClientRect();
  const width = Math.max(1, Math.round(rect.width));
  const height = Math.max(1, Math.round(rect.height));
  const clone = svg.cloneNode(true) as SVGSVGElement;
  inlineStyles(svg, clone);
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', String(width));
  clone.setAttribute('height', String(height));
  const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  bg.setAttribute('width', String(width));
  bg.setAttribute('height', String(height));
  bg.setAttribute('fill', 'white');
  clone.insertBefore(bg, clone.firstChild);
  return { data: new XMLSerializer().serializeToString(clone), width, height };
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportSvg(svg: SVGSVGElement, filename: string): void {
  const { data } = serialize(svg);
  triggerDownload(new Blob([data], { type: 'image/svg+xml;charset=utf-8' }), filename);
}

export async function exportPng(svg: SVGSVGElement, filename: string, scale = 2): Promise<void> {
  const { data, width, height } = serialize(svg);
  const url = `data:image/svg+xml;base64,${window.btoa(unescape(encodeURIComponent(data)))}`;
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.addEventListener('load', () => resolve(), { once: true });
    img.addEventListener('error', () => reject(new Error('image load failed')), { once: true });
    img.src = url;
  });
  const canvas = document.createElement('canvas');
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.scale(scale, scale);
  ctx.drawImage(img, 0, 0);
  canvas.toBlob((blob) => {
    if (blob) triggerDownload(blob, filename);
  }, 'image/png');
}
