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
    // Verify the provided hash matches the original hash
    if (hash_value !== this.original_hash) {
      throw new BasestampError(`Hash mismatch: provided hash '${hash_value}' does not match proof's original hash '${this.original_hash}'`);
    }
    
    // Handle both nonce-based and legacy verification
    if (this.nonce) {
      // New nonce-based verification
      const expectedLeafHash = this._hasher(this.nonce + this.original_hash);
      
      // Verify the calculated leaf hash matches the proof's leaf hash
      if (expectedLeafHash !== this.leaf_hash) {
        throw new BasestampError(`Leaf hash verification failed: expected '${expectedLeafHash}' but merkle proof contains '${this.leaf_hash}'. This indicates the nonce '${this.nonce}' and original hash '${this.original_hash}' do not match the merkle proof.`);
      }
    } else {
      // Legacy mode: assume leaf_hash should match the original hash directly
      if (this.original_hash !== this.leaf_hash) {
        throw new BasestampError(`Legacy verification failed: original hash '${this.original_hash}' does not match merkle proof leaf hash '${this.leaf_hash}'`);
      }
    }
    
    // Verify the Merkle proof itself
    const isValidProof = this._verifier(this);
    if (!isValidProof) {
      throw new BasestampError(`Merkle proof verification failed: the proof structure (leaf_index: ${this.leaf_index}, siblings: [${this.siblings.join(', ')}], directions: [${this.directions.join(', ')}]) does not produce the expected root hash '${this.root_hash}'`);
    }
    
    return true;
  }
}

export interface StampOptions {
  wait?: boolean;
  timeout?: number;
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
    this.merkle_proof = data.merkle_proof;
    this._verifier = verifier;
    this._hasher = hasher;
  }

  verify(original_hash: string): boolean {
    if (!this.merkle_proof) {
      throw new BasestampError('Merkle proof not available for verification');
    }

    // Verify the provided hash matches the original hash
    if (original_hash !== this.original_hash) {
      throw new BasestampError(`Hash mismatch: provided hash '${original_hash}' does not match stamp's original hash '${this.original_hash}'`);
    }
    
    // Handle both nonce-based and legacy verification
    if (this.nonce) {
      // New nonce-based verification
      const expectedLeafHash = this._hasher(this.nonce + this.original_hash);
      
      // Verify the calculated leaf hash matches the proof's leaf hash
      if (expectedLeafHash !== this.merkle_proof.leaf_hash) {
        throw new BasestampError(`Leaf hash verification failed: expected '${expectedLeafHash}' but merkle proof contains '${this.merkle_proof.leaf_hash}'. This indicates the nonce '${this.nonce}' and original hash '${this.original_hash}' do not match the merkle proof.`);
      }
    } else {
      // Legacy mode: assume leaf_hash should match the original hash directly
      if (this.original_hash !== this.merkle_proof.leaf_hash) {
        throw new BasestampError(`Legacy verification failed: original hash '${this.original_hash}' does not match merkle proof leaf hash '${this.merkle_proof.leaf_hash}'`);
      }
    }
    
    // Verify the Merkle proof itself
    const isValidProof = this._verifier(this.merkle_proof);
    if (!isValidProof) {
      throw new BasestampError(`Merkle proof verification failed: the proof structure (leaf_index: ${this.merkle_proof.leaf_index}, siblings: [${this.merkle_proof.siblings.join(', ')}], directions: [${this.merkle_proof.directions.join(', ')}]) does not produce the expected root hash '${this.merkle_proof.root_hash}'`);
    }
    
    return true;
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