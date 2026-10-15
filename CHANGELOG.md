# Changelog

## 0.1.0

### Changed (breaking default)
- `BasestampClient` now defaults to Base **mainnet**: `https://api-mainnet.basestamp.io`
  (chain 8453, contract `0x634494cB65B17163A4ca84378900Ff53A4Bba05C`). The previous default,
  `https://api.basestamp.io`, served Base Sepolia.

### Added
- `MAINNET_BASE_URL`, `SEPOLIA_BASE_URL`, `DEFAULT_BASE_URL` and `NETWORKS` (chain id, contract,
  RPC, explorer). To keep using testnet: `new BasestampClient({ baseURL: SEPOLIA_BASE_URL })`.
