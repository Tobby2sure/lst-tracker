import { NextRequest, NextResponse } from 'next/server';

// Dune Analytics query IDs for historical ETHx and rsETH exchange rates
// These query the StaderOracle ExchangeRateUpdated events
const DUNE_QUERIES: Record<string, number> = {
  ETHx: 3576963, // ETHx exchange rate history
  rsETH: 3576964, // rsETH price history
};

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get('token') || 'ETHx';
  const days = parseInt(searchParams.get('days') || '90');

  const duneApiKey = process.env.DUNE_API_KEY;

  if (!duneApiKey) {
    // Return mock historical data if no API key — for demo purposes
    return NextResponse.json({ data: generateMockHistory(days, token), source: 'mock' });
  }

  try {
    const queryId = DUNE_QUERIES[token];
    const res = await fetch(
      `https://api.dune.com/api/v1/query/${queryId}/results?limit=180`,
      { headers: { 'X-Dune-API-Key': duneApiKey }, next: { revalidate: 3600 } }
    );
    const json = await res.json();
    const rows = json?.result?.rows || [];

    const data = rows
      .slice(-days)
      .map((row: Record<string, unknown>) => ({
        date: row.date || row.block_date,
        rate: Number(row.exchange_rate || row.rate || row.price || 1),
      }))
      .filter((r: { date: unknown; rate: number }) => r.date && r.rate > 0);

    return NextResponse.json({ data, source: 'dune' });
  } catch (err) {
    console.error('Dune fetch error:', err);
    return NextResponse.json({ data: generateMockHistory(days, token), source: 'mock' });
  }
}

function generateMockHistory(days: number, token: string): { date: string; rate: number }[] {
  const startRates: Record<string, number> = { ETHx: 1.042, rsETH: 1.028, agETH: 1.008, hgETH: 1.010 };
  const aprs: Record<string, number>       = { ETHx: 0.045, rsETH: 0.038, agETH: 0.040, hgETH: 0.042 };
  const startRate = startRates[token] ?? 1.01;
  const dailyGrowth = (aprs[token] ?? 0.040) / 365;
  const result = [];
  const now = Date.now();

  for (let i = days; i >= 0; i--) {
    const date = new Date(now - i * 86400000).toISOString().split('T')[0];
    const noise = 1 + (Math.random() - 0.5) * 0.0002;
    const rate = startRate * Math.pow(1 + dailyGrowth, days - i) * noise;
    result.push({ date, rate: parseFloat(rate.toFixed(6)) });
  }
  return result;
}
