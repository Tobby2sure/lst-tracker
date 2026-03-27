import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient, http, formatEther } from 'viem';
import { mainnet, arbitrum, base, optimism } from 'viem/chains';
import { defineChain } from 'viem';

const mode = defineChain({
  id: 34443,
  name: 'Mode',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: ['https://mainnet.mode.network'] } },
  blockExplorers: { default: { name: 'Blockscout', url: 'https://explorer.mode.network' } },
});
import {
  CONTRACTS, STADER_ORACLE_ABI, LRTORACLE_ADDRESS, LRTORACLE_ABI,
  ERC20_ABI, ERC4626_ABI,
  CHAIN_META, L2_RSETH_ADDRESS,
  type SupportedToken, type SupportedChain,
} from '@/lib/contracts';

// ─── RPC helpers ─────────────────────────────────────────────────────────────

function getMainnetRpcs(): string[] {
  const urls: string[] = [];
  if (process.env.ETHEREUM_RPC_URL) urls.push(process.env.ETHEREUM_RPC_URL);
  if (process.env.ALCHEMY_API_KEY) urls.push(`https://eth-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`);
  urls.push(...CHAIN_META.ethereum.publicRpcs);
  return urls;
}

function getChainRpcs(chain: SupportedChain): string[] {
  if (chain === 'ethereum') return getMainnetRpcs();
  const meta = CHAIN_META[chain];
  const urls: string[] = [];
  if (process.env.ALCHEMY_API_KEY) {
    urls.push(`https://${meta.alchemyNetwork}.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`);
  }
  urls.push(...meta.publicRpcs);
  return urls;
}

const VIEM_CHAIN: Record<SupportedChain, typeof mainnet> = {
  ethereum: mainnet,
  arbitrum: arbitrum as unknown as typeof mainnet,
  base: base as unknown as typeof mainnet,
  optimism: optimism as unknown as typeof mainnet,
  mode: mode as unknown as typeof mainnet,
};

async function tryCall<T>(
  rpcs: string[],
  chain: SupportedChain,
  fn: (c: ReturnType<typeof createPublicClient>) => Promise<T>
): Promise<T> {
  return Promise.any(
    rpcs.map(url => fn(createPublicClient({ chain: VIEM_CHAIN[chain], transport: http(url, { timeout: 8000 }) })))
  );
}

// ─── Rate fetchers (always mainnet) ──────────────────────────────────────────

async function getETHxRate(): Promise<number> {
  return tryCall(getMainnetRpcs(), 'ethereum', async (c) => {
    const result = await c.readContract({ address: CONTRACTS.ETHx.staderOracle, abi: STADER_ORACLE_ABI, functionName: 'exchangeRate' });
    const [, eth, supply] = result;
    if (supply === 0n) return 1;
    return Number(formatEther(eth)) / Number(formatEther(supply));
  });
}

async function getRsETHRate(): Promise<number> {
  return tryCall(getMainnetRpcs(), 'ethereum', async (c) => {
    const price = await c.readContract({ address: LRTORACLE_ADDRESS, abi: LRTORACLE_ABI, functionName: 'rsETHPrice' });
    return Number(formatEther(price));
  });
}

async function getERC4626Rate(tokenAddress: `0x${string}`): Promise<number> {
  return tryCall(getMainnetRpcs(), 'ethereum', async (c) => {
    const [assets, supply] = await Promise.all([
      c.readContract({ address: tokenAddress, abi: ERC4626_ABI, functionName: 'totalAssets' }),
      c.readContract({ address: tokenAddress, abi: ERC4626_ABI, functionName: 'totalSupply' }),
    ]);
    if (supply === 0n) return 1;
    return Number(formatEther(assets)) / Number(formatEther(supply));
  });
}

// ─── Balance fetcher (chain-aware) ──────────────────────────────────────────

async function getBalance(
  tokenAddress: `0x${string}`,
  wallet: `0x${string}`,
  chain: SupportedChain
): Promise<number> {
  return tryCall(getChainRpcs(chain), chain, async (c) => {
    const raw = await c.readContract({ address: tokenAddress, abi: ERC20_ABI, functionName: 'balanceOf', args: [wallet] });
    return Number(formatEther(raw));
  });
}

// ─── Route ───────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const wallet = searchParams.get('wallet') as `0x${string}` | null;
  const token = (searchParams.get('token') || 'ETHx') as SupportedToken;
  const chain = (searchParams.get('chain') || 'ethereum') as SupportedChain;

  if (!wallet || !/^0x[0-9a-fA-F]{40}$/.test(wallet)) {
    return NextResponse.json({ error: 'Invalid wallet address' }, { status: 400 });
  }

  try {
    let rate: number;
    let tokenAddress: `0x${string}`;

    // Rate is ALWAYS from Ethereum mainnet (the oracle lives there)
    if (token === 'ETHx') {
      rate = await getETHxRate();
      tokenAddress = chain === 'ethereum' ? CONTRACTS.ETHx.token : CONTRACTS.ETHx.token; // ETHx only on mainnet for now
    } else if (token === 'rsETH') {
      rate = await getRsETHRate();
      // Use L2 token address when on L2
      tokenAddress = chain !== 'ethereum' && L2_RSETH_ADDRESS[chain]
        ? L2_RSETH_ADDRESS[chain]!
        : CONTRACTS.rsETH.token;
    } else if (token === 'agETH') {
      tokenAddress = CONTRACTS.agETH.token;
      rate = await getERC4626Rate(tokenAddress);
    } else {
      tokenAddress = CONTRACTS.hgETH.token;
      rate = await getERC4626Rate(tokenAddress);
    }

    const balance = await getBalance(tokenAddress, wallet, chain);
    const ethValue = balance * rate;

    let ethUsd = 0;
    try {
      const priceRes = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd', { next: { revalidate: 60 } });
      const priceData = await priceRes.json();
      ethUsd = priceData?.ethereum?.usd || 0;
    } catch {}

    return NextResponse.json({
      token, wallet, chain,
      balance, rate, ethValue,
      usdValue: ethValue * ethUsd,
      ethUsd,
      tokenAddress,
      timestamp: Date.now(),
    });
  } catch (err) {
    console.error('Rate fetch error:', err);
    return NextResponse.json(
      { error: 'Failed to fetch on-chain data. All RPCs unavailable — try again in a moment.' },
      { status: 500 }
    );
  }
}
