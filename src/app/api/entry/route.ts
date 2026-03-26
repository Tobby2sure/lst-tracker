import { NextRequest, NextResponse } from 'next/server';
import { type SupportedToken } from '@/lib/contracts';

interface AlchemyTransfer {
  blockNum: string;
  hash: string;
  from: string;
  to: string;
  value: number;
  asset: string;
  metadata?: { blockTimestamp?: string };
}

// Get exchange rate at a specific date from the history mock/Dune data
// Instead of slow per-block RPC calls, we interpolate from daily rate history
async function getRateAtDate(token: SupportedToken, dateStr: string, baseUrl: string): Promise<number | null> {
  try {
    const res = await fetch(`${baseUrl}/api/history?token=${token}&days=365`, {
      next: { revalidate: 3600 },
    });
    const json = await res.json();
    const history: { date: string; rate: number }[] = json?.data || [];
    if (!history.length) return null;

    // Find closest date in history
    const target = new Date(dateStr).getTime();
    let closest = history[0];
    let minDiff = Infinity;
    for (const point of history) {
      const diff = Math.abs(new Date(point.date).getTime() - target);
      if (diff < minDiff) { minDiff = diff; closest = point; }
    }
    return closest.rate;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const wallet = searchParams.get('wallet') as `0x${string}` | null;
  const token = (searchParams.get('token') || 'ETHx') as SupportedToken;

  if (!wallet || !/^0x[0-9a-fA-F]{40}$/.test(wallet)) {
    return NextResponse.json({ error: 'Invalid wallet address' }, { status: 400 });
  }

  const alchemyKey = process.env.ALCHEMY_API_KEY;
  if (!alchemyKey) {
    return NextResponse.json({ error: 'ALCHEMY_API_KEY not configured' }, { status: 500 });
  }

  const tokenAddress = token === 'ETHx'
    ? '0xA35b1B31Ce002FBF2058D22F30f95D405200A15b'
    : '0xA1290d69c65A6Fe4DF752f95823fae25cB99e5A7';

  try {
    const alchemyUrl = `https://eth-mainnet.g.alchemy.com/v2/${alchemyKey}`;

    // Get inbound transfers with timestamps
    const res = await fetch(alchemyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 1,
        method: 'alchemy_getAssetTransfers',
        params: [{
          toAddress: wallet,
          contractAddresses: [tokenAddress],
          category: ['erc20'],
          withMetadata: true,
          excludeZeroValue: true,
          maxCount: '0x14', // 20 transfers
          order: 'asc',
        }],
      }),
    });

    const json = await res.json();
    const transfers: AlchemyTransfer[] = json?.result?.transfers || [];

    if (transfers.length === 0) {
      return NextResponse.json({ transfers: [], weighted_entry_rate: null });
    }

    // Base URL for calling our own history API
    const baseUrl = req.nextUrl.origin;

    // Get rate for each transfer using date-based lookup (fast — no per-block RPC)
    const enriched = await Promise.all(
      transfers.map(async (tx) => {
        const ts = tx.metadata?.blockTimestamp;
        const date = ts ? ts.split('T')[0] : null;
        const rate = date ? await getRateAtDate(token, date, baseUrl) : null;

        return {
          hash: tx.hash,
          date,
          amount: tx.value || 0,
          rate_at_block: rate || 0,
          eth_value_at_entry: (tx.value || 0) * (rate || 0),
        };
      })
    );

    // Filter to transfers where we got a rate
    const valid = enriched.filter(t => t.rate_at_block > 0);
    const totalTokens = valid.reduce((s, t) => s + t.amount, 0);
    const weightedRate = totalTokens > 0
      ? valid.reduce((s, t) => s + t.rate_at_block * t.amount, 0) / totalTokens
      : null;

    return NextResponse.json({
      transfers: enriched,
      weighted_entry_rate: weightedRate,
      total_tokens_received: totalTokens,
      earliest_transfer: enriched[0] || null,
    });

  } catch (err) {
    console.error('Entry rate fetch error:', err);
    return NextResponse.json({ error: 'Failed to fetch transfer history' }, { status: 500 });
  }
}
