import type { FetchLike } from './http';
import { verifyRootOnChain, OnChainVerifyOptions, OnChainVerification } from './onchain';

export interface CalendarRequest {
  hash: string;
  signature?: string;
}

export interface CalendarResponse {
  hash: string;
  timestamp: string;
  tx_id?: string;
  status: string;
  message?: string;
  stamp_id?: string; // Added to support new timestamp API response
}

export interface StampResponse {
  stamp_id: string;
  hash: string;
  timestamp: string;
  status: string;
  message?: string;
}

export interface MerkleProofData {
  leaf_hash: string;
  leaf_index: number;
  siblings: string[];
  directions: boolean[];
  root_hash: string;
}

export class MerkleProof implements MerkleProofData {
  public leaf_hash: string;
  public leaf_index: number;
  public siblings: string[];
  public directions: boolean[];
  public root_hash: string;
  public nonce: string;
  public original_hash: string;
  private _verifier: (proof: MerkleProofData) => boolean;
  private _hasher: (data: Buffer | string) => string;

  constructor(
    data: MerkleProofData & { nonce: string; original_hash: string },
    verifier: (proof: MerkleProofData) => boolean,
    hasher: (data: Buffer | string) => string
  ) {
    this.leaf_hash = data.leaf_hash;
    this.leaf_index = data.leaf_index;
    this.siblings = data.siblings;
    this.directions = data.directions;
    this.root_hash = data.root_hash;
    this.nonce = data.nonce;
    this.original_hash = data.original_hash;
    this._verifier = verifier;
    this._hasher = hasher;
  }

  verify(hash_value: string): boolean {
    verifyBinding(hash_value, this.original_hash, this.nonce, this, this._hasher);
    if (!this._verifier(this)) {
      throw new BasestampError(`Merkle proof verification failed: the proof (leaf_index: ${this.leaf_index}, siblings: [${(this.siblings || []).join(', ')}], directions: [${(this.directions || []).join(', ')}]) does not produce the expected root hash '${this.root_hash}'`);
    }
    return true;
  }
}

const HEX32 = /^(0x)?[0-9a-fA-F]{64}$/;

function normalizeHex(value: string): string {
  return value.trim().toLowerCase().replace(/^0x/, '');
}

/**
 * Binds the caller's hash to the proof leaf: the provided hash must equal the stamped hash and the
 * leaf must be SHA256(nonce + hash) (or the hash itself for legacy, nonce-less stamps).
 * Comparisons are case-insensitive and tolerate a 0x prefix; malformed hashes are rejected.
 */
function verifyBinding(
  provided: string,
  stamped: string,
  nonce: string,
  proof: MerkleProofData,
  hasher: (data: Buffer | string) => string
): void {
  if (typeof provided !== 'string' || !HEX32.test(provided.trim())) {
    throw new BasestampError(`Invalid hash '${provided}': expected a 32-byte hex SHA256 digest`);
  }
  if (typeof stamped !== 'string' || !HEX32.test(stamped.trim())) {
    throw new BasestampError(`Stamp contains an invalid hash '${stamped}'`);
  }
  if (normalizeHex(provided) !== normalizeHex(stamped)) {
    throw new BasestampError(`Hash mismatch: provided hash '${provided}' does not match stamp's original hash '${stamped}'`);
  }
  if (typeof proof.leaf_hash !== 'string' || !HEX32.test(proof.leaf_hash.trim())) {
    throw new BasestampError(`Merkle proof contains an invalid leaf hash '${proof.leaf_hash}'`);
  }
  const leaf = normalizeHex(proof.leaf_hash);
  if (nonce) {
    // The server hashes the nonce string followed by the hash string exactly as it stored them.
    const expectedLeafHash = hasher(nonce + stamped.trim()).toLowerCase();
    if (expectedLeafHash !== leaf) {
      throw new BasestampError(`Leaf hash verification failed: expected '${expectedLeafHash}' but merkle proof contains '${proof.leaf_hash}'. This indicates the nonce '${nonce}' and original hash '${stamped}' do not match the merkle proof.`);
    }
  } else if (normalizeHex(stamped) !== leaf) {
    throw new BasestampError(`Legacy verification failed: original hash '${stamped}' does not match merkle proof leaf hash '${proof.leaf_hash}'`);
  }
}

export interface StampOptions {
  wait?: boolean;
  /** Seconds to wait for the merkle proof when wait is true (default 30). */
  timeout?: number;
  /** Milliseconds between polls when wait is true (default 1000). */
  pollInterval?: number;
}

export class Stamp {
  public stamp_id: string;
  public hash: string;
  public original_hash: string;
  public nonce: string;
  public timestamp: string;
  public status: string;
  public message?: string;
  public tx_id?: string;
  public block_hash?: string;
  public network?: string;
  public chain_id?: string;
  public merkle_root?: string;
  private merkle_proof?: MerkleProofData;
  private _verifier: (proof: MerkleProofData) => boolean;
  private _hasher: (data: Buffer | string) => string;

  constructor(
    data: StampData,
    verifier: (proof: MerkleProofData) => boolean,
    hasher: (data: Buffer | string) => string
  ) {
    this.stamp_id = data.stamp_id;
    this.hash = data.hash;
    this.original_hash = data.original_hash || data.hash; // Fallback to hash if original_hash not provided
    this.nonce = data.nonce || '';
    this.timestamp = data.timestamp;
    this.status = data.status;
    this.message = data.message;
    this.tx_id = data.tx_id;
    this.block_hash = data.block_hash;
    this.network = data.network;
    this.chain_id = data.chain_id;
    this.merkle_root = data.merkle_root;
    this.merkle_proof = data.merkle_proof;
    this._verifier = verifier;
    this._hasher = hasher;
  }

  verify(original_hash: string): boolean {
    if (!this.merkle_proof) {
      throw new BasestampError('Merkle proof not available for verification');
    }
    const proof = this.merkle_proof;
    verifyBinding(original_hash, this.original_hash, this.nonce, proof, this._hasher);

    if (this.merkle_root && normalizeHex(this.merkle_root) !== normalizeHex(String(proof.root_hash ?? ''))) {
      throw new BasestampError(`Merkle root mismatch: stamp merkle_root '${this.merkle_root}' differs from proof root_hash '${proof.root_hash}'`);
    }

    if (!this._verifier(proof)) {
      throw new BasestampError(`Merkle proof verification failed: the proof (leaf_index: ${proof.leaf_index}, siblings: [${(proof.siblings || []).join(', ')}], directions: [${(proof.directions || []).join(', ')}]) does not produce the expected root hash '${proof.root_hash}'`);
    }

    return true;
  }

  /**
   * Proves on Base that this stamp's merkle root was stamped by the Basestamp contract in tx_id
   * (receipt status, contract address, Stamped event with this root, stamper == signer, chain id,
   * and block_hash when the API provided one). Call verify(hash) first to bind your hash to the root.
   * Defaults to mainnet; pass { network: 'sepolia' } or explicit rpcURL/contractAddress otherwise.
   */
  async verifyOnChain(options: OnChainVerifyOptions = {}): Promise<OnChainVerification> {
    if (!this.merkle_proof) {
      throw new BasestampError('Merkle proof not available for on-chain verification');
    }
    if (!this.tx_id) {
      throw new BasestampError('Stamp has no tx_id yet (not confirmed on-chain)');
    }
    const root = this.merkle_proof.root_hash;
    if (this.merkle_root && normalizeHex(this.merkle_root) !== normalizeHex(String(root ?? ''))) {
      throw new BasestampError(`Merkle root mismatch: stamp merkle_root '${this.merkle_root}' differs from proof root_hash '${root}'`);
    }
    return verifyRootOnChain(root, this.tx_id, {
      ...(this.block_hash ? { expectedBlockHash: this.block_hash } : {}),
      ...options,
    });
  }

  /** verify(hash) locally and then verifyOnChain(options). */
  async verifyFull(original_hash: string, options: OnChainVerifyOptions = {}): Promise<OnChainVerification> {
    this.verify(original_hash);
    return this.verifyOnChain(options);
  }

  getMerkleProof(): MerkleProof {
    if (!this.merkle_proof) {
      throw new BasestampError('Merkle proof not available');
    }

    return new MerkleProof({
      ...this.merkle_proof,
      nonce: this.nonce,
      original_hash: this.original_hash
    }, this._verifier, this._hasher);
  }
}

export interface StampData {
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
  merkle_proof?: MerkleProofData;
}

/** Response of GET /info. Older servers returned {service, version, status, network: NetworkInfo}. */
export interface ServerInfo {
  network: string | NetworkInfo;
  chain_id?: string;
  is_testnet?: boolean;
  contract_address?: string;
  signer_address?: string;
  signer_balance_wei?: string;
  signer_balance_eth?: string;
  signer_balance_error?: string;
  rpc_url_host?: string;
  batch_interval?: string;
  pending_stamps?: number;
  service?: string;
  version?: string;
  status?: string;
  timestamp?: string;
}

export interface NetworkInfo {
  name: string;
  chain_id: string;
  rpc: string;
  is_testnet: boolean;
}

export interface BatchStats {
  pending_stamps: number;
  batch_processor: string;
  batch_interval: string;
}

export interface HealthResponse {
  status: string;
  timestamp: string;
}

export class BasestampError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BasestampError';
  }
}

export interface ClientOptions {
  baseURL?: string;
  /** Per-request timeout in milliseconds (default 30000). */
  timeout?: number;
  /** Allow a plain-http baseURL for non-local hosts (default false; http://localhost is always allowed). */
  allowInsecure?: boolean;
  /** Custom fetch implementation (default: native fetch, falling back to node-fetch). */
  fetch?: FetchLike;
}