import fetch from 'node-fetch';
import {
  CalendarRequest,
  CalendarResponse,
  StampData,
  ServerInfo,
  BatchStats,
  HealthResponse,
  BasestampError,
  ClientOptions,
  MerkleProof,
  MerkleProofData
} from './types';
import { verifyMerkleProof, calculateSHA256 } from './merkle';

export class BasestampClient {
  private baseURL: string;
  private timeout: number;

  constructor(options: ClientOptions = {}) {
    this.baseURL = options.baseURL || 'https://api.basestamp.io';
    this.timeout = options.timeout || 30000;
  }

  async timestamp(hash: string): Promise<CalendarResponse> {
    const request: CalendarRequest = { hash };
    
    const response = await this.makeRequest<CalendarResponse>('POST', '/stamp', request);
    return response;
  }

  async getStamp(stampId: string): Promise<StampData> {
    const response = await this.makeRequest<StampData>('GET', `/stamp/${stampId}`);
    return response;
  }

  async get_merkle_proof(stampId: string, wait: boolean = false, timeout: number = 30): Promise<MerkleProof> {
    let attempts = 0;
    const maxAttempts = wait ? Math.ceil(timeout) : 1;
    const delayMs = 1000; // 1 second between attempts

    while (attempts < maxAttempts) {
      try {
        const stampData = await this.getStamp(stampId);
        
        if (!stampData.merkle_proof) {
          if (!wait || attempts === maxAttempts - 1) {
            throw new BasestampError('Merkle proof not yet available');
          }
          // Wait before retrying
          await new Promise(resolve => setTimeout(resolve, delayMs));
          attempts++;
          continue;
        }
        
        // Handle both new nonce-based format and legacy format
        if (stampData.nonce) {
          // New nonce-based verification format (nonce is at top level, use hash as original_hash)
          return new MerkleProof({
            ...stampData.merkle_proof,
            nonce: stampData.nonce,
            original_hash: stampData.hash // Use hash field as original_hash
          }, verifyMerkleProof, calculateSHA256);
        } else {
          // Legacy format - use hash as both nonce and original_hash for backward compatibility
          console.warn('Server response missing nonce field. Using legacy compatibility mode.');
          return new MerkleProof({
            ...stampData.merkle_proof,
            nonce: '', // Empty nonce for legacy mode
            original_hash: stampData.hash // Use the hash field as original_hash
          }, verifyMerkleProof, calculateSHA256);
        }
      } catch (error) {
        if (error instanceof BasestampError) {
          throw error;
        }
        throw new BasestampError(`Failed to get merkle proof: ${error}`);
      }
    }
    
    throw new BasestampError(`Timeout waiting for merkle proof after ${timeout} seconds`);
  }

  async verifyStamp(stampId: string, hashValue?: string): Promise<boolean> {
    try {
      // Use the new pattern: get_merkle_proof and then verify
      const proof = await this.get_merkle_proof(stampId);
      
      // If no hash value provided, use the original_hash from the proof
      const hashToVerify = hashValue || proof.original_hash;
      
      return proof.verify(hashToVerify);
    } catch (error) {
      if (error instanceof BasestampError) {
        throw error;
      }
      throw new BasestampError(`Failed to verify stamp: ${error}`);
    }
  }

  async info(): Promise<ServerInfo> {
    const response = await this.makeRequest<ServerInfo>('GET', '/info');
    return response;
  }

  async health(): Promise<HealthResponse> {
    const response = await this.makeRequest<HealthResponse>('GET', '/health');
    return response;
  }

  async batchStats(): Promise<BatchStats> {
    const response = await this.makeRequest<BatchStats>('GET', '/batch/stats');
    return response;
  }

  private async makeRequest<T>(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown
  ): Promise<T> {
    const url = `${this.baseURL}${path}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const init: Parameters<typeof fetch>[1] = {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
      };

      if (body && method === 'POST') {
        init.body = JSON.stringify(body);
      }

      const response = await fetch(url, init);
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new BasestampError(`Server returned error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json() as T;
      return data;
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error instanceof BasestampError) {
        throw error;
      }
      
      if ((error as Error).name === 'AbortError') {
        throw new BasestampError('Request timeout');
      }
      
      throw new BasestampError(`Request failed: ${error}`);
    }
  }
}