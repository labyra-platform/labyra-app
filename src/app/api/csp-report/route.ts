/**
 * POST /api/csp-report — receive Content-Security-Policy violation reports.
 *
 * Browser sends JSON body when a CSP violation occurs (report-uri directive).
 * Log to Vercel structured logs for 7-day burn-in review before enforcing.
 *
 * @phase H1-CSP-report-only
 */
export const runtime = 'nodejs';

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await request.json();
    const report = body['csp-report'] ?? body;
    // eslint-disable-next-line no-console -- intentional structured CSP log
    console.warn(
      JSON.stringify({
        level: 'warn',
        event: 'csp_violation',
        blockedUri: report['blocked-uri'],
        violatedDirective: report['violated-directive'],
        effectiveDirective: report['effective-directive'],
        documentUri: report['document-uri'],
        originalPolicy: report['original-policy']?.slice(0, 200)
      })
    );
  } catch {
    // Malformed report — ignore silently
  }
  return new Response(null, { status: 204 });
}
