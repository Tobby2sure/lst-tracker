// LST contract addresses and ABIs

export const CONTRACTS = {
  ETHx: {
    token: '0xA35b1B31Ce002FBF2058D22F30f95D405200A15b' as `0x${string}`, // ETHx on Ethereum
    stakePoolManager: '0xcf5EA1b38380f6aF39068375516Daf40Ed70D69' as `0x${string}`,
    staderOracle: '0xF64bAe65f6f2a5277571143A24FaaFDFC0C2a737' as `0x${string}`,
  },
  rsETH: {
    token: '0xA1290d69c65A6Fe4DF752f95823fae25cB99e5A7' as `0x${string}`, // rsETH on Ethereum (KelpDAO)
    lrtDepositPool: '0x036676389e48133B63a802f8635AD39E752D375D' as `0x${string}`,
  },
} as const;

// ETHx StaderOracle ABI — exchangeRate returns (uint256 reportingBlockNumber, uint256 totalETHBalance, uint256 totalETHXSupply)
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

// rsETH LRTOracle
export const LRTORACLE_ADDRESS = '0x349A73444b1a310BAe67ef67973022020d70020d' as `0x${string}`;
export const LRTORACLE_ABI = [
  {
    name: 'rsETHPrice',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

// ERC20 ABI (balanceOf only)
export const ERC20_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

export type SupportedToken = 'ETHx' | 'rsETH';

export const TOKEN_META: Record<SupportedToken, { name: string; color: string; protocol: string }> = {
  ETHx: { name: 'ETHx', color: '#0ea5e9', protocol: 'Stader Labs' },
  rsETH: { name: 'rsETH', color: '#8b5cf6', protocol: 'KelpDAO' },
};
