'use client';

import { useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, ReferenceLine, CartesianGrid,
} from 'recharts';
import { Search, TrendingUp, Coins, DollarSign, Loader2, Info, ExternalLink } from 'lucide-react';
import { TOKEN_META, type SupportedToken } from '@/lib/contracts';

interface RateData {
  token: string;
  balance: number;
  rate: number;
  ethValue: number;
  usdValue: number;
  ethUsd: number;
}

interface HistoryPoint { date: string; rate: number; }

const fmt = (n: number, d = 4) => n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtUsd = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });

export default function EarningsDashboard() {
  const [wallet, setWallet] = useState('');
  const [token, setToken] = useState<SupportedToken>('ETHx');
  const [entryRate, setEntryRate] = useState('');
  const [loading, setLoading] = useState(false);
  const [histLoading, setHistLoading] = useState(false);
  const [entryLoading, setEntryLoading] = useState(false);
  const [entryDetected, setEntryDetected] = useState(false);
  const [transfers, setTransfers] = useState<{hash: string; date: string | null; amount: number; rate_at_block: number; eth_value_at_entry: number}[]>([]);
  const [data, setData] = useState<RateData | null>(null);
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [histDays, setHistDays] = useState(90);
  const [error, setError] = useState('');

  const fetchData = useCallback(async () => {
    if (!wallet || !/^0x[0-9a-fA-F]{40}$/.test(wallet)) {
      setError('Enter a valid Ethereum wallet address (0x...)');
      return;
    }
    setError('');
    setLoading(true);
    setHistLoading(true);

    try {
      const [rateRes, histRes] = await Promise.all([
        fetch(`/api/rates?wallet=${wallet}&token=${token}`),
        fetch(`/api/history?token=${token}&days=${histDays}`),
      ]);

      const rateJson = await rateRes.json();
      const histJson = await histRes.json();

      if (rateJson.error) throw new Error(rateJson.error);
      setData(rateJson);
      setHistory(histJson.data || []);

      // Auto-detect entry rate from tx history (with 12s timeout)
      setEntryLoading(true);
      setEntryDetected(false);
      try {
        const entryController = new AbortController();
        const entryTimeout = setTimeout(() => entryController.abort(), 12000);
        const entryRes = await fetch(`/api/entry?wallet=${wallet}&token=${token}`, {
          signal: entryController.signal,
        });
        clearTimeout(entryTimeout);
        const entryJson = await entryRes.json();
        if (entryJson.weighted_entry_rate && !entryJson.error) {
          setEntryRate(entryJson.weighted_entry_rate.toFixed(6));
          setTransfers(entryJson.transfers || []);
          setEntryDetected(true);
        }
      } catch {
        // Timed out or failed — user can enter manually
      } finally {
        setEntryLoading(false);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load data');
    } finally {
      setLoading(false);
      setHistLoading(false);
    }
  }, [wallet, token, histDays]);

  // Derived earnings calculations
  const entryRateNum = parseFloat(entryRate) || null;
  const earnings = data && entryRateNum
    ? (data.rate - entryRateNum) * data.balance
    : null;
  const earningsUsd = earnings && data ? earnings * data.ethUsd : null;
  const earningsPct = entryRateNum && data
    ? ((data.rate - entryRateNum) / entryRateNum) * 100
    : null;

  // Annualized APR estimate (requires entry date but we can estimate from % gain)
  const meta = TOKEN_META[token];

  // Find entry rate in history chart
  const entryPoint = entryRateNum
    ? history.find(h => Math.abs(h.rate - entryRateNum) < 0.0005)
    : null;

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      {/* Header */}
      <div className="border-b border-white/5 bg-black/40 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-sky-500 to-violet-600 flex items-center justify-center">
              <TrendingUp className="w-4 h-4 text-white" />
            </div>
            <div>
              <h1 className="font-semibold text-white text-sm">LST Earnings</h1>
              <p className="text-xs text-zinc-500">Track your liquid staking rewards</p>
            </div>
          </div>
          <Badge variant="outline" className="text-xs border-white/10 text-zinc-400">
            Ethereum Mainnet
          </Badge>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">

        {/* Token selector + wallet input */}
        <Card className="bg-white/[0.03] border-white/5">
          <CardHeader className="pb-3">
            <CardTitle className="text-base text-white">Your Position</CardTitle>
            <CardDescription className="text-zinc-500 text-sm">
              Enter your wallet address to see your LST holdings and earnings
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Token tabs */}
            <Tabs value={token} onValueChange={(v) => setToken(v as SupportedToken)}>
              <TabsList className="bg-white/5 border border-white/10">
                {(Object.keys(TOKEN_META) as SupportedToken[]).map(t => (
                  <TabsTrigger
                    key={t}
                    value={t}
                    className="data-[state=active]:bg-white/10 text-zinc-400 data-[state=active]:text-white text-sm"
                  >
                    <span className="w-2 h-2 rounded-full mr-1.5 inline-block" style={{ background: TOKEN_META[t].color }} />
                    {TOKEN_META[t].name}
                    <span className="ml-1.5 text-xs text-zinc-600">({TOKEN_META[t].protocol})</span>
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>

            {/* Wallet input */}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                <Input
                  value={wallet}
                  onChange={e => setWallet(e.target.value)}
                  placeholder="0x... wallet address"
                  className="pl-9 bg-white/5 border-white/10 text-white placeholder:text-zinc-600 font-mono text-sm"
                  onKeyDown={e => e.key === 'Enter' && fetchData()}
                />
              </div>
              <Button
                onClick={fetchData}
                disabled={loading}
                className="bg-sky-600 hover:bg-sky-500 text-white px-6"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Check'}
              </Button>
            </div>

            {/* Entry rate (optional) */}
            <div className="flex items-start gap-3 p-3 rounded-lg bg-white/[0.02] border border-white/5">
              <Info className="w-4 h-4 text-zinc-500 mt-0.5 flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-zinc-400">
                    <strong className="text-white">Entry rate</strong> — rate when you staked.{' '}
                    {entryDetected
                      ? <span className="text-emerald-400">Auto-detected from your tx history ✓</span>
                      : <span>We&apos;ll auto-detect this from your wallet history.</span>
                    }
                  </p>
                  {entryLoading && <Loader2 className="w-3 h-3 animate-spin text-zinc-500 flex-shrink-0" />}
                </div>
                <Input
                  value={entryRate}
                  onChange={e => { setEntryRate(e.target.value); setEntryDetected(false); }}
                  placeholder={data ? `Detecting...` : `Rate auto-detected on lookup`}
                  className="bg-white/5 border-white/10 text-white placeholder:text-zinc-600 text-sm h-8"
                />
                {transfers.length > 0 && (
                  <div className="mt-2 space-y-1 max-h-32 overflow-y-auto">
                    <p className="text-xs text-zinc-500 mb-1">{transfers.length} transfer(s) detected:</p>
                    {transfers.map(tx => (
                      <div key={tx.hash} className="flex items-center justify-between text-xs text-zinc-500 hover:text-zinc-300">
                        <span>{tx.date || '—'}</span>
                        <span>+{tx.amount.toFixed(4)} {token}</span>
                        <span className="text-zinc-600">@ {tx.rate_at_block.toFixed(5)}</span>
                        <a href={`https://etherscan.io/tx/${tx.hash}`} target="_blank" rel="noreferrer" className="text-sky-500 hover:text-sky-400">
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {error && <p className="text-sm text-red-400">{error}</p>}
          </CardContent>
        </Card>

        {/* Stats */}
        {data && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard
              icon={<Coins className="w-4 h-4" style={{ color: meta.color }} />}
              label={`${token} Balance`}
              value={fmt(data.balance, 4)}
              sub={`≈ ${fmt(data.ethValue, 4)} ETH`}
            />
            <StatCard
              icon={<TrendingUp className="w-4 h-4 text-emerald-400" />}
              label="Exchange Rate"
              value={`${fmt(data.rate, 6)}`}
              sub={`${token} per ETH`}
              invert
            />
            <StatCard
              icon={<DollarSign className="w-4 h-4 text-amber-400" />}
              label="ETH Value"
              value={`${fmt(data.ethValue, 4)} ETH`}
              sub={fmtUsd(data.usdValue)}
            />
            {earnings !== null ? (
              <StatCard
                icon={<TrendingUp className="w-4 h-4 text-emerald-400" />}
                label="Earned"
                value={`+${fmt(earnings, 4)} ETH`}
                sub={`${fmtUsd(earningsUsd || 0)} · +${earningsPct?.toFixed(2)}%`}
                highlight
              />
            ) : (
              <StatCard
                icon={<Info className="w-4 h-4 text-zinc-500" />}
                label="Earned"
                value="—"
                sub="Enter entry rate above"
              />
            )}
          </div>
        )}

        {/* Chart */}
        {history.length > 0 && (
          <Card className="bg-white/[0.03] border-white/5">
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-sm text-white">{token} / ETH Exchange Rate</CardTitle>
                <CardDescription className="text-xs text-zinc-500 mt-0.5">
                  Historical rate — higher = more ETH per token
                </CardDescription>
              </div>
              <div className="flex gap-1">
                {[30, 90, 180].map(d => (
                  <button
                    key={d}
                    onClick={() => setHistDays(d)}
                    className={`px-2 py-1 text-xs rounded ${histDays === d ? 'bg-white/10 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
                  >
                    {d}d
                  </button>
                ))}
              </div>
            </CardHeader>
            <CardContent>
              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={history} margin={{ left: -10, right: 8, top: 4, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 10, fill: '#71717a' }}
                      tickFormatter={v => v.slice(5)}
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: '#71717a' }}
                      tickFormatter={v => v.toFixed(4)}
                      domain={['auto', 'auto']}
                    />
                    <Tooltip
                      contentStyle={{ background: '#18181b', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, fontSize: 12 }}
                      labelStyle={{ color: '#a1a1aa' }}
                      formatter={((v: unknown) => [typeof v === 'number' ? v.toFixed(6) : String(v), 'Rate']) as never}
                    />
                    {entryRateNum && (
                      <ReferenceLine
                        y={entryRateNum}
                        stroke="#f59e0b"
                        strokeDasharray="4 4"
                        label={{ value: 'Your entry', fill: '#f59e0b', fontSize: 10, position: 'insideTopRight' }}
                      />
                    )}
                    <Line
                      type="monotone"
                      dataKey="rate"
                      stroke={meta.color}
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4, fill: meta.color }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              {histLoading && (
                <p className="text-xs text-zinc-500 text-center mt-2 flex items-center justify-center gap-1">
                  <Loader2 className="w-3 h-3 animate-spin" /> Loading rate history...
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {/* How it works */}
        {!data && (
          <Card className="bg-white/[0.03] border-white/5">
            <CardContent className="pt-6">
              <h3 className="text-sm font-medium text-white mb-4">How exchange-rate LSTs work</h3>
              <div className="space-y-3 text-sm text-zinc-400">
                <p>
                  Unlike rebase tokens (stETH), your <strong className="text-white">ETHx and rsETH balance never changes</strong>. Instead, each token becomes worth more ETH over time as staking rewards accumulate.
                </p>
                <div className="grid grid-cols-3 gap-3 my-4">
                  {[
                    { label: 'You stake', value: '10 ETH', sub: 'Day 0' },
                    { label: 'You receive', value: '9.58 ETHx', sub: 'At rate 1.0438' },
                    { label: '6 months later', value: '10.21 ETH', sub: '+0.21 ETH earned' },
                  ].map(item => (
                    <div key={item.label} className="p-3 rounded-lg bg-white/[0.02] border border-white/5 text-center">
                      <p className="text-xs text-zinc-500 mb-1">{item.label}</p>
                      <p className="font-semibold text-white">{item.value}</p>
                      <p className="text-xs text-zinc-600 mt-0.5">{item.sub}</p>
                    </div>
                  ))}
                </div>
                <p>This tool reads the current exchange rate on-chain and shows you exactly how much ETH your tokens are worth — and how much you&apos;ve earned if you provide your entry rate.</p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, sub, highlight, invert }: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  highlight?: boolean;
  invert?: boolean;
}) {
  return (
    <Card className={`border-white/5 ${highlight ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-white/[0.03]'}`}>
      <CardContent className="pt-4 pb-4">
        <div className="flex items-center gap-1.5 mb-2">{icon}<p className="text-xs text-zinc-500">{label}</p></div>
        <p className={`text-lg font-semibold ${highlight ? 'text-emerald-400' : invert ? 'text-sky-400' : 'text-white'}`}>
          {value}
        </p>
        {sub && <p className="text-xs text-zinc-500 mt-0.5">{sub}</p>}
      </CardContent>
    </Card>
  );
}
