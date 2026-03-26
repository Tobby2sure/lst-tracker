import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient, http, formatEther } from 'viem';
import { mainnet } from 'viem/chains';
import { CONTRACTS, STADER_ORACLE_ABI, LRTORACLE_ADDRESS, LRTORACLE_ABI, type SupportedToken } from '@/lib/contracts';

const client = createPublicClient({
  chain: mainnet,
  transport: http(process.env.ETHEREUM_RPC_URL || 'https://eth.llamarpc.com'),
});

interface Transfer {
  blockNum: string;
  hash: string;
  from: string;
  to: string;
  value: number;
  asset: string;
  category: string;
  rawContract?: { value: string; address: string; decimal: string };
}

// Fetch exchange rate at a specific block number
async function getRateAtBlock(token: SupportedToken, blockNumber: bigint): Promise<number> {
  try {
    if (token === 'ETHx') {
      const result = await client.readContract({
        address: CONTRACTS.ETHx.staderOracle,
        abi: STADER_ORACLE_ABI,
        functionName: 'exchangeRate',
        blockNumber,
      });
      const eth = result[1];
      const supply = result[2];
      if (supply === 0n) return 1;
      return Number(formatEther(eth)) / Number(formatEther(supply));
    } else {
      const price = await client.readContract({
        address: LRTORACLE_ADDRESS,
        abi: LRTORACLE_ABI,
        functionName: 'rsETHPrice',
        blockNumber,
      });
      return Number(formatEther(price));
    }
  } catch {
    return 0;
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
    ? CONTRACTS.ETHx.token.toLowerCase()
    : CONTRACTS.rsETH.token.toLowerCase();

  try {
    // Fetch all inbound token transfers to this wallet
    const alchemyUrl = `https://eth-mainnet.g.alchemy.com/v2/${alchemyKey}`;

    const res = await fetch(alchemyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'alchemy_getAssetTransfers',
        params: [{
          toAddress: wallet,
          contractAddresses: [tokenAddress],
          category: ['erc20'],
          withMetadata: true,
          excludeZeroValue: true,
          maxCount: '0x32', // 50 transfers
          order: 'asc',
        }],
      }),
    });

    const json = await res.json();
    const transfers: Transfer[] = json?.result?.transfers || [];

    if (transfers.length === 0) {
      return NextResponse.json({ transfers: [], weighted_entry_rate: null, earliest_transfer: null });
    }

    // For each transfer, get the exchange rate at that block
    const enriched = await Promise.all(
      transfers.map(async (tx) => {
        const blockNum = BigInt(tx.blockNum);
        const rate = await getRateAtBlock(token, blockNum);
        const blockHex = tx.blockNum;
        // Get block timestamp via eth_getBlockByNumber
        let timestamp: number | null = null;
        try {
          const blockRes = await fetch(alchemyUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              jsonrpc: '2.0', id: 2,
              method: 'eth_getBlockByNumber',
              params: [blockHex, false],
            }),
          });
          const blockJson = await blockRes.json();
          timestamp = parseInt(blockJson?.result?.timestamp, 16) * 1000;
        } catch {}

        return {
          hash: tx.hash,
          block: Number(blockNum),
          timestamp,
          date: timestamp ? new Date(timestamp).toISOString().split('T')[0] : null,
          amount: tx.value || 0,
          rate_at_block: rate,
          eth_value_at_entry: (tx.value || 0) * rate,
        };
      })
    );

    // Weighted average entry rate by amount received
    const totalTokens = enriched.reduce((s, t) => s + t.amount, 0);
    const weightedRate = totalTokens > 0
      ? enriched.reduce((s, t) => s + t.rate_at_block * t.amount, 0) / totalTokens
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
