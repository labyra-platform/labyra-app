import { searchPapers } from '@/lib/ai/rag/search';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(req: Request) {
  if (process.env.NODE_ENV === 'production') {
    return new Response('disabled in production', { status: 403 });
  }
  try {
    const { query, tenantId = 'tenant-dev-001' } = await req.json();
    if (!query) {
      return Response.json({ error: 'query required' }, { status: 400 });
    }
    const result = await searchPapers({ tenantId, query });
    return Response.json(result);
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
