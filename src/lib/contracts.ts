// LST contract addresses and ABIs

export type SupportedChain = 'ethereum' | 'arbitrum' | 'base' | 'optimism' | 'mode';
export type SupportedToken = 'ETHx' | 'rsETH' | 'agETH' | 'hgETH';

// Which tokens are available on each chain
export const CHAIN_TOKEN_SUPPORT: Record<SupportedChain, SupportedToken[]> = {
  ethereum: ['ETHx', 'rsETH', 'agETH', 'hgETH'],
  arbitrum: ['rsETH'],
  base:     ['rsETH'],
  optimism: ['rsETH'],
  mode:     ['rsETH'],
};

// L2 rsETH OFT token addresses (bridged via LayerZero)
export const L2_RSETH_ADDRESS: Record<SupportedChain, `0x${string}` | null> = {
  ethereum: null, // use CONTRACTS.rsETH.token
  arbitrum: '0x4186BFC76E2E237523CBC30FD220FE055156b41F',
  base:     '0x1Bc71130A0e39942a7658878169764Bbd8A45993',
  optimism: '0x87eEE96D50Fb761AD85B1c982d28A042169d61b1',
  mode:     '0x4186BFC76E2E237523CBC30FD220FE055156b41F', // same OFT contract as Arb
};

// Chain metadata
export const CHAIN_META: Record<SupportedChain, {
  name: string;
  chainId: number;
  color: string;
  icon: string;
  bridgeUrl: string;
  alchemyNetwork: string;
  publicRpcs: string[];
}> = {
  ethereum: {
    name: 'Ethereum',
    chainId: 1,
    color: '#627EEA',
    icon: 'Ξ',
    bridgeUrl: 'https://app.kelpdao.xyz',
    alchemyNetwork: 'eth-mainnet',
    publicRpcs: ['https://ethereum.publicnode.com', 'https://rpc.ankr.com/eth', 'https://cloudflare-eth.com'],
  },
  arbitrum: {
    name: 'Arbitrum',
    chainId: 42161,
    color: '#28A0F0',
    icon: '◈',
    bridgeUrl: 'https://app.kelpdao.xyz',
    alchemyNetwork: 'arb-mainnet',
    publicRpcs: ['https://arb1.arbitrum.io/rpc', 'https://rpc.ankr.com/arbitrum', 'https://arbitrum.publicnode.com'],
  },
  base: {
    name: 'Base',
    chainId: 8453,
    color: '#0052FF',
    icon: '⬡',
    bridgeUrl: 'https://bridge.base.org',
    alchemyNetwork: 'base-mainnet',
    publicRpcs: ['https://mainnet.base.org', 'https://rpc.ankr.com/base', 'https://base.publicnode.com'],
  },
  optimism: {
    name: 'Optimism',
    chainId: 10,
    color: '#FF0420',
    icon: '⬡',
    bridgeUrl: 'https://app.optimism.io/bridge',
    alchemyNetwork: 'opt-mainnet',
    publicRpcs: ['https://mainnet.optimism.io', 'https://rpc.ankr.com/optimism', 'https://optimism.publicnode.com'],
  },
  mode: {
    name: 'Mode',
    chainId: 34443,
    color: '#DFFE00',
    icon: '◎',
    bridgeUrl: 'https://app.mode.network',
    alchemyNetwork: 'mode-mainnet',
    publicRpcs: ['https://mainnet.mode.network', 'https://mode.drpc.org', 'https://rpc.ankr.com/mode'],
  },
};

// Mainnet contracts (all rates fetched from mainnet regardless of chain)
export const CONTRACTS = {
  ETHx: {
    token: '0xA35b1B31Ce002FBF2058D22F30f95D405200A15b' as `0x${string}`,
    stakePoolManager: '0xcf5EA1b38380f6aF39068375516Daf40Ed70D69' as `0x${string}`,
    staderOracle: '0xF64bAe65f6f2a5277571143A24FaaFDFC0C2a737' as `0x${string}`,
  },
  rsETH: {
    token: '0xA1290d69c65A6Fe4DF752f95823fae25cB99e5A7' as `0x${string}`,
    lrtDepositPool: '0x036676389e48133B63a802f8635AD39E752D375D' as `0x${string}`,
  },
  agETH: {
    token: '0xe1B4d34E8754600962Cd944B535180Bd758E6c2e' as `0x${string}`,
  },
  hgETH: {
    token: '0xc824A08dB624942c5E5F330d56530cD1598859fD' as `0x${string}`,
  },
} as const;

export const ERC4626_ABI = [
  { name: 'totalAssets', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { name: 'totalSupply',  type: 'function', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] },
] as const;

export const STADER_ORACLE_ABI = [
  {
    name: 'exchangeRate',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      { name: 'reportingBlockNumber', type: 'uint256' },
      { name: 'totalETHBalance', type: 'uint256' },
      { name: 'totalETHXSupply', type: 'uint256' },
    ],
  },
] as const;

export const LRTORACLE_ADDRESS = '0x349A73444b1a310BAe67ef67973022020d70020d' as `0x${string}`;
export const LRTORACLE_ABI = [
  { name: 'rsETHPrice', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] },
] as const;

export const ERC20_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

export const TOKEN_META: Record<SupportedToken, { name: string; color: string; protocol: string }> = {
  ETHx:  { name: 'ETHx',  color: '#0ea5e9', protocol: 'Stader Labs' },
  rsETH: { name: 'rsETH', color: '#8b5cf6', protocol: 'KelpDAO' },
  agETH: { name: 'agETH', color: '#10b981', protocol: 'Kelp Gain' },
  hgETH: { name: 'hgETH', color: '#f59e0b', protocol: 'High Growth ETH' },
};
