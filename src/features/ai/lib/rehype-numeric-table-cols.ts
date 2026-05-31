/**
 * Rehype plugin — mark numeric table columns for right-alignment.
 *
 * For every GFM table, any column whose body cells are ALL numeric (digits plus
 * common scientific symbols: . , % ° ± + − – — / × ( ) and whitespace) gets the
 * `lb-num` class on its <th> and <td>, so the chat-markdown CSS can right-align
 * it with tabular figures — the publication convention for numeric columns.
 *
 * Self-contained: no `hast`/`unist-util-visit` import (those aren't direct deps).
 * Operates on the hast tree the same way rehype-katex does, so it applies under
 * react-markdown v10 (verified in isolation) — unlike a mdast/remark transform.
 *
 * @phase R247 (AI render upgrade — Phase 1, CSS tables)
 */

interface HastNode {
  type: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
}

// Digits + scientific punctuation/symbols. A cell must additionally contain at
// least one digit (checked separately) so a column of dashes/blanks isn't
// mistaken for numeric.
const NUMERIC_RE = /^[\d.,%°±+\-−–—/×x()\s]+$/u;

function textOf(node: HastNode): string {
  if (node.type === 'text') return node.value ?? '';
  if (node.children) return node.children.map(textOf).join('');
  return '';
}

function addClass(node: HastNode, cls: string): void {
  const props = (node.properties ??= {});
  const cur = props.className;
  if (Array.isArray(cur)) cur.push(cls);
  else if (typeof cur === 'string') props.className = cur.length > 0 ? `${cur} ${cls}` : cls;
  else props.className = [cls];
}

function rowCells(tr: HastNode): HastNode[] {
  return (tr.children ?? []).filter(
    (c) => c.type === 'element' && (c.tagName === 'td' || c.tagName === 'th')
  );
}

function sectionRows(table: HastNode, tag: 'thead' | 'tbody'): HastNode[] {
  const section = (table.children ?? []).find((c) => c.type === 'element' && c.tagName === tag);
  if (!section) return [];
  return (section.children ?? []).filter((c) => c.type === 'element' && c.tagName === 'tr');
}

function isNumericCell(cell: HastNode | undefined): boolean {
  if (!cell) return false;
  const txt = textOf(cell).trim();
  return /\d/.test(txt) && NUMERIC_RE.test(txt);
}

function processTable(table: HastNode): void {
  const bodyRows = sectionRows(table, 'tbody');
  if (bodyRows.length === 0) return;
  const headCells = (() => {
    const headRows = sectionRows(table, 'thead');
    return headRows[0] ? rowCells(headRows[0]) : [];
  })();
  const colCount = Math.max(0, ...bodyRows.map((r) => rowCells(r).length));

  for (let c = 0; c < colCount; c++) {
    const allNumeric = bodyRows.every((r) => isNumericCell(rowCells(r)[c]));
    if (!allNumeric) continue;
    if (headCells[c]) addClass(headCells[c], 'lb-num');
    for (const r of bodyRows) {
      const cell = rowCells(r)[c];
      if (cell) addClass(cell, 'lb-num');
    }
  }
}

function walk(node: HastNode): void {
  if (node.type === 'element' && node.tagName === 'table') processTable(node);
  if (node.children) for (const child of node.children) walk(child);
}

export function rehypeNumericTableCols(): (tree: HastNode) => void {
  return (tree: HastNode) => walk(tree);
}
