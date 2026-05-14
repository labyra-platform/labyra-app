/**
 * Legacy /api/spectra/* redirect → /api/measurements/*
 *
 * @phase R164-phase-5b-2
 * @deprecated Use /api/measurements/[id]/signed-download. Will be removed in R166.
 */
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const url = new URL(req.url);
  const target = new URL(
    url.pathname.replace('/api/spectra', '/api/measurements') + url.search,
    req.url
  );
  return NextResponse.redirect(target, 308);
}
