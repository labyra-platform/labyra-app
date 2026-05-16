/**
 * T5 Auditor orchestrator — peer-review audit of T3/T4 responses.
 *
 * Flow:
 *   1. Extract claims from response text
 *   2. Build evidence block from RAG chunks
 *   3. Single Opus 4.7 call evaluating ALL claims (efficient batching)
 *   4. Parse findings, compute overall confidence
 *   5. Save to tenants/{tid}/aiAudits/{auditId}
 *
 * @phase R173-5
 */
import 'server-only';
import { selectProvider } from '@/lib/ai/providers';
import { getAdminFirestoreService } from '@/lib/firebase/admin';
import { extractClaims } from './claim-extractor';
import { AUDITOR_SYSTEM_PROMPT } from './audit-prompts';
import type { AuditorOptions, AuditResult, AuditFinding, Verdict } from './types';
import type { AiCostBreakdown } from '@/types/ai';

const MAX_CLAIMS_PER_RUN = 15;
const VERDICT_WEIGHTS: Record<Verdict, number> = {
  supported: 1.0,
  partially_supported: 0.6,
  unsupported: 0.3,
  contradicted: 0.0
};

function emptyCost(): AiCostBreakdown {
  return {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    usd: 0
  };
}

function computeOverallConfidence(findings: AuditFinding[]): number {
  if (findings.length === 0) return 0;
  const weightedSum = findings.reduce(
    (sum, f) => sum + VERDICT_WEIGHTS[f.verdict] * f.confidence,
    0
  );
  return weightedSum / findings.length;
}

export async function runAuditor(opts: AuditorOptions): Promise<AuditResult> {
  const { tenantId, conversationId, messageId, responseText, onClaimEvaluated } = opts;
  const ragChunks = opts.ragChunks ?? [];
  const startedAt = Date.now();

  // 1. Extract claims
  const claims = extractClaims(responseText).slice(0, MAX_CLAIMS_PER_RUN);

  if (claims.length === 0) {
    // No auditable claims — return empty result
    const auditId = `audit_${Date.now()}_empty`;
    return {
      auditId,
      sourceMessageId: messageId,
      sourceConversationId: conversationId,
      findings: [],
      overallConfidence: 1.0,
      supportedCount: 0,
      unsupportedCount: 0,
      contradictedCount: 0,
      totalCost: emptyCost(),
      evaluatorModel: 'claude-opus-4-7',
      evaluatedAt: Date.now(),
      durationMs: Date.now() - startedAt
    };
  }

  // 2. Build evidence block
  let evidenceBlock = '## Available Source Chunks\n\n';
  if (ragChunks.length === 0) {
    evidenceBlock += '(No RAG sources provided. Audit based on world knowledge only.)\n';
  } else {
    for (const chunk of ragChunks.slice(0, 10)) {
      evidenceBlock += `### chunkId=${chunk.chunkId} (paperId=${chunk.paperId})\n`;
      evidenceBlock += `${(chunk.text ?? '(text not provided)').slice(0, 500)}\n\n`;
    }
  }

  // 3. Build claims block
  let claimsBlock = '## Claims to Audit\n\n';
  for (let i = 0; i < claims.length; i++) {
    claimsBlock += `${i + 1}. [${claims[i].type}] ${claims[i].text}\n`;
  }

  // 4. Single Opus call evaluating all claims
  const { provider, config } = selectProvider(5);
  let auditJson = '';
  let totalCost = emptyCost();

  for await (const event of provider.streamChat({
    model: config.model,
    maxTokens: 4096,
    system: [
      { text: AUDITOR_SYSTEM_PROMPT, cache: true, cacheTtl: '1h' },
      { text: evidenceBlock, cache: false }
    ],
    messages: [{ role: 'user', content: claimsBlock + '\n\nOutput JSON array of findings.' }]
  })) {
    if (event.type === 'text_delta') {
      auditJson += event.delta;
    } else if (event.type === 'message_complete') {
      totalCost = event.usage;
    } else if (event.type === 'error') {
      throw new Error(`T5 Auditor error: ${event.message ?? 'unknown'}`);
    }
  }

  // 5. Parse JSON response
  const cleaned = auditJson.replace(/```json|```/g, '').trim();
  let parsed: AuditFinding[];
  try {
    parsed = JSON.parse(cleaned) as AuditFinding[];
  } catch (err) {
    throw new Error(
      `T5 Auditor JSON parse failed: ${err instanceof Error ? err.message : 'unknown'}`
    );
  }

  // Validate + stream callback
  const findings: AuditFinding[] = [];
  for (const raw of parsed) {
    const finding: AuditFinding = {
      claim: String(raw.claim ?? ''),
      type: raw.type,
      verdict: raw.verdict,
      confidence: Number(raw.confidence ?? 0),
      evidenceChunkIds: Array.isArray(raw.evidenceChunkIds) ? raw.evidenceChunkIds : [],
      reasoning: String(raw.reasoning ?? '')
    };
    findings.push(finding);
    onClaimEvaluated?.(finding);
  }

  // 6. Compute aggregates
  const supportedCount = findings.filter((f) => f.verdict === 'supported').length;
  const unsupportedCount = findings.filter((f) => f.verdict === 'unsupported').length;
  const contradictedCount = findings.filter((f) => f.verdict === 'contradicted').length;
  const overallConfidence = computeOverallConfidence(findings);

  // 7. Save to Firestore
  const db = getAdminFirestoreService();
  const auditId = `audit_${Date.now()}_${messageId.slice(-6)}`;
  const result: AuditResult = {
    auditId,
    sourceMessageId: messageId,
    sourceConversationId: conversationId,
    findings,
    overallConfidence,
    supportedCount,
    unsupportedCount,
    contradictedCount,
    totalCost,
    evaluatorModel: config.model,
    evaluatedAt: Date.now(),
    durationMs: Date.now() - startedAt
  };

  await db.doc(`tenants/${tenantId}/aiAudits/${auditId}`).set({ ...result, schemaVersion: 1 });

  return result;
}
