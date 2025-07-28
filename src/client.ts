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
  MerkleProofData,
  Stamp,
  StampOptions
} from './types';
import { verifyMerkleProof, calculateSHA256 } from './merkle';

export class BasestampClient {
  private baseURL: string;
  private timeout: number;

  constructor(options: ClientOptions = {}) {
    this.baseURL = options.baseURL || 'https://api.basestamp.io';
    this.timeout = options.timeout || 30000;
  }

  async submitSHA256(hash: string): Promise<string> {
    const request: CalendarRequest = { hash };
    
    const response = await this.makeRequest<CalendarResponse>('POST', '/stamp', request);
    
    // Extract stamp_id from the response
    // Note: Assuming the API returns a stamp_id field. If not, this might need adjustment based on actual API response
    if ('stamp_id' in response) {
      return (response as any).stamp_id;
    }
    
    // Fallback: use hash as stamp_id if stamp_id is not provided
    return response.hash;
  }

  async getStamp(stampId: string, options: StampOptions = {}): Promise<Stamp> {
    const { wait = false, timeout = 30 } = options;
    let attempts = 0;
    const maxAttempts = wait ? Math.ceil(timeout) : 1;
    const delayMs = 1000; // 1 second between attempts

    while (attempts < maxAttempts) {
      try {
        const stampData = await this.makeRequest<StampData>('GET', `/stamp/${stampId}`);
        
        if (!stampData.merkle_proof) {
          if (!wait || attempts === maxAttempts - 1) {
            throw new BasestampError('Merkle proof not yet available');
          }
          // Wait before retrying
          await new Promise(resolve => setTimeout(resolve, delayMs));
          attempts++;
          continue;
        }
        
        return new Stamp(stampData, verifyMerkleProof, calculateSHA256);
      } catch (error) {
        if (error instanceof BasestampError) {
          throw error;
        }
        throw new BasestampError(`Failed to get stamp: ${error}`);
      }
    }
    
    throw new BasestampError(`Timeout waiting for stamp after ${timeout} seconds`);
  }

  /**
   * @deprecated Use getStamp() which now returns a Stamp object with verify method
   */
  async getStampLegacy(stampId: string): Promise<StampData> {
    const response = await this.makeRequest<StampData>('GET', `/stamp/${stampId}`);
    return response;
  }

  /**
   * @deprecated Use getStamp() and call stamp.getMerkleProof() instead
   */
  async get_merkle_proof(stampId: string, wait: boolean = false, timeout: number = 30): Promise<MerkleProof> {
    const stamp = await this.getStamp(stampId, { wait, timeout });
    return stamp.getMerkleProof();
  }

  /**
   * @deprecated Use getStamp() and call stamp.verify() instead
   */
  async verifyStamp(stampId: string, hashValue?: string): Promise<boolean> {
    try {
      const stamp = await this.getStamp(stampId);
      
      // If no hash value provided, use the original_hash from the stamp
      const hashToVerify = hashValue || stamp.original_hash;
      
      return stamp.verify(hashToVerify);
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