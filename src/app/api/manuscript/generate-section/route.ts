/**
 * Generate one manuscript section (HITL) — Server-Sent Events: a stream of
 * text deltas followed by a final `complete` event carrying the draft, its
 * citations, and deterministic grounding (R276). Auth mirrors /api/chat
 * (Bearer ID token → tenant claim). RAG is collection-scoped server-side via
 * the manuscript's collectionId; lab-number un-flagging (Gap1) activates once
 * the caller supplies a lab whitelist (wired when measurements are read).
 *
 * @phase R-aiscience-3
 * @see labyra-ai-science-manuscript-strategy.md §4
 */
import type { GenerateSectionRequest, ManuscriptSectionType } from '@/features/manuscript/types';
import { generateManuscriptSection } from '@/lib/ai/manuscript/generate-section';
import { getTenantIdFromToken } from '@/lib/auth/token';
import { getAdminAuthService } from '@/lib/firebase/admin';
import { logger } from '@/lib/logger';
import { checkRateLimit, rateLimitKey } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';
export const maxDuration = 60;

const SECTION_TYPES = new Set<ManuscriptSectionType>([
  'abstract',
  'introduction',
  'materials',
  'methods',
  'results_discussion',
  'conclusion'
]);

function jsonError(error: string, status: number, extra?: Record<string, unknown>): Response {
  return new Response(JSON.stringify({ error, ...extra }), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

export async function POST(request: Request): Promise<Response> {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return jsonError('missing_token', 401);

  const idToken = authHeader.slice('Bearer '.length);
  let decoded;
  try {
    decoded = await getAdminAuthService().verifyIdToken(idToken);
  } catch {
    return jsonError('invalid_token', 401);
  }

  const tenantId = getTenantIdFromToken(decoded);
  if (!tenantId) return jsonError('missing_tenant_claim', 403);

  const rl = await checkRateLimit(
    rateLimitKey('manuscript-section', `${tenantId}:${decoded.uid}`),
    10,
    60
  );
  if (!rl.allowed) {
    return new Response(JSON.stringify({ error: 'rate_limited' }), {
      status: 429,
      headers: { 'content-type': 'application/json', 'Retry-After': String(rl.resetSec) }
    });
  }

  let body: GenerateSectionRequest;
  try {
    body = (await request.json()) as GenerateSectionRequest;
  } catch {
    return jsonError('invalid_json', 400);
  }

  const { manuscript, sectionType, instruction } = body;
  if (
    !manuscript ||
    typeof manuscript.title !== 'string' ||
    typeof manuscript.collectionId !== 'string'
  ) {
    return jsonError('manuscript_required', 400);
  }
  if (!SECTION_TYPES.has(sectionType)) return jsonError('invalid_section_type', 400);

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      const send = (event: object) =>
        controller.enqueue(enc.encode(`data: ${JSON.stringify(event)}\n\n`));
      try {
        const result = await generateManuscriptSection({
          tenantId,
          manuscript,
          sectionType,
          instruction,
          onTextDelta: (delta) => send({ type: 'text_delta', delta })
        });
        send({
          type: 'complete',
          section: result.section,
          draft: result.draft,
          citations: result.citations,
          grounding: result.grounding
        });
      } catch (err) {
        logger.error('manuscript_section_failed', { tenantId, sectionType, error: String(err) });
        send({ type: 'error', message: 'generation_failed' });
      } finally {
        controller.close();
      }
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive'
    }
  });
}
