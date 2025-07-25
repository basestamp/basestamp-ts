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
    // Verify the provided hash matches the original hash
    if (hash_value !== this.original_hash) {
      return false;
    }
    
    // Handle both nonce-based and legacy verification
    if (this.nonce) {
      // New nonce-based verification
      const expectedLeafHash = this._hasher(this.nonce + this.original_hash);
      
      // Verify the calculated leaf hash matches the proof's leaf hash
      if (expectedLeafHash !== this.leaf_hash) {
        return false;
      }
    } else {
      // Legacy mode: assume leaf_hash should match the original hash directly
      if (this.original_hash !== this.leaf_hash) {
        return false;
      }
    }
    
    // Verify the Merkle proof itself
    return this._verifier(this);
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
  merkle_proof?: MerkleProofData;
}

export interface ServerInfo {
  service: string;
  version: string;
  status: string;
  network: NetworkInfo;
  timestamp: string;
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
  timeout?: number;
}