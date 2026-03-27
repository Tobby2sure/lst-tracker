'use client';

import { useState, useCallback, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, ReferenceLine, CartesianGrid,
} from 'recharts';
import {
  Search, TrendingUp, Coins, DollarSign, Loader2,
  Info, ExternalLink, CalendarRange, ArrowRight,
  Wallet, ChevronDown, BarChart3,
} from 'lucide-react';
import { TOKEN_META, CHAIN_META, CHAIN_TOKEN_SUPPORT, type SupportedToken, type SupportedChain } from '@/lib/contracts';
import type { PositionSummary } from '@/app/api/positions/route';
import type { RangeResult } from '@/app/api/range/route';

interface RateData {
  token: string; balance: number; rate: number;
  ethValue: number; usdValue: number; ethUsd: number;
}
interface HistoryPoint { date: string; rate: number; }

const fmt = (n: number, d = 4) =>
  n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtUsd = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });

export default function EarningsDashboard() {
  const [wallet, setWallet] = useState('');
  const [token, setToken] = useState<SupportedToken>('ETHx');
  const [chain, setChain] = useState<SupportedChain>('ethereum');
  const [entryRate, setEntryRate] = useState('');
  const [loading, setLoading] = useState(false);
  const [histLoading, setHistLoading] = useState(false);
  const [entryLoading, setEntryLoading] = useState(false);
  const [entryDetected, setEntryDetected] = useState(false);
  const [transfers, setTransfers] = useState<{ hash: string; date: string | null; amount: number; rate_at_block: number }[]>([]);
  const [position, setPosition] = useState<PositionSummary | null>(null);
  const [posLoading, setPosLoading] = useState(false);
  const [rangeFrom, setRangeFrom] = useState('');
  const [rangeTo, setRangeTo] = useState(new Date().toISOString().split('T')[0]);
  const [rangeData, setRangeData] = useState<RangeResult | null>(null);
  const [rangeLoading, setRangeLoading] = useState(false);
  const [data, setData] = useState<RateData | null>(null);
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [histDays, setHistDays] = useState(90);
  const [error, setError] = useState('');
  const [showTransfers, setShowTransfers] = useState(false);

  const meta = TOKEN_META[token];

  const fetchRange = async () => {
    if (!wallet || !data) return;
    setRangeLoading(true);
    setRangeData(null);
    try {
      const res = await fetch(`/api/range?wallet=${wallet}&token=${token}&chain=${chain}&from=${rangeFrom}&to=${rangeTo}&rate=${data.rate}`);
      const json = await res.json();
      if (!json.error) setRangeData(json);
    } catch {}
    setRangeLoading(false);
  };

  useEffect(() => {
    if (data) {
      setData(null); setPosition(null); setHistory([]);
      setEntryRate(''); setEntryDetected(false); setTransfers([]);
      fetchData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, chain]);

  // When chain changes, validate token is supported; reset if not
  const handleChainChange = (newChain: SupportedChain) => {
    setChain(newChain);
    const supported = CHAIN_TOKEN_SUPPORT[newChain];
    if (!supported.includes(token)) {
      setToken(supported[0]);
    }
  };

  const fetchData = useCallback(async () => {
    if (!wallet || !/^0x[0-9a-fA-F]{40}$/.test(wallet)) {
      setError('Enter a valid Ethereum address (0x...)');
      return;
    }
    setError(''); setLoading(true); setHistLoading(true);
    try {
      const [rateRes, histRes] = await Promise.all([
        fetch(`/api/rates?wallet=${wallet}&token=${token}&chain=${chain}`),
        fetch(`/api/history?token=${token}&days=${histDays}`),
      ]);
      const rateJson = await rateRes.json();
      const histJson = await histRes.json();
      if (rateJson.error) throw new Error(rateJson.error);
      setData(rateJson);
      setHistory(histJson.data || []);

      setPosLoading(true);
      fetch(`/api/positions?wallet=${wallet}&token=${token}&chain=${chain}&rate=${rateJson.rate}`)
        .then(r => r.json())
        .then(p => { if (!p.error) setPosition(p); })
        .catch(() => {})
        .finally(() => setPosLoading(false));

      setEntryLoading(true); setEntryDetected(false);
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 12000);
        const entryRes = await fetch(`/api/entry?wallet=${wallet}&token=${token}&chain=${chain}`, { signal: ctrl.signal });
        clearTimeout(t);
        const entryJson = await entryRes.json();
        if (entryJson.weighted_entry_rate && !entryJson.error) {
          setEntryRate(entryJson.weighted_entry_rate.toFixed(6));
          setTransfers(entryJson.transfers || []);
          setEntryDetected(true);
        }
      } catch {}
      finally { setEntryLoading(false); }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load data');
    } finally {
      setLoading(false); setHistLoading(false);
    }
  }, [wallet, token, histDays]);

  const entryRateNum = parseFloat(entryRate) || null;

  return (
    <div className="min-h-screen bg-[#080810] text-white">

      {/* ── NAVBAR ── */}
      <nav className="border-b border-white/[0.06] bg-[#080810]/80 backdrop-blur-xl sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-sky-400 to-violet-500 flex items-center justify-center shadow-lg shadow-sky-500/20">
              <TrendingUp className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="font-semibold text-sm tracking-tight">LST Earnings</span>
            <span className="hidden sm:block text-xs text-zinc-600 border border-white/[0.08] rounded-full px-2 py-0.5">{chain === 'ethereum' ? 'Ethereum Mainnet' : CHAIN_META[chain].name}</span>
          </div>
          <a href="https://github.com/Tobby2sure/lst-tracker" target="_blank" rel="noreferrer"
            className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
            GitHub
          </a>
        </div>
      </nav>

      {/* ── HERO ── */}
      <div className="relative overflow-hidden border-b border-white/[0.06]">
        <div className="absolute inset-0 bg-gradient-to-br from-sky-950/40 via-transparent to-violet-950/30 pointer-events-none" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-48 bg-sky-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="max-w-5xl mx-auto px-4 py-12 sm:py-16 relative">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-1.5 bg-white/[0.04] border border-white/[0.08] rounded-full px-3 py-1 text-xs text-zinc-400 mb-5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Live on-chain data
            </div>
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-3 text-white">
              Track your LST rewards<br className="hidden sm:block" />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-sky-400 to-violet-400"> with precision</span>
            </h1>
            <p className="text-zinc-400 text-sm sm:text-base leading-relaxed">
              Exchange-rate LSTs like ETHx never show you what you&apos;ve actually earned.
              Paste your wallet — we read the chain and do the math for you.
            </p>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-8 space-y-5">

        {/* ── INPUT CARD ── */}
        <Card className="bg-white/[0.03] border-white/[0.07] shadow-xl">
          <CardContent className="pt-5 pb-5 space-y-4">

            {/* Chain selector */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {(Object.keys(CHAIN_META) as SupportedChain[]).map(c => {
                const cm = CHAIN_META[c];
                const active = chain === c;
                return (
                  <button key={c} onClick={() => handleChainChange(c)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all
                      ${active ? 'border-transparent text-white' : 'border-white/[0.08] text-zinc-500 hover:text-zinc-300 hover:border-white/[0.14] bg-transparent'}`}
                    style={active ? { background: `${cm.color}22`, borderColor: `${cm.color}55`, color: cm.color } : {}}>
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: cm.color }} />
                    {cm.name}
                  </button>
                );
              })}
              {chain !== 'ethereum' && (
                <a href={CHAIN_META[chain].bridgeUrl} target="_blank" rel="noreferrer"
                  className="ml-auto flex items-center gap-1 text-[10px] text-zinc-600 hover:text-zinc-400 transition-colors">
                  <ExternalLink className="w-3 h-3" />Bridge
                </a>
              )}
            </div>

            {/* Token tabs — filtered by chain support */}
            <div className="overflow-x-auto -mx-1 px-1 pb-0.5">
              <Tabs value={token} onValueChange={(v) => setToken(v as SupportedToken)}>
                <TabsList className="bg-white/[0.04] border border-white/[0.08] h-9 p-0.5 flex w-max min-w-full gap-0.5">
                  {(CHAIN_TOKEN_SUPPORT[chain] as SupportedToken[]).map(t => (
                    <TabsTrigger key={t} value={t}
                      className="data-[state=active]:bg-white/10 data-[state=active]:shadow-none text-zinc-500 data-[state=active]:text-white text-xs sm:text-sm h-8 px-3 rounded-md flex-shrink-0 transition-all">
                      <span className="w-1.5 h-1.5 rounded-full mr-1.5 flex-shrink-0" style={{ background: TOKEN_META[t].color }} />
                      <span className="font-medium">{TOKEN_META[t].name}</span>
                      <span className="ml-1 text-[10px] text-zinc-600 hidden md:inline">{TOKEN_META[t].protocol}</span>
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            </div>
            {chain !== 'ethereum' && (
              <p className="text-[10px] text-zinc-600 -mt-1">
                Rate is fetched from Ethereum mainnet oracle — balance from {CHAIN_META[chain].name}
              </p>
            )}

            {/* Wallet input row */}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Wallet className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600" />
                <Input value={wallet} onChange={e => setWallet(e.target.value)}
                  placeholder="0x... Ethereum wallet address"
                  className="pl-9 h-11 bg-white/[0.04] border-white/[0.08] text-white placeholder:text-zinc-700 font-mono text-sm focus-visible:ring-1 focus-visible:ring-sky-500/50 focus-visible:border-sky-500/50"
                  onKeyDown={e => e.key === 'Enter' && fetchData()} />
              </div>
              <Button onClick={fetchData} disabled={loading}
                className="h-11 px-6 bg-gradient-to-r from-sky-600 to-sky-500 hover:from-sky-500 hover:to-sky-400 text-white font-medium shadow-lg shadow-sky-500/20 border-0">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Search className="w-4 h-4 mr-1.5" />Check</>}
              </Button>
            </div>

            {error && (
              <p className="text-sm text-red-400 flex items-center gap-1.5 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                <Info className="w-3.5 h-3.5 flex-shrink-0" />{error}
              </p>
            )}

            {/* Entry rate row — only shown after data loads */}
            {(data || entryLoading) && (
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 p-3 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <div className="w-6 h-6 rounded-md bg-amber-500/10 flex items-center justify-center flex-shrink-0">
                    <Info className="w-3 h-3 text-amber-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-zinc-300 font-medium">Entry Rate
                      {entryDetected && <span className="ml-1.5 text-emerald-400 text-[10px]">✓ Auto-detected</span>}
                      {entryLoading && <span className="ml-1.5 text-zinc-600 text-[10px] inline-flex items-center gap-1"><Loader2 className="w-2.5 h-2.5 animate-spin" />Detecting...</span>}
                    </p>
                    <p className="text-[10px] text-zinc-600 truncate">Exchange rate when you staked — used to calculate earnings</p>
                  </div>
                </div>
                <Input value={entryRate} onChange={e => { setEntryRate(e.target.value); setEntryDetected(false); }}
                  placeholder="e.g. 1.042300"
                  className="sm:w-40 h-8 bg-white/[0.04] border-white/[0.08] text-white placeholder:text-zinc-700 text-sm font-mono text-right" />
              </div>
            )}

            {/* Transfers disclosure */}
            {transfers.length > 0 && (
              <div className="rounded-xl border border-white/[0.06] overflow-hidden">
                <button onClick={() => setShowTransfers(v => !v)}
                  className="w-full flex items-center justify-between px-3 py-2.5 text-xs text-zinc-400 hover:bg-white/[0.02] transition-colors">
                  <span>{transfers.length} stake transaction{transfers.length > 1 ? 's' : ''} detected</span>
                  <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showTransfers ? 'rotate-180' : ''}`} />
                </button>
                {showTransfers && (
                  <div className="border-t border-white/[0.06] divide-y divide-white/[0.04]">
                    {transfers.map(tx => (
                      <div key={tx.hash} className="flex items-center justify-between px-3 py-2 text-xs">
                        <span className="text-zinc-500">{tx.date || '—'}</span>
                        <span className="text-white font-medium">+{tx.amount.toFixed(4)} {token}</span>
                        <span className="text-zinc-600">@ {tx.rate_at_block.toFixed(5)}</span>
                        <a href={`https://etherscan.io/tx/${tx.hash}`} target="_blank" rel="noreferrer"
                          className="text-sky-500 hover:text-sky-400 transition-colors">
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── STAT CARDS ── */}
        {data && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              {
                icon: <Coins className="w-4 h-4" style={{ color: meta.color }} />,
                label: `${token} Balance`, accent: meta.color,
                value: fmt(data.balance, 4),
                sub: `≈ ${fmt(data.ethValue, 4)} ETH`,
              },
              {
                icon: <TrendingUp className="w-4 h-4 text-sky-400" />,
                label: 'Exchange Rate', accent: '#38bdf8',
                value: fmt(data.rate, 5),
                sub: 'ETH per token',
              },
              {
                icon: <DollarSign className="w-4 h-4 text-amber-400" />,
                label: 'Current Value', accent: '#fbbf24',
                value: fmtUsd(data.usdValue),
                sub: `${fmt(data.ethValue, 4)} ETH`,
              },
              posLoading
                ? { icon: <Loader2 className="w-4 h-4 animate-spin text-zinc-500" />, label: 'Total Earned', accent: '#10b981', value: '—', sub: 'Computing...' }
                : position
                  ? { icon: <TrendingUp className="w-4 h-4 text-emerald-400" />, label: 'Total Earned', accent: '#10b981', value: `+${fmt(position.total_gain_eth, 4)} ETH`, sub: fmtUsd(position.total_gain_eth * data.ethUsd), highlight: true }
                  : { icon: <Info className="w-4 h-4 text-zinc-600" />, label: 'Total Earned', accent: '#71717a', value: '—', sub: 'No history' },
            ].map((card, i) => (
              <div key={i} className={`rounded-xl border p-4 ${(card as { highlight?: boolean }).highlight ? 'bg-emerald-500/[0.06] border-emerald-500/20' : 'bg-white/[0.03] border-white/[0.07]'}`}>
                <div className="flex items-center gap-1.5 mb-3">
                  {card.icon}
                  <span className="text-xs text-zinc-500">{card.label}</span>
                </div>
                <p className={`text-lg font-bold tabular-nums ${(card as { highlight?: boolean }).highlight ? 'text-emerald-400' : 'text-white'}`}>{card.value}</p>
                <p className="text-xs text-zinc-600 mt-0.5">{card.sub}</p>
              </div>
            ))}
          </div>
        )}

        {/* ── POSITION BREAKDOWN ── */}
        {position && (
          <Card className="bg-white/[0.03] border-white/[0.07]">
            <CardHeader className="pb-3 pt-5">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-md bg-sky-500/10 flex items-center justify-center">
                  <BarChart3 className="w-3.5 h-3.5 text-sky-400" />
                </div>
                <div>
                  <CardTitle className="text-sm text-white">Position — WAC Method</CardTitle>
                  <CardDescription className="text-[11px] text-zinc-600">Weighted average cost across all entries and exits</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 pb-5">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {[
                  { label: 'Cost Basis', value: `${fmt(position.cost_basis_eth, 4)} ETH`, sub: `WAC ${fmt(position.wac, 6)}`, color: 'text-white', bg: 'bg-white/[0.02] border-white/[0.06]' },
                  { label: 'Unrealized', value: `${position.unrealized_gain_eth >= 0 ? '+' : ''}${fmt(position.unrealized_gain_eth, 4)} ETH`, sub: 'On current holdings', color: position.unrealized_gain_eth >= 0 ? 'text-emerald-400' : 'text-red-400', bg: 'bg-emerald-500/[0.04] border-emerald-500/[0.12]' },
                  { label: 'Realized', value: `${position.realized_gain_eth >= 0 ? '+' : ''}${fmt(position.realized_gain_eth, 4)} ETH`, sub: 'Locked in from exits', color: position.realized_gain_eth >= 0 ? 'text-sky-400' : 'text-red-400', bg: 'bg-sky-500/[0.04] border-sky-500/[0.12]' },
                ].map(item => (
                  <div key={item.label} className={`p-3 rounded-xl border ${item.bg}`}>
                    <p className="text-[11px] text-zinc-500 mb-1.5 font-medium uppercase tracking-wider">{item.label}</p>
                    <p className={`text-base font-bold tabular-nums ${item.color}`}>{item.value}</p>
                    <p className="text-[11px] text-zinc-600 mt-0.5">{item.sub}</p>
                  </div>
                ))}
              </div>

              {position.events.length > 0 && (
                <div className="rounded-xl border border-white/[0.06] overflow-hidden">
                  <div className="px-3 py-2 bg-white/[0.02] border-b border-white/[0.06]">
                    <p className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider">Transaction History</p>
                  </div>
                  <div className="max-h-56 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-[#0d0d18]">
                        <tr className="text-zinc-600 border-b border-white/[0.06]">
                          <th className="text-left px-3 py-2 font-medium">Date</th>
                          <th className="text-left px-3 py-2 font-medium">Type</th>
                          <th className="text-right px-3 py-2 font-medium">Amount</th>
                          <th className="text-right px-3 py-2 font-medium hidden sm:table-cell">Rate</th>
                          <th className="text-right px-3 py-2 font-medium">Gain</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/[0.04]">
                        {position.events.map((ev, i) => (
                          <tr key={i} className="hover:bg-white/[0.02] transition-colors">
                            <td className="px-3 py-2 text-zinc-500">{ev.date}</td>
                            <td className="px-3 py-2">
                              <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${ev.type === 'buy' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'}`}>
                                {ev.type === 'buy' ? '↓ Buy' : '↑ Sell'}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-right text-white font-medium tabular-nums">{fmt(ev.amount, 3)}</td>
                            <td className="px-3 py-2 text-right text-zinc-500 tabular-nums hidden sm:table-cell">{fmt(ev.rate_at_event, 5)}</td>
                            <td className={`px-3 py-2 text-right font-medium tabular-nums ${ev.type === 'sell' ? (ev.realized_gain_eth >= 0 ? 'text-emerald-400' : 'text-red-400') : 'text-zinc-700'}`}>
                              {ev.type === 'sell' ? `${ev.realized_gain_eth >= 0 ? '+' : ''}${fmt(ev.realized_gain_eth, 4)}` : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* ── PERIOD & LOT ANALYSIS ── */}
        {data && (
          <Card className="bg-white/[0.03] border-white/[0.07]">
            <CardHeader className="pb-3 pt-5">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-md bg-purple-500/10 flex items-center justify-center">
                  <CalendarRange className="w-3.5 h-3.5 text-purple-400" />
                </div>
                <div>
                  <CardTitle className="text-sm text-white">Period & Lot Analysis</CardTitle>
                  <CardDescription className="text-[11px] text-zinc-600">Earnings for a date range with FIFO lot matching</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 pb-5">
              <div className="flex flex-col sm:flex-row gap-2">
                <div className="flex items-center gap-2 flex-1">
                  <span className="text-xs text-zinc-600 w-7 flex-shrink-0">From</span>
                  <input type="date" value={rangeFrom} onChange={e => setRangeFrom(e.target.value)}
                    className="flex-1 h-9 bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 text-sm text-white focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/20 min-w-0" />
                </div>
                <div className="hidden sm:flex items-center text-zinc-700"><ArrowRight className="w-3.5 h-3.5" /></div>
                <div className="flex items-center gap-2 flex-1">
                  <span className="text-xs text-zinc-600 w-7 flex-shrink-0">To</span>
                  <input type="date" value={rangeTo} onChange={e => setRangeTo(e.target.value)}
                    className="flex-1 h-9 bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 text-sm text-white focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/20 min-w-0" />
                </div>
                <Button onClick={fetchRange} disabled={rangeLoading} size="sm"
                  className="h-9 px-5 bg-purple-600 hover:bg-purple-500 text-white font-medium border-0 flex-shrink-0 w-full sm:w-auto">
                  {rangeLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Analyze'}
                </Button>
              </div>

              {rangeData && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {[
                      { label: 'Start Value', value: `${fmt(rangeData.value_at_start_eth, 4)} ETH`, sub: `Rate ${fmt(rangeData.rate_at_start, 5)}`, hl: false },
                      { label: 'End Value', value: `${fmt(rangeData.value_at_end_eth, 4)} ETH`, sub: `Rate ${fmt(rangeData.rate_at_end, 5)}`, hl: false },
                      { label: 'Realized', value: `${rangeData.realized_in_period_eth >= 0 ? '+' : ''}${fmt(rangeData.realized_in_period_eth, 4)} ETH`, sub: 'From exits', hl: rangeData.realized_in_period_eth > 0 },
                      { label: 'Unrealized', value: `${rangeData.unrealized_gain_eth >= 0 ? '+' : ''}${fmt(rangeData.unrealized_gain_eth, 4)} ETH`, sub: 'Open lots', hl: rangeData.unrealized_gain_eth > 0 },
                    ].map(item => (
                      <div key={item.label} className={`p-3 rounded-xl border ${item.hl ? 'bg-emerald-500/[0.04] border-emerald-500/[0.12]' : 'bg-white/[0.02] border-white/[0.06]'}`}>
                        <p className="text-[11px] text-zinc-600 mb-1.5 uppercase tracking-wider font-medium">{item.label}</p>
                        <p className={`text-sm font-bold tabular-nums ${item.hl ? 'text-emerald-400' : 'text-white'}`}>{item.value}</p>
                        <p className="text-[11px] text-zinc-600 mt-0.5">{item.sub}</p>
                      </div>
                    ))}
                  </div>

                  {rangeData.lots.length > 0 && (
                    <div className="rounded-xl border border-white/[0.06] overflow-hidden">
                      <div className="px-3 py-2 bg-white/[0.02] border-b border-white/[0.06]">
                        <p className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider">FIFO Lots</p>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs min-w-[520px]">
                          <thead className="bg-[#0d0d18]">
                            <tr className="text-zinc-600 border-b border-white/[0.06]">
                              {['Buy Date', 'Sell Date', 'Amount', 'Buy Rate', 'Sell Rate', 'Gain (ETH)'].map(h => (
                                <th key={h} className={`px-3 py-2 font-medium ${h === 'Amount' || h === 'Buy Rate' || h === 'Sell Rate' || h === 'Gain (ETH)' ? 'text-right' : 'text-left'}`}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-white/[0.04]">
                            {rangeData.lots.map((lot, i) => (
                              <tr key={i} className="hover:bg-white/[0.02] transition-colors">
                                <td className="px-3 py-2 text-zinc-400">{lot.buy_date}</td>
                                <td className="px-3 py-2">
                                  {lot.sell_date
                                    ? <span className="text-zinc-400">{lot.sell_date}</span>
                                    : <span className="text-amber-400/60 text-[11px] italic">Open</span>}
                                </td>
                                <td className="px-3 py-2 text-right text-white font-medium tabular-nums">{fmt(lot.amount, 3)}</td>
                                <td className="px-3 py-2 text-right text-zinc-500 tabular-nums">{fmt(lot.buy_rate, 5)}</td>
                                <td className="px-3 py-2 text-right text-zinc-500 tabular-nums">
                                  {lot.sell_rate ? fmt(lot.sell_rate, 5) : <span className="text-zinc-700">—</span>}
                                </td>
                                <td className={`px-3 py-2 text-right font-bold tabular-nums ${lot.gain_eth === null ? 'text-amber-400/70' : lot.gain_eth >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                  {lot.gain_eth === null
                                    ? `~${fmt(lot.amount * (rangeData.rate_at_end - lot.buy_rate), 4)}`
                                    : `${lot.gain_eth >= 0 ? '+' : ''}${fmt(lot.gain_eth, 4)}`}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <p className="text-[11px] text-zinc-700 px-3 py-2 border-t border-white/[0.04]">~ Open lot gains estimated at current rate</p>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* ── RATE CHART ── */}
        {history.length > 0 && (
          <Card className="bg-white/[0.03] border-white/[0.07]">
            <CardHeader className="pb-2 pt-5">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-sm text-white">{token} / ETH Rate History</CardTitle>
                  <CardDescription className="text-[11px] text-zinc-600 mt-0.5">Rising rate = more ETH per token</CardDescription>
                </div>
                <div className="flex gap-1 bg-white/[0.03] border border-white/[0.06] rounded-lg p-0.5">
                  {[30, 90, 180].map(d => (
                    <button key={d} onClick={() => setHistDays(d)}
                      className={`px-2.5 py-1 text-[11px] rounded-md transition-all ${histDays === d ? 'bg-white/10 text-white' : 'text-zinc-600 hover:text-zinc-400'}`}>
                      {d}d
                    </button>
                  ))}
                </div>
              </div>
            </CardHeader>
            <CardContent className="pb-5">
              <div className="h-48 sm:h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={history} margin={{ left: -12, right: 8, top: 4, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#52525b' }} tickFormatter={v => v.slice(5)} interval="preserveStartEnd" />
                    <YAxis tick={{ fontSize: 10, fill: '#52525b' }} tickFormatter={v => v.toFixed(4)} domain={['auto', 'auto']} />
                    <Tooltip
                      contentStyle={{ background: '#111118', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, fontSize: 12 }}
                      labelStyle={{ color: '#71717a' }}
                      formatter={((v: unknown) => [typeof v === 'number' ? v.toFixed(6) : String(v), 'Rate']) as never}
                    />
                    {entryRateNum && (
                      <ReferenceLine y={entryRateNum} stroke="#f59e0b" strokeDasharray="4 3"
                        label={{ value: 'Entry', fill: '#f59e0b', fontSize: 10, position: 'insideTopRight' }} />
                    )}
                    <Line type="monotone" dataKey="rate" stroke={meta.color} strokeWidth={2.5}
                      dot={false} activeDot={{ r: 5, fill: meta.color, stroke: '#080810', strokeWidth: 2 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              {histLoading && (
                <p className="text-xs text-zinc-600 text-center mt-2 flex items-center justify-center gap-1.5">
                  <Loader2 className="w-3 h-3 animate-spin" />Loading history...
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {/* ── EXPLAINER (empty state) ── */}
        {!data && !loading && (
          <div className="grid sm:grid-cols-3 gap-3">
            {[
              { icon: '🔗', title: 'On-chain reads', desc: 'Balance and exchange rate fetched live from Ethereum mainnet — no third-party price feeds.' },
              { icon: '⚖️', title: 'WAC accounting', desc: 'Weighted average cost tracks your true ETH basis across unlimited entries and exits.' },
              { icon: '📅', title: 'Period analysis', desc: 'Set a date range to see exactly what you earned in any window, with FIFO lot matching.' },
            ].map(item => (
              <div key={item.title} className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                <div className="text-2xl mb-2">{item.icon}</div>
                <p className="text-sm font-medium text-white mb-1">{item.title}</p>
                <p className="text-xs text-zinc-500 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        )}

        {/* footer */}
        <p className="text-center text-[11px] text-zinc-700 pb-6">
          Read-only · no wallet connection needed · rates approximate using APR growth model
        </p>
      </div>
    </div>
  );
}
