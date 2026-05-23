import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  buildSystemPromptWithMemory,
  renderProceduralMemory,
  renderTenantContext
} from '@/lib/ai/memory/system-prompt-builder';
import * as loader from '@/lib/ai/memory/loader';
import type { AiPreferences, TenantAiContext } from '@/types/memory';

const BASE = 'BASE_PROMPT';

const prefs: AiPreferences = {
  language: 'vi',
  mathNotation: 'latex',
  verbosity: 'concise',
  preferredTier: null,
  tone: 'formal',
  includeReferences: true,
  enableMemory: true,
  updatedAt: 1
};

const tenantCtx: TenantAiContext = {
  labName: 'Lab Vật liệu BKU',
  labDescription: 'Materials science lab.',
  commonMaterials: ['WO3', 'WS2'],
  commonTechniques: ['XRD', 'FTIR'],
  commonEquipment: ['Bruker D8'],
  houseStyle: 'Always cite Materials Project IDs.',
  glossary: { GCD: 'galvanostatic charge-discharge' },
  updatedAt: 1,
  updatedBy: 'admin'
};

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('renderProceduralMemory', () => {
  it('includes language, math, verbosity, tone, references', () => {
    const out = renderProceduralMemory(prefs);
    expect(out).toContain('Vietnamese');
    expect(out).toContain('LaTeX');
    expect(out).toContain('concise');
    expect(out).toContain('formal');
    expect(out).toContain('include citations');
  });
});

describe('renderTenantContext', () => {
  it('includes lab name, techniques, glossary, house style', () => {
    const out = renderTenantContext(tenantCtx);
    expect(out).toContain('Lab Vật liệu BKU');
    expect(out).toContain('XRD, FTIR');
    expect(out).toContain('GCD: galvanostatic charge-discharge');
    expect(out).toContain('Materials Project IDs');
  });
});

describe('buildSystemPromptWithMemory — order + cache flags', () => {
  it('base only when no prefs and no tenant ctx', async () => {
    vi.spyOn(loader, 'loadProceduralMemory').mockResolvedValue(null);
    vi.spyOn(loader, 'loadTenantContext').mockResolvedValue(null);
    const blocks = await buildSystemPromptWithMemory(BASE, { userId: 'u', tenantId: 't' });
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toEqual({ text: BASE, cache: true, cacheTtl: '1h' });
  });

  it('order is base -> tenant -> prefs, all cache:true 1h', async () => {
    vi.spyOn(loader, 'loadProceduralMemory').mockResolvedValue(prefs);
    vi.spyOn(loader, 'loadTenantContext').mockResolvedValue(tenantCtx);
    const blocks = await buildSystemPromptWithMemory(BASE, { userId: 'u', tenantId: 't' });
    expect(blocks).toHaveLength(3);
    expect(blocks[0].text).toBe(BASE);
    expect(blocks[1].text).toContain('Lab context');
    expect(blocks[2].text).toContain('User preferences');
    for (const b of blocks) {
      expect(b.cache).toBe(true);
      expect(b.cacheTtl).toBe('1h');
    }
  });

  it('dynamic block appended last, cache:false', async () => {
    vi.spyOn(loader, 'loadProceduralMemory').mockResolvedValue(prefs);
    vi.spyOn(loader, 'loadTenantContext').mockResolvedValue(null);
    const blocks = await buildSystemPromptWithMemory(BASE, {
      userId: 'u',
      tenantId: 't',
      dynamicBlock: 'SCOPED_PAPERS'
    });
    const last = blocks[blocks.length - 1];
    expect(last.text).toBe('SCOPED_PAPERS');
    expect(last.cache).toBe(false);
    // base + prefs + dynamic
    expect(blocks).toHaveLength(3);
  });

  it('base never moves from index 0 (Gemini prefix-cache safety)', async () => {
    vi.spyOn(loader, 'loadProceduralMemory').mockResolvedValue(prefs);
    vi.spyOn(loader, 'loadTenantContext').mockResolvedValue(tenantCtx);
    const blocks = await buildSystemPromptWithMemory(BASE, {
      userId: 'u',
      tenantId: 't',
      dynamicBlock: 'X'
    });
    expect(blocks[0].text).toBe(BASE);
  });

  it('loader failures are non-fatal (null) -> base only', async () => {
    vi.spyOn(loader, 'loadProceduralMemory').mockResolvedValue(null);
    vi.spyOn(loader, 'loadTenantContext').mockResolvedValue(null);
    const blocks = await buildSystemPromptWithMemory(BASE, { userId: 'u', tenantId: 't' });
    expect(blocks).toHaveLength(1);
  });
});
