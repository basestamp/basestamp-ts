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

export interface MerkleProof {
  leaf_hash: string;
  leaf_index: number;
  siblings: string[];
  directions: boolean[];
  root_hash: string;
}

export interface StampData {
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