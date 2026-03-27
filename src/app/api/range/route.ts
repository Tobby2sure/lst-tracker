import { NextRequest, NextResponse } from 'next/server';
import { type SupportedToken } from '@/lib/contracts';

interface AlchemyTransfer {
  hash: string;
  from: string;
  to: string;
  value: number;
  metadata?: { blockTimestamp?: string };
}

function approximateRateAtDate(token: SupportedToken, dateStr: string): number {
  const launchDates: Record<SupportedToken, string> = {
    ETHx:  '2023-05-10',
    rsETH: '2024-01-18',
    agETH: '2024-04-01',
    hgETH: '2024-06-01',
  };
  const aprRates: Record<SupportedToken, number> = {
    ETHx: 0.045, rsETH: 0.038, agETH: 0.040, hgETH: 0.042,
  };
  const launch = new Date(launchDates[token]).getTime();
  const target = new Date(dateStr).getTime();
  const days = Math.max(0, (target - launch) / 86400000);
  return Math.pow(1 + aprRates[token] / 365, days);
}

export interface Lot {
  buy_hash: string;
  buy_date: string;
  sell_hash: string | null;
  sell_date: string | null;
  amount: number;
  buy_rate: number;
  sell_rate: number | null;      // null = still open
  gain_eth: number | null;       // null = unrealized
  status: 'open' | 'closed';
}

export interface RangeResult {
  from_date: string;
  to_date: string;
  balance_at_start: number;
  balance_at_end: number;
  rate_at_start: number;
  rate_at_end: number;
  value_at_start_eth: number;
  value_at_end_eth: number;
  period_gain_eth: number;
  realized_in_period_eth: number;
  unrealized_gain_eth: number;
  lots: Lot[];
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const wallet = searchParams.get('wallet') as `0x${string}` | null;
  const token = (searchParams.get('token') || 'ETHx') as SupportedToken;
  const fromDate = searchParams.get('from') || '';   // YYYY-MM-DD
  const toDate = searchParams.get('to') || new Date().toISOString().split('T')[0];
  const currentRate = parseFloat(searchParams.get('rate') || '0');

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
  const contractAddr = tokenAddresses[token];
  const alchemyUrl = `https://eth-mainnet.g.alchemy.com/v2/${alchemyKey}`;

  const fetchTransfers = async (direction: 'in' | 'out') => {
    const body = {
      jsonrpc: '2.0', id: direction === 'in' ? 1 : 2,
      method: 'alchemy_getAssetTransfers',
      params: [{
        ...(direction === 'in' ? { toAddress: wallet } : { fromAddress: wallet }),
        contractAddresses: [contractAddr],
        category: ['erc20'],
        withMetadata: true,
        excludeZeroValue: true,
        maxCount: '0x64',
        order: 'asc',
      }],
    };
    const res = await fetch(alchemyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    return (json?.result?.transfers || []) as AlchemyTransfer[];
  };

  const [inbound, outbound] = await Promise.all([
    fetchTransfers('in'),
    fetchTransfers('out'),
  ]);

  // Merge all events, sorted by date
  type Event = { hash: string; date: string; type: 'buy' | 'sell'; amount: number };
  const allEvents: Event[] = [
    ...inbound.map(t => ({
      hash: t.hash,
      date: (t.metadata?.blockTimestamp || '').split('T')[0] || toDate,
      type: 'buy' as const,
      amount: t.value || 0,
    })),
    ...outbound.map(t => ({
      hash: t.hash,
      date: (t.metadata?.blockTimestamp || '').split('T')[0] || toDate,
      type: 'sell' as const,
      amount: t.value || 0,
    })),
  ].sort((a, b) => a.date.localeCompare(b.date));

  // --- DATE RANGE STATS ---
  // Reconstruct balance at fromDate and toDate by replaying events
  let balanceAtStart = 0;
  let balanceAtEnd = 0;
  let realizedInPeriod = 0;

  // FIFO queue for lot matching
  type OpenLot = { hash: string; date: string; amount: number; rate: number };
  const openLots: OpenLot[] = [];
  const closedLots: Lot[] = [];

  for (const ev of allEvents) {
    const rate = approximateRateAtDate(token, ev.date);
    const beforeFrom = fromDate ? ev.date < fromDate : false;
    const inPeriod = (!fromDate || ev.date >= fromDate) && ev.date <= toDate;

    if (beforeFrom) {
      // Replay events before range to get correct opening balance
      if (ev.type === 'buy') {
        balanceAtStart += ev.amount;
        openLots.push({ hash: ev.hash, date: ev.date, amount: ev.amount, rate });
      } else {
        balanceAtStart = Math.max(0, balanceAtStart - ev.amount);
        // FIFO: consume from open lots
        let remaining = ev.amount;
        while (remaining > 0 && openLots.length > 0) {
          const lot = openLots[0];
          const consumed = Math.min(lot.amount, remaining);
          closedLots.push({
            buy_hash: lot.hash, buy_date: lot.date,
            sell_hash: ev.hash, sell_date: ev.date,
            amount: consumed,
            buy_rate: lot.rate, sell_rate: rate,
            gain_eth: consumed * (rate - lot.rate),
            status: 'closed',
          });
          lot.amount -= consumed;
          remaining -= consumed;
          if (lot.amount <= 0.00001) openLots.shift();
        }
      }
      balanceAtEnd = balanceAtStart;
    }

    if (inPeriod) {
      if (ev.type === 'buy') {
        balanceAtEnd += ev.amount;
        openLots.push({ hash: ev.hash, date: ev.date, amount: ev.amount, rate });
      } else {
        balanceAtEnd = Math.max(0, balanceAtEnd - ev.amount);
        let remaining = ev.amount;
        while (remaining > 0 && openLots.length > 0) {
          const lot = openLots[0];
          const consumed = Math.min(lot.amount, remaining);
          const gain = consumed * (rate - lot.rate);
          realizedInPeriod += gain;
          closedLots.push({
            buy_hash: lot.hash, buy_date: lot.date,
            sell_hash: ev.hash, sell_date: ev.date,
            amount: consumed,
            buy_rate: lot.rate, sell_rate: rate,
            gain_eth: gain,
            status: 'closed',
          });
          lot.amount -= consumed;
          remaining -= consumed;
          if (lot.amount <= 0.00001) openLots.shift();
        }
      }
    }
  }

  // Remaining open lots
  const openLotsResult: Lot[] = openLots
    .filter(l => l.amount > 0.00001)
    .map(l => ({
      buy_hash: l.hash, buy_date: l.date,
      sell_hash: null, sell_date: null,
      amount: l.amount,
      buy_rate: l.rate, sell_rate: null,
      gain_eth: null,
      status: 'open' as const,
    }));

  const allLots = [...closedLots, ...openLotsResult]
    .sort((a, b) => a.buy_date.localeCompare(b.buy_date));

  const rateAtStart = fromDate ? approximateRateAtDate(token, fromDate) : 1;
  const rateAtEnd = currentRate || approximateRateAtDate(token, toDate);
  const valueAtStart = balanceAtStart * rateAtStart;
  const valueAtEnd = balanceAtEnd * rateAtEnd;
  const unrealizedGain = openLots.reduce((s, l) => s + l.amount * (rateAtEnd - l.rate), 0);
  const periodGain = realizedInPeriod + unrealizedGain + (valueAtEnd - balanceAtEnd * rateAtStart);

  return NextResponse.json({
    from_date: fromDate || allEvents[0]?.date || toDate,
    to_date: toDate,
    balance_at_start: balanceAtStart,
    balance_at_end: balanceAtEnd,
    rate_at_start: rateAtStart,
    rate_at_end: rateAtEnd,
    value_at_start_eth: valueAtStart,
    value_at_end_eth: valueAtEnd,
    period_gain_eth: periodGain,
    realized_in_period_eth: realizedInPeriod,
    unrealized_gain_eth: unrealizedGain,
    lots: allLots,
  } satisfies RangeResult);
}
