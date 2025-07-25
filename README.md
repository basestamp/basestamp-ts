# Basestamp TypeScript Client

A TypeScript client library for the Basestamp API with trustless Merkle proof verification.

## Installation

```bash
npm install basestamp-client
# or
yarn add basestamp-client
```

## Quick Start

```typescript
import { BasestampClient, calculateSHA256 } from 'basestamp-client';

// Initialize the client
const client = new BasestampClient({
  baseURL: 'https://api.basestamp.io' // Optional, this is the default
});

// Hash your data
const data = 'Hello, Basestamp!';
const hash = calculateSHA256(data);

// Create a timestamp
const timestamp = await client.timestamp(hash);
console.log('Timestamp created:', timestamp);

// Wait for the proof to be generated (usually takes a few seconds)
await new Promise(resolve => setTimeout(resolve, 5000));

// Verify the timestamp with trustless verification
const isValid = await client.verifyStamp(timestamp.stamp_id);
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

##### `timestamp(hash: string): Promise<CalendarResponse>`

Creates a new timestamp for the given SHA256 hash.

**Parameters:**
- `hash` - A SHA256 hash as a hex string

**Returns:** Promise resolving to a CalendarResponse with timestamp details

##### `getStamp(stampId: string): Promise<StampData>`

Retrieves detailed information about a stamp, including its Merkle proof if available.

**Parameters:**
- `stampId` - The unique identifier for the stamp

**Returns:** Promise resolving to StampData with full stamp details

##### `verifyStamp(stampId: string): Promise<boolean>`

Performs trustless client-side verification of a stamp's Merkle proof.

**Parameters:**
- `stampId` - The unique identifier for the stamp

**Returns:** Promise resolving to `true` if the proof is valid, `false` otherwise

**Throws:** `BasestampError` if the Merkle proof is not yet available

##### `info(): Promise<ServerInfo>`

Gets information about the Basestamp server.

**Returns:** Promise resolving to ServerInfo with server details

##### `health(): Promise<HealthResponse>`

Checks the health status of the Basestamp server.

**Returns:** Promise resolving to HealthResponse

##### `batchStats(): Promise<BatchStats>`

Gets statistics about the batching process.

**Returns:** Promise resolving to BatchStats

### Utility Functions

#### `calculateSHA256(data: Buffer | string): string`

Calculates the SHA256 hash of the given data.

**Parameters:**
- `data` - Input data as Buffer or string

**Returns:** SHA256 hash as a hex string

#### `verifyMerkleProof(proof: MerkleProof): boolean`

Verifies a Merkle proof client-side (used internally by `verifyStamp`).

**Parameters:**
- `proof` - A MerkleProof object

**Returns:** `true` if the proof is valid, `false` otherwise

## Types

### CalendarResponse

```typescript
interface CalendarResponse {
  hash: string;
  timestamp: string;
  tx_id?: string;
  status: string;
  message?: string;
}
```

### StampData

```typescript
interface StampData {
  stamp_id: string;
  hash: string;
  timestamp: string;
  status: string;
  message?: string;
  tx_id?: string;
  block_hash?: string;
  network?: string;
  chain_id?: string;
  merkle_proof?: MerkleProof;
}
```

### MerkleProof

```typescript
interface MerkleProof {
  leaf_hash: string;
  leaf_index: number;
  siblings: string[];
  directions: boolean[];
  root_hash: string;
}
```

## Error Handling

The client throws `BasestampError` for various error conditions:

```typescript
import { BasestampError } from 'basestamp-client';

try {
  const result = await client.verifyStamp('invalid-stamp-id');
} catch (error) {
  if (error instanceof BasestampError) {
    console.log('Basestamp error:', error.message);
  } else {
    console.log('Other error:', error);
  }
}
```

## Trustless Verification

This client performs complete client-side verification of Merkle proofs, meaning you don't need to trust the Basestamp server. The verification process:

1. Retrieves the stamp data including the Merkle proof
2. Uses the proof to reconstruct the path from the leaf (your hash) to the Merkle root
3. Verifies that the computed root matches the expected root hash
4. The root hash is anchored on the blockchain, providing cryptographic proof of inclusion

## Examples

### File Timestamping

```typescript
import { BasestampClient, calculateSHA256 } from 'basestamp-client';
import { readFileSync } from 'fs';

const client = new BasestampClient();

// Read and hash a file
const fileContent = readFileSync('document.pdf');
const fileHash = calculateSHA256(fileContent);

// Create timestamp
const timestamp = await client.timestamp(fileHash);
console.log(`File timestamped with ID: ${timestamp.stamp_id}`);

// Later, verify the timestamp
const isValid = await client.verifyStamp(timestamp.stamp_id);
console.log(`Timestamp verification: ${isValid ? 'VALID' : 'INVALID'}`);
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