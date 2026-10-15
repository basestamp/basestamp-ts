/** Base mainnet (chain 8453) BaseStamp API. This is the default since 0.1.0. */
export const MAINNET_BASE_URL = 'https://api-mainnet.basestamp.io';
/** Base Sepolia testnet (chain 84532) BaseStamp API. */
export const SEPOLIA_BASE_URL = 'https://api-sepolia.basestamp.io';
export const DEFAULT_BASE_URL = MAINNET_BASE_URL;

export const NETWORKS = {
  mainnet: {
    name: 'BASE Mainnet',
    baseURL: MAINNET_BASE_URL,
    chainId: 8453,
    contractAddress: '0x634494cB65B17163A4ca84378900Ff53A4Bba05C',
    rpcURL: 'https://mainnet.base.org',
    explorer: 'https://basescan.org',
  },
  sepolia: {
    name: 'BASE Sepolia',
    baseURL: SEPOLIA_BASE_URL,
    chainId: 84532,
    contractAddress: '0x15Adb2cc1aEDB6610E1C801BE7E205be3A8De5d7',
    rpcURL: 'https://sepolia.base.org',
    explorer: 'https://sepolia.basescan.org',
  },
} as const;

export type NetworkName = keyof typeof NETWORKS;
