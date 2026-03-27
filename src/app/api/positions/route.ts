import { NextRequest, NextResponse } from 'next/server';
import { CONTRACTS, L2_RSETH_ADDRESS, CHAIN_META, type SupportedToken, type SupportedChain } from '@/lib/contracts';

function getAlchemyUrl(chain: SupportedChain, apiKey: string): string {
  const networkMap: Record<SupportedChain, string> = {
    ethereum: 'eth-mainnet',
    arbitrum: 'arb-mainnet',
    base:     'base-mainnet',
    optimism: 'opt-mainnet',
  };
  return `https://${networkMap[chain]}.g.alchemy.com/v2/${apiKey}`;
}

function getTokenAddress(token: SupportedToken, chain: SupportedChain): string {
  if (token === 'rsETH' && chain !== 'ethereum') {
    return L2_RSETH_ADDRESS[chain] || CONTRACTS.rsETH.token;
  }
  return ({
    ETHx:  CONTRACTS.ETHx.token,
    rsETH: CONTRACTS.rsETH.token,
    agETH: CONTRACTS.agETH.token,
    hgETH: CONTRACTS.hgETH.token,
  } as Record<SupportedToken, string>)[token];
}

interface AlchemyTransfer {
  blockNum: string;
  hash: string;
  from: string;
  to: string;
  value: number;
  asset: string;
  metadata?: { blockTimestamp?: string };
}

export interface PositionEvent {
  hash: string;
  date: string;
  type: 'buy' | 'sell';
  amount: number;
  rate_at_event: number;         // ETH per token at this event
  eth_value: number;             // ETH value of the transfer
  wac_before: number;            // WAC before this event
  wac_after: number;             // WAC after this event
  running_balance: number;       // token balance after this event
  realized_gain_eth: number;     // gain realized on this event (sells only)
}

export interface PositionSummary {
  events: PositionEvent[];
  current_balance: number;
  wac: number;                   // weighted average cost basis (ETH per token)
  realized_gain_eth: number;     // total realized gains from all exits
  unrealized_gain_eth: number;   // gain on current holdings vs WAC
  total_gain_eth: number;
  current_rate: number;
  cost_basis_eth: number;        // current_balance × wac
  current_value_eth: number;     // current_balance × current_rate
}

// Approximate rate at a date using APR growth model
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
  return 1.0 * Math.pow(1 + aprRates[token] / 365, daysSinceLaunch);
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const wallet = searchParams.get('wallet') as `0x${string}` | null;
  const token = (searchParams.get('token') || 'ETHx') as SupportedToken;
  const chain = (searchParams.get('chain') || 'ethereum') as SupportedChain;
  const currentRate = parseFloat(searchParams.get('rate') || '0');

  if (!wallet || !/^0x[0-9a-fA-F]{40}$/.test(wallet)) {
    return NextResponse.json({ error: 'Invalid wallet address' }, { status: 400 });
  }

  const alchemyKey = process.env.ALCHEMY_API_KEY;
  if (!alchemyKey) {
    return NextResponse.json({ error: 'ALCHEMY_API_KEY not configured' }, { status: 500 });
  }

  const tokenAddress = getTokenAddress(token, chain);
  const alchemyUrl = getAlchemyUrl(chain, alchemyKey);

  try {
    // Fetch both inbound (buys) AND outbound (sells) transfers
    const [inRes, outRes] = await Promise.all([
      fetch(alchemyUrl, {
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
            maxCount: '0x64',
            order: 'asc',
          }],
        }),
      }),
      fetch(alchemyUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0', id: 2,
          method: 'alchemy_getAssetTransfers',
          params: [{
            fromAddress: wallet,
            contractAddresses: [tokenAddress],
            category: ['erc20'],
            withMetadata: true,
            excludeZeroValue: true,
            maxCount: '0x64',
            order: 'asc',
          }],
        }),
      }),
    ]);

    const [inJson, outJson] = await Promise.all([inRes.json(), outRes.json()]);
    const inbound: AlchemyTransfer[] = inJson?.result?.transfers || [];
    const outbound: AlchemyTransfer[] = outJson?.result?.transfers || [];

    // Merge and sort chronologically
    const allEvents = [
      ...inbound.map(t => ({ ...t, direction: 'buy' as const })),
      ...outbound.map(t => ({ ...t, direction: 'sell' as const })),
    ].sort((a, b) => {
      const ta = a.metadata?.blockTimestamp || '';
      const tb = b.metadata?.blockTimestamp || '';
      return ta.localeCompare(tb);
    });

    // Walk through events and compute WAC + realized gains
    let wac = 0;
    let balance = 0;
    let totalRealizedGain = 0;
    const events: PositionEvent[] = [];

    for (const tx of allEvents) {
      const ts = tx.metadata?.blockTimestamp;
      const date = ts ? ts.split('T')[0] : new Date().toISOString().split('T')[0];
      const rate = approximateRateAtDate(token, date);
      const amount = tx.value || 0;
      const wacBefore = wac;

      let realizedGain = 0;

      if (tx.direction === 'buy') {
        // Update WAC: (old_balance × old_wac + new_amount × rate) / new_balance
        const newBalance = balance + amount;
        wac = newBalance > 0
          ? (balance * wac + amount * rate) / newBalance
          : rate;
        balance = newBalance;
      } else {
        // Sell: realized gain = amount × (exit_rate - wac)
        realizedGain = amount * (rate - wac);
        totalRealizedGain += realizedGain;
        balance = Math.max(0, balance - amount);
        // WAC stays the same on sell (WAC method)
      }

      events.push({
        hash: tx.hash,
        date,
        type: tx.direction,
        amount,
        rate_at_event: rate,
        eth_value: amount * rate,
        wac_before: wacBefore,
        wac_after: wac,
        running_balance: balance,
        realized_gain_eth: realizedGain,
      });
    }

    const unrealizedGain = currentRate > 0
      ? balance * (currentRate - wac)
      : 0;

    const summary: PositionSummary = {
      events,
      current_balance: balance,
      wac,
      realized_gain_eth: totalRealizedGain,
      unrealized_gain_eth: unrealizedGain,
      total_gain_eth: totalRealizedGain + unrealizedGain,
      current_rate: currentRate,
      cost_basis_eth: balance * wac,
      current_value_eth: balance * currentRate,
    };

    return NextResponse.json(summary);
  } catch (err) {
    console.error('Position calc error:', err);
    return NextResponse.json({ error: 'Failed to compute position' }, { status: 500 });
  }
}
