import { NextRequest, NextResponse } from 'next/server';
import { getTikTokGuardrails } from '@/lib/link-import/tiktok-guardrails';
import { inspectTikTokPage, TIKTOK_DIAGNOSTIC_POSTS } from '@/lib/link-import/providers/tiktok-page';

export const runtime = 'nodejs';
export const maxDuration = 300;

const MAX_PROBES = 10;
const MIN_SPACING_MS = 10_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function reserveSlot(): Promise<boolean> {
  const guardrails = getTikTokGuardrails();
  if (!guardrails) return false;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (await guardrails.reserveRequestSlot()) return true;
    await sleep(500);
  }
  return false;
}

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  if (request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const probes: Array<{
    index: number;
    url: string;
    status: number | null;
    shell: boolean;
    rateLimited: boolean;
  }> = [];
  let lastStartedAt = 0;
  for (let index = 0; index < MAX_PROBES; index += 1) {
    const url = TIKTOK_DIAGNOSTIC_POSTS[index % TIKTOK_DIAGNOSTIC_POSTS.length];
    if (lastStartedAt > 0) await sleep(Math.max(0, MIN_SPACING_MS - (Date.now() - lastStartedAt)));
    if (!(await reserveSlot())) {
      return NextResponse.json({ error: 'TikTok diagnostic could not reserve a safe request slot', probes }, { status: 503 });
    }
    lastStartedAt = Date.now();
    const result = await inspectTikTokPage(url);
    probes.push({ index: index + 1, url, ...result });
  }

  return NextResponse.json({ count: probes.length, probes });
}
