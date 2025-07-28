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
const client = new BasestampClient({
  baseURL: 'https://api.basestamp.io' // Optional, this is the default
});

// Hash your data
const data = 'Hello, Basestamp!';
const hash = calculateSHA256(data);

// Submit SHA256 hash for timestamping
const stampId = await client.submitSHA256(hash);
console.log('Stamp ID:', stampId);

// Get the stamp (with optional waiting for Merkle proof)
const stamp = await client.getStamp(stampId, { wait: true, timeout: 30 });

// Verify the timestamp with trustless verification
const isValid = stamp.verify(hash); // throws descriptive errors if invalid
console.log('Timestamp is valid:', isValid);
```

## API Reference

### BasestampClient

#### Constructor

```typescript
new BasestampClient(options?: ClientOptions)
```

**Options:**
- `baseURL?: string` - The base URL of the Basestamp API (default: 'https://api.basestamp.io')
- `timeout?: number` - Request timeout in milliseconds (default: 30000)

#### Methods

##### `submitSHA256(hash: string): Promise<string>`

Submits a SHA256 hash for timestamping.

**Parameters:**
- `hash` - A SHA256 hash as a hex string

**Returns:** Promise resolving to a stamp ID string

##### `getStamp(stampId: string, options?: StampOptions): Promise<Stamp>`

Retrieves a stamp object with its Merkle proof.

**Parameters:**
- `stampId` - The unique identifier for the stamp
- `options.wait` - Whether to wait for the proof if not immediately available (default: false)
- `options.timeout` - Maximum time to wait in seconds (default: 30)

**Returns:** Promise resolving to a Stamp object

**Throws:** `BasestampError` if the proof is not available or times out

##### `info(): Promise<ServerInfo>`

Gets information about the Basestamp server.

**Returns:** Promise resolving to ServerInfo with server details

##### `health(): Promise<HealthResponse>`

Checks the health status of the Basestamp server.

**Returns:** Promise resolving to HealthResponse

##### `batchStats(): Promise<BatchStats>`

Gets statistics about the batching process.

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

Verifies a Merkle proof client-side (used internally).

**Parameters:**
- `proof` - A MerkleProofData object

**Returns:** `true` if the proof is valid, `false` otherwise

## Types

### StampOptions

```typescript
interface StampOptions {
  wait?: boolean;
  timeout?: number;
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
  
  verify(original_hash: string): boolean;
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

This client performs complete client-side verification of Merkle proofs, meaning you don't need to trust the Basestamp server. The verification process:

1. Retrieves the stamp data including the Merkle proof, nonce, and original hash
2. Calculates the expected leaf hash using `SHA256(nonce + original_hash)`
3. Verifies the calculated leaf hash matches the proof's leaf hash
4. Uses the proof to reconstruct the path from the leaf to the Merkle root
5. Verifies that the computed root matches the expected root hash
6. The root hash is anchored on the blockchain, providing cryptographic proof of inclusion

The nonce-based approach prevents blockchain collision attacks while maintaining trustless verification.

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

### Batch Processing

```typescript
const client = new BasestampClient();

// Check batch statistics
const stats = await client.batchStats();
console.log(`Pending stamps: ${stats.pending_stamps}`);
console.log(`Batch interval: ${stats.batch_interval}`);
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

All tests use mocked data and do not depend on live API calls, ensuring fast and reliable testing.

## License

MIT