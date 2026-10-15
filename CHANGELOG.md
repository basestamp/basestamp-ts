# Changelog

## 0.2.0

### Security / correctness
- **On-chain verification** (new): `Stamp.verifyOnChain()`, `Stamp.verifyFull()` and `verifyRootOnChain()` prove
  via Base JSON-RPC that the merkle root was stamped by the Basestamp contract (receipt status, contract
  address, `Stamped` event with the root, stamper == signer == `owner()`, chain id, canonical block, API
  `block_hash`, confirmations). Previously nothing checked the chain.
- Merkle verification is strict: hashes must be 32-byte hex (invalid hex used to be silently truncated by
  `Buffer.from(x, 'hex')`), array shapes and depth (<= 64) are validated, and pairs are compared as bytes.
  The algorithm (leaf = SHA256(nonce + hash), sorted-pair SHA256 nodes) is documented and checked against
  real mainnet proofs in `testdata/vectors.json` (shared with the Python and Go SDKs).
- `Stamp.verify()` also checks the API's `merkle_root` against `merkle_proof.root_hash`; hash comparisons
  are case-insensitive and accept `0x`.
- HTTP uses the runtime's native `fetch` when available. node-fetch 2.7 on Node >= 18 could fail successful
  `POST /stamp` responses with "Premature close", losing the stamp id of an accepted (paid) stamp.
- `submitSHA256()` validates the hash before sending and throws if the server returns no `stamp_id` (it used
  to return the submitted hash as if it were a stamp id).
- `getStamp()` validates/encodes the stamp id (no path injection), uses a real deadline for `wait`, supports
  `pollInterval`, and fails fast on `status: failed`. Server error messages are surfaced.
- `baseURL` must be https (except localhost) unless `allowInsecure: true`.

### Changed
- `batchStats()` is deprecated and derived from `/info` (the server returns 404 for `/batch/stats`).
- `ServerInfo` matches the current `/info` response (legacy fields kept optional).
- `NETWORKS.*.signerAddress` added; new exports `computeLeafHash`, `computeMerkleRoot`, `normalizeHash`,
  `isValidHash`, `STAMPED_EVENT_TOPIC`, `JsonRpcClient`.
- `yarn lint` now actually lints `src/**/*.ts` (the unquoted glob only matched test files).
- Gated mainnet E2E test (`BASESTAMP_E2E=1 yarn test:e2e`).

## 0.1.0

### Changed (breaking default)
- `BasestampClient` now defaults to Base **mainnet**: `https://api-mainnet.basestamp.io`
  (chain 8453, contract `0x634494cB65B17163A4ca84378900Ff53A4Bba05C`). The previous default,
  `https://api.basestamp.io`, served Base Sepolia.

### Added
- `MAINNET_BASE_URL`, `SEPOLIA_BASE_URL`, `DEFAULT_BASE_URL` and `NETWORKS` (chain id, contract,
  RPC, explorer). To keep using testnet: `new BasestampClient({ baseURL: SEPOLIA_BASE_URL })`.
