import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient, http, formatEther } from 'viem';
import { mainnet } from 'viem/chains';
import {
  CONTRACTS,
  STADER_ORACLE_ABI,
  LRTORACLE_ADDRESS,
  LRTORACLE_ABI,
  ERC20_ABI,
  type SupportedToken,
} from '@/lib/contracts';

// Use Alchemy if key is available, otherwise fall back to public RPCs
function getRpcUrls(): string[] {
  const urls: string[] = [];
  if (process.env.ETHEREUM_RPC_URL) urls.push(process.env.ETHEREUM_RPC_URL);
  if (process.env.ALCHEMY_API_KEY) urls.push(`https://eth-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`);
  urls.push('https://ethereum.publicnode.com', 'https://rpc.ankr.com/eth', 'https://cloudflare-eth.com');
  return urls;
}

async function tryReadContract<T>(
  fn: (c: ReturnType<typeof createPublicClient>) => Promise<T>
): Promise<T> {
  const urls = getRpcUrls();
  return Promise.any(
    urls.map(url => {
      const c = createPublicClient({ chain: mainnet, transport: http(url, { timeout: 8000 }) });
      return fn(c);
    })
  );
}

async function getETHxRate(): Promise<number> {
  return tryReadContract(async (c) => {
    const result = await c.readContract({
      address: CONTRACTS.ETHx.staderOracle,
      abi: STADER_ORACLE_ABI,
      functionName: 'exchangeRate',
    });
    const totalETHBalance = result[1];
    const totalETHXSupply = result[2];
    if (totalETHXSupply === 0n) return 1;
    return Number(formatEther(totalETHBalance)) / Number(formatEther(totalETHXSupply));
  });
}

async function getRsETHRate(): Promise<number> {
  return tryReadContract(async (c) => {
    const price = await c.readContract({
      address: LRTORACLE_ADDRESS,
      abi: LRTORACLE_ABI,
      functionName: 'rsETHPrice',
    });
    return Number(formatEther(price));
  });
}

async function getBalance(tokenAddress: `0x${string}`, wallet: `0x${string}`): Promise<number> {
  return tryReadContract(async (c) => {
    const raw = await c.readContract({
      address: tokenAddress,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [wallet],
    });
    return Number(formatEther(raw));
  });
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const wallet = searchParams.get('wallet') as `0x${string}` | null;
  const token = (searchParams.get('token') || 'ETHx') as SupportedToken;

  if (!wallet || !/^0x[0-9a-fA-F]{40}$/.test(wallet)) {
    return NextResponse.json({ error: 'Invalid wallet address' }, { status: 400 });
  }

  try {
    let rate: number;
    let tokenAddress: `0x${string}`;

    if (token === 'ETHx') {
      rate = await getETHxRate();
      tokenAddress = CONTRACTS.ETHx.token;
    } else {
      rate = await getRsETHRate();
      tokenAddress = CONTRACTS.rsETH.token;
    }

    const balance = await getBalance(tokenAddress, wallet);
    const ethValue = balance * rate;

    // ETH/USD price from CoinGecko (free tier, cached 60s)
    let ethUsd = 0;
    try {
      const priceRes = await fetch(
        'https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd',
        { next: { revalidate: 60 } }
      );
      const priceData = await priceRes.json();
      ethUsd = priceData?.ethereum?.usd || 0;
    } catch {}

    return NextResponse.json({
      token,
      wallet,
      balance,
      rate,
      ethValue,
      usdValue: ethValue * ethUsd,
      ethUsd,
      timestamp: Date.now(),
    });
  } catch (err) {
    console.error('Rate fetch error:', err);
    return NextResponse.json(
      { error: 'Failed to fetch on-chain data. All public RPCs unavailable — try again in a moment.' },
      { status: 500 }
    );
  }
}
