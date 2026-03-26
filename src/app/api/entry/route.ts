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

// Approximate exchange rate at a given date using known APR growth model
// ETHx launched ~May 2023 at ~1.0; grows ~4.5% APY
// rsETH launched ~Jan 2024 at ~1.0; grows ~3.8% APY
function approximateRateAtDate(token: SupportedToken, dateStr: string): number {
  const launchDates: Record<SupportedToken, string> = {
    ETHx:  '2023-05-10',
    rsETH: '2024-01-18',
    agETH: '2024-04-01',
    hgETH: '2024-06-01',
  };
  const aprRates: Record<SupportedToken, number> = {
    ETHx:  0.045,
    rsETH: 0.038,
    agETH: 0.040,
    hgETH: 0.042,
  };
  const launch = new Date(launchDates[token]).getTime();
  const target = new Date(dateStr).getTime();
  const daysSinceLaunch = Math.max(0, (target - launch) / 86400000);
  const dailyRate = aprRates[token] / 365;
  return 1.0 * Math.pow(1 + dailyRate, daysSinceLaunch);
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

  const tokenAddresses: Record<string, string> = {
    ETHx:  '0xA35b1B31Ce002FBF2058D22F30f95D405200A15b',
    rsETH: '0xA1290d69c65A6Fe4DF752f95823fae25cB99e5A7',
    agETH: '0xe1B4d34E8754600962Cd944B535180Bd758E6c2e',
    hgETH: '0xc824A08dB624942c5E5F330d56530cD1598859fD',
  };
  const tokenAddress = tokenAddresses[token] || tokenAddresses['ETHx'];

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

    // Get rate for each transfer using date-based approximation (fast — no RPC calls)
    const enriched = await Promise.all(
      transfers.map(async (tx) => {
        const ts = tx.metadata?.blockTimestamp;
        const date = ts ? ts.split('T')[0] : null;
        const rate = date ? approximateRateAtDate(token, date) : null;

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
