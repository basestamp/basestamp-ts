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
  MerkleProof
} from './types';
import { verifyMerkleProof } from './merkle';

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

  async verifyStamp(stampId: string): Promise<boolean> {
    try {
      const stampData = await this.getStamp(stampId);
      
      if (!stampData.merkle_proof) {
        throw new BasestampError('Merkle proof not yet available');
      }
      
      return verifyMerkleProof(stampData.merkle_proof);
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