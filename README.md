# Basestamp TypeScript Client

A TypeScript client library for the Basestamp API with trustless Merkle proof verification.

## Installation

```bash
npm install @basestamp/basestamp
# or
yarn add @basestamp/basestamp
```

## Quick Start

```typescript
import { BasestampClient, calculateSHA256 } from '@basestamp/basestamp';

// Initialize the client
// Defaults to Base mainnet (https://api-mainnet.basestamp.io, chain 8453)
const client = new BasestampClient();

// Base Sepolia testnet (chain 84532)
import { SEPOLIA_BASE_URL } from '@basestamp/basestamp';
const testnet = new BasestampClient({ baseURL: SEPOLIA_BASE_URL });

// Hash your data
const data = 'Hello, Basestamp!';
const hash = calculateSHA256(data);

// Submit SHA256 hash for timestamping
const stampId = await client.submitSHA256(hash);
console.log('Stamp ID:', stampId);

// Get the stamp (with optional waiting for Merkle proof)
const stamp = await client.getStamp(stampId, { wait: true, timeout: 30 });

// Verify locally: hash -> leaf -> merkle root (throws descriptive errors if invalid)
const isValid = stamp.verify(hash);
console.log('Timestamp is valid:', isValid);

// Verify on Base that the contract stamped that root (JSON-RPC to https://mainnet.base.org)
const onchain = await stamp.verifyOnChain(); // or stamp.verifyFull(hash) to do both
console.log(`Anchored in block ${onchain.blockNumber} at ${new Date(onchain.timestamp * 1000).toISOString()}`);
```

Confirmation usually takes ~5-30 s after submission (5 s batching + one Base block); use
`getStamp(id, { wait: true, timeout: 120 })` or poll until `stamp.tx_id` is set before calling `verifyOnChain()`.

## API Reference

### BasestampClient

#### Constructor

```typescript
new BasestampClient(options?: ClientOptions)
```

**Options:**
- `baseURL?: string` - The base URL of the Basestamp API (default: `MAINNET_BASE_URL` = 'https://api-mainnet.basestamp.io'; use `SEPOLIA_BASE_URL` for testnet). Chain id / contract / RPC for both networks are exported as `NETWORKS`.
- `timeout?: number` - Request timeout in milliseconds (default: 30000)
- `allowInsecure?: boolean` - Allow a plain `http://` baseURL for non-local hosts (default: false; `https` is required otherwise)
- `fetch?: FetchLike` - Custom fetch implementation (default: the runtime's native `fetch`, falling back to `node-fetch` on Node < 18)

#### Methods

##### `submitSHA256(hash: string): Promise<string>`

Submits a SHA256 hash for timestamping.

**Parameters:**
- `hash` - A SHA256 digest as 64 hex characters (optional `0x` prefix; normalized to lowercase). Anything else is rejected before any request is made.

**Returns:** Promise resolving to a stamp ID string. Throws `BasestampError` if the server does not return a `stamp_id`.

##### `getStamp(stampId: string, options?: StampOptions): Promise<Stamp>`

Retrieves a stamp object with its Merkle proof.

**Parameters:**
- `stampId` - The unique identifier for the stamp
- `options.wait` - Whether to wait for the proof if not immediately available (default: false)
- `options.timeout` - Maximum time to wait in seconds (default: 30)
- `options.pollInterval` - Milliseconds between polls while waiting (default: 1000)

**Returns:** Promise resolving to a Stamp object

**Throws:** `BasestampError` if the proof is not available or times out

##### `info(): Promise<ServerInfo>`

Gets information about the Basestamp server.

**Returns:** Promise resolving to ServerInfo with server details

##### `health(): Promise<HealthResponse>`

Checks the health status of the Basestamp server.

**Returns:** Promise resolving to HealthResponse

##### `batchStats(): Promise<BatchStats>` (deprecated)

The server no longer serves `/batch/stats`; this is now derived from `/info` (`pending_stamps`, `batch_interval`).

**Returns:** Promise resolving to BatchStats

### Stamp Class

#### `verify(original_hash: string): boolean`

Verifies that the provided hash matches the stamp's Merkle proof. This is 100% local verification with no network calls.

**Parameters:**
- `original_hash` - The original hash value to verify

**Returns:** `true` if the proof is valid

**Throws:** Descriptive `BasestampError` explaining why verification failed:
- Hash mismatch errors
- Leaf hash verification failures  
- Merkle proof structure errors

**Example:**
```typescript
const stamp = await client.getStamp(stampId);
try {
  const isValid = stamp.verify(originalHash);
  console.log('Verification successful!');
} catch (error) {
  console.log('Verification failed:', error.message);
}
```

#### `verifyOnChain(options?: OnChainVerifyOptions): Promise<OnChainVerification>`

Proves on Base that the stamp's merkle root was stamped by the Basestamp contract, using only public
JSON-RPC (`eth_chainId`, `eth_getTransactionReceipt`, `eth_getBlockByNumber`, `eth_call owner()`, `eth_blockNumber`):

- the RPC is on the expected chain (8453 for mainnet);
- the transaction `tx_id` succeeded and was sent to the contract (`0x634494cB65B17163A4ca84378900Ff53A4Bba05C`);
- its receipt contains `Stamped(bytes32 indexed root, uint256 timestamp, uint256 blockNumber, address indexed stamper)`
  emitted by the contract with `root == merkle_proof.root_hash`;
- the stamper is the expected signer (`0x0a3861972b28e6be9fEB826dd809aEB4F473e753`) and is the contract `owner()`;
- the block is canonical, matches the API's `block_hash`, and has at least `minConfirmations` confirmations.

Options: `network` (`'mainnet'` default, or `'sepolia'`), `rpcURL`, `chainId`, `contractAddress`,
`signerAddress` (`null` to skip), `minConfirmations` (default 1), `expectedBlockHash`, `timeout`, `fetch`.
Use your own RPC endpoint for stronger independence from public infrastructure.

The same check is available standalone: `verifyRootOnChain(root, txHash, options)`.

#### `verifyFull(original_hash: string, options?): Promise<OnChainVerification>`

`verify(original_hash)` followed by `verifyOnChain(options)`.

#### `getMerkleProof(): MerkleProof`

Gets the underlying MerkleProof object for advanced use cases.

**Returns:** MerkleProof instance

**Throws:** `BasestampError` if no Merkle proof is available

### Deprecated Methods (for backward compatibility)

##### `get_merkle_proof(stampId: string, wait?: boolean, timeout?: number): Promise<MerkleProof>`

**Deprecated:** Use `getStamp()` and call `stamp.getMerkleProof()` instead.

##### `verifyStamp(stampId: string, hashValue?: string): Promise<boolean>`

**Deprecated:** Use `getStamp()` and call `stamp.verify()` instead.

### Utility Functions

#### `calculateSHA256(data: Buffer | string): string`

Calculates the SHA256 hash of the given data.

**Parameters:**
- `data` - Input data as Buffer or string

**Returns:** SHA256 hash as a hex string

#### `verifyMerkleProof(proof: MerkleProofData): boolean`

Checks that `leaf_hash` + `siblings` reconstruct `root_hash`. Never throws; malformed proofs (non-hex or
non-32-byte hashes, mismatched arrays, depth > 64) return `false`. It does not bind the proof to your hash -
use `Stamp.verify()` for that.

#### `computeLeafHash(hash: string, nonce: string): string` / `computeMerkleRoot(proof): string`

Low-level helpers implementing the algorithm described under [Verification algorithm](#verification-algorithm).

#### `verifyRootOnChain(root: string, txHash: string, options?): Promise<OnChainVerification>`

See `Stamp.verifyOnChain()`.

## Types

### StampOptions

```typescript
interface StampOptions {
  wait?: boolean;
  timeout?: number;       // seconds
  pollInterval?: number;  // milliseconds
}
```

### Stamp

```typescript
class Stamp {
  stamp_id: string;
  hash: string;
  original_hash: string;
  nonce: string;
  timestamp: string;
  status: string;
  message?: string;
  tx_id?: string;
  block_hash?: string;
  network?: string;
  chain_id?: string;
  merkle_root?: string;

  verify(original_hash: string): boolean;
  verifyOnChain(options?: OnChainVerifyOptions): Promise<OnChainVerification>;
  verifyFull(original_hash: string, options?: OnChainVerifyOptions): Promise<OnChainVerification>;
  getMerkleProof(): MerkleProof;
}
```

### MerkleProof

```typescript
class MerkleProof {
  leaf_hash: string;
  leaf_index: number;
  siblings: string[];
  directions: boolean[];
  root_hash: string;
  nonce: string;
  original_hash: string;
  
  verify(hash_value: string): boolean;
}
```

## Error Handling

The client throws `BasestampError` with descriptive messages:

```typescript
import { BasestampError } from '@basestamp/basestamp';

try {
  const stamp = await client.getStamp(stampId);
  stamp.verify(hash);
} catch (error) {
  if (error instanceof BasestampError) {
    console.log('Basestamp error:', error.message);
    // Examples:
    // "Hash mismatch: provided hash 'abc123' does not match stamp's original hash 'def456'"
    // "Leaf hash verification failed: expected 'xyz789' but merkle proof contains 'abc123'"
    // "Merkle proof verification failed: the proof structure does not produce the expected root hash"
  } else {
    console.log('Other error:', error);
  }
}
```

## Trustless Verification

You don't need to trust the Basestamp server:

1. `stamp.verify(hash)` (local, no network) checks that your hash equals the stamped hash, that
   `leaf_hash == SHA256(nonce + hash)`, that the siblings reconstruct `root_hash`, and that `root_hash`
   equals the API's `merkle_root`.
2. `stamp.verifyOnChain()` checks on Base that the contract emitted `Stamped(root_hash, ...)` from the
   Basestamp signer in `tx_id`. The block timestamp of that event is your proof-of-existence time.

Both steps are required: a locally valid proof only shows consistency with some root; the on-chain step shows
that root was published at a specific time.

### Verification algorithm

Confirmed against real Base mainnet proofs (`testdata/vectors.json`, shared with the Python and Go SDKs):

- **Leaf:** `leaf_hash = SHA256(utf8(nonce + hash))`: the nonce string (a decimal string such as
  `"1792084020825457904"`) immediately followed by the lowercase hex hash, hashed as UTF-8 text.
  (The server's OpenAPI text "SHA256(file_hash + nonce)" has the order wrong.)
- **Nodes:** 32-byte SHA256 digests. Each parent is `SHA256(min(a, b) || max(a, b))` over the raw bytes
  ("sorted pairs"). An odd node at the end of a level is paired with itself.
- **Proof:** start from `leaf_hash` and fold in each of `siblings` in order with the sorted-pair rule. The result
  must equal `root_hash`. `directions` (true = sibling on the right, mirroring the bits of `leaf_index`) are
  informational: with sorted pairs they do not affect the root.
- **Anchor:** `root_hash` is the `bytes32 root` argument of `stamp(bytes32)` and topic 1 of the `Stamped` event.

Example (mainnet stamp `10542ea2...`, tx
[`0xb655fb0d...`](https://basescan.org/tx/0xb655fb0d467d763667fcf61dbcea71d3a7c8239c988fb8d859dd34260bd5eee1)):
hash `9b5ab67b...37bf` + nonce `1792084020825457904` -> leaf `83e66150...ab90` -> root `e20a3da7...62b5`.

## Examples

### File Timestamping

```typescript
import { BasestampClient, calculateSHA256 } from '@basestamp/basestamp';
import { readFileSync } from 'fs';

const client = new BasestampClient();

// Read and hash a file
const fileContent = readFileSync('document.pdf');
const fileHash = calculateSHA256(fileContent);

// Submit for timestamping
const stampId = await client.submitSHA256(fileHash);
console.log(`File timestamped with ID: ${stampId}`);

// Get the stamp (wait up to 30 seconds if needed)
const stamp = await client.getStamp(stampId, { wait: true, timeout: 30 });

// Verify the timestamp
try {
  stamp.verify(fileHash);
  console.log('Timestamp verification: VALID');
} catch (error) {
  console.log('Timestamp verification: INVALID -', error.message);
}
```

### Server status

```typescript
const info = await client.info();
console.log(`${info.network}: ${info.pending_stamps} pending, batch interval ${info.batch_interval}`);
```

## Testing

The library includes comprehensive unit tests covering all functionality:

```bash
# Run all tests
yarn test

# Run tests in watch mode
yarn test:watch

# Run linting
yarn lint

# Run type checking
yarn typecheck
```

Unit tests use mocked HTTP/RPC and do not depend on live API calls. Proof verification is tested against
the cross-SDK vectors in `testdata/vectors.json` (real mainnet proofs plus tampered negative cases).

An end-to-end test stamps a random hash on **Base mainnet** (costs real ETH, paid by the Basestamp signer),
waits for confirmation and verifies the proof locally and on-chain. It is skipped unless `BASESTAMP_E2E=1`:

```bash
yarn test:e2e
# re-verify an existing stamp without stamping again:
BASESTAMP_E2E_STAMP_ID=<id> BASESTAMP_E2E_HASH=<hash> yarn test:e2e
```

## License

MIT