/**
 * PubChem CAS → compound metadata + GHS classification.
 *
 * Two-step (verified):
 *   1. PUG REST: CAS → CID + MolecularFormula + Title.
 *   2. PUG View: CID → GHS Classification (pictograms, signal, H-statements).
 *
 * Public API, no key. Be polite: short timeout, single retry-free call.
 * GHS data is sparse for many CAS — we return what's available; callers
 * treat empty hazards as "verify manually".
 *
 * @phase CHEM-2
 */
import 'server-only';
import type { GHSPictogram } from '@/types/chemical';
import { toChemistryConvention } from '@/lib/chemicals/formula-convention';

const PUG_REST = 'https://pubchem.ncbi.nlm.nih.gov/rest/pug';
const PUG_VIEW = 'https://pubchem.ncbi.nlm.nih.gov/rest/pug_view';

export interface PubChemResult {
  cid: number;
  name?: string;
  formula?: string;
  ghsHazards: GHSPictogram[];
  hazardStatements: string[];
  signalWord?: 'Danger' | 'Warning';
}

const PICTOGRAM_CODES: GHSPictogram[] = [
  'GHS01',
  'GHS02',
  'GHS03',
  'GHS04',
  'GHS05',
  'GHS06',
  'GHS07',
  'GHS08',
  'GHS09'
];

function extractPictogramCode(url: string): GHSPictogram | null {
  // URLs look like https://pubchem.ncbi.nlm.nih.gov/images/ghs/GHS02.svg
  for (const code of PICTOGRAM_CODES) {
    if (url.includes(`${code}.svg`)) return code;
  }
  return null;
}

async function fetchJson(url: string, timeoutMs = 8000): Promise<unknown | null> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' }
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

interface PugRestProps {
  PropertyTable?: {
    Properties?: Array<{
      CID?: number;
      MolecularFormula?: string;
      Title?: string;
      IUPACName?: string;
    }>;
  };
}

async function lookupCid(
  cas: string
): Promise<{ cid: number; formula?: string; name?: string } | null> {
  const url = `${PUG_REST}/compound/name/${encodeURIComponent(cas)}/property/MolecularFormula,IUPACName,Title/JSON`;
  const json = (await fetchJson(url)) as PugRestProps | null;
  const p = json?.PropertyTable?.Properties?.[0];
  if (!p?.CID) return null;
  // R576: PubChem gives Hill notation, which writes salts anion-first (NaCl as
  // ClNa). Normalise the binary-salt case to chemistry convention; everything
  // else passes through unchanged, and the user can override in the form.
  return {
    cid: p.CID,
    formula: toChemistryConvention(p.MolecularFormula),
    name: p.Title ?? p.IUPACName
  };
}

interface PugViewNode {
  TOCHeading?: string;
  Information?: Array<{
    Name?: string;
    Value?: {
      StringWithMarkup?: Array<{
        String?: string;
        Markup?: Array<{ URL?: string; Extra?: string }>;
      }>;
    };
  }>;
  Section?: PugViewNode[];
}

function walkSections(node: PugViewNode, out: PugViewNode[]): void {
  if (node.Information && node.Information.length > 0) out.push(node);
  for (const s of node.Section ?? []) walkSections(s, out);
}

async function lookupGhs(cid: number): Promise<{
  ghsHazards: GHSPictogram[];
  hazardStatements: string[];
  signalWord?: 'Danger' | 'Warning';
}> {
  const url = `${PUG_VIEW}/data/compound/${cid}/JSON?heading=GHS+Classification`;
  const json = (await fetchJson(url)) as { Record?: { Section?: PugViewNode[] } } | null;
  const result: {
    ghsHazards: GHSPictogram[];
    hazardStatements: string[];
    signalWord?: 'Danger' | 'Warning';
  } = {
    ghsHazards: [],
    hazardStatements: []
  };
  if (!json?.Record?.Section) return result;

  const nodes: PugViewNode[] = [];
  for (const s of json.Record.Section) walkSections(s, nodes);

  const pictos = new Set<GHSPictogram>();
  for (const node of nodes) {
    for (const info of node.Information ?? []) {
      if (info.Name === 'Pictogram(s)') {
        for (const swm of info.Value?.StringWithMarkup ?? []) {
          for (const m of swm.Markup ?? []) {
            const code = m.URL ? extractPictogramCode(m.URL) : null;
            if (code) pictos.add(code);
          }
        }
      }
      if (info.Name === 'Signal') {
        const sig = info.Value?.StringWithMarkup?.[0]?.String;
        if (sig === 'Danger' || sig === 'Warning') result.signalWord = sig;
      }
      if (info.Name === 'GHS Hazard Statements') {
        for (const swm of info.Value?.StringWithMarkup ?? []) {
          const text = swm.String ?? '';
          // Extract H-codes like H225, H314.
          const matches = text.match(/H\d{3}/g);
          if (matches) for (const h of matches) result.hazardStatements.push(h);
        }
      }
    }
  }
  result.ghsHazards = Array.from(pictos);
  result.hazardStatements = Array.from(new Set(result.hazardStatements));
  return result;
}

export async function lookupCas(cas: string): Promise<PubChemResult | null> {
  const base = await lookupCid(cas);
  if (!base) return null;
  const ghs = await lookupGhs(base.cid);
  return {
    cid: base.cid,
    name: base.name,
    formula: base.formula,
    ghsHazards: ghs.ghsHazards,
    hazardStatements: ghs.hazardStatements,
    signalWord: ghs.signalWord
  };
}
