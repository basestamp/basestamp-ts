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
  Stamp,
  StampOptions
} from './types';
import { verifyMerkleProof, calculateSHA256, normalizeHash } from './merkle';
import { userAgent, isBrowser } from './version';
import { DEFAULT_BASE_URL } from './networks';
import { FetchLike, defaultFetch, describeError } from './http';

export class BasestampClient {
  private baseURL: string;
  private timeout: number;
  private fetchImpl: FetchLike;

  constructor(options: ClientOptions = {}) {
    const baseURL = (options.baseURL || DEFAULT_BASE_URL).replace(/\/+$/, '');
    let parsed: URL;
    try {
      parsed = new URL(baseURL);
    } catch {
      throw new BasestampError(`Invalid baseURL '${baseURL}'`);
    }
    const isLocal = ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
    if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && (isLocal || options.allowInsecure))) {
      throw new BasestampError(`baseURL must use https (got '${baseURL}'); set allowInsecure to override`);
    }
    if (options.timeout !== undefined && (!Number.isFinite(options.timeout) || options.timeout <= 0)) {
      throw new BasestampError('timeout must be a positive number of milliseconds');
    }
    this.baseURL = baseURL;
    this.timeout = options.timeout || 30000;
    this.fetchImpl = options.fetch || defaultFetch();
  }

  /**
   * Submits a SHA256 digest (64 hex chars, optional 0x prefix; normalized to lowercase) and returns
   * the stamp id. Throws BasestampError on invalid input or if the server returns no stamp id.
   */
  async submitSHA256(hash: string): Promise<string> {
    const normalized = normalizeHash(hash);
    if (normalized === null) {
      throw new BasestampError(`Invalid hash '${hash}': expected a 32-byte hex SHA256 digest`);
    }
    const request: CalendarRequest = { hash: normalized };

    const response = await this.makeRequest<CalendarResponse>('POST', '/stamp', request);

    if (!response || typeof response.stamp_id !== 'string' || response.stamp_id === '') {
      throw new BasestampError('Server response did not include a stamp_id');
    }
    return response.stamp_id;
  }

  async getStamp(stampId: string, options: StampOptions = {}): Promise<Stamp> {
    const { wait = false, timeout = 30, pollInterval = 1000 } = options;
    const path = `/stamp/${encodeURIComponent(validateStampId(stampId))}`;
    const deadline = Date.now() + timeout * 1000;

    for (;;) {
      const stampData = await this.makeRequest<StampData>('GET', path);
      if (!stampData || typeof stampData !== 'object') {
        throw new BasestampError('Malformed stamp response');
      }
      if (stampData.merkle_proof) {
        return new Stamp(stampData, verifyMerkleProof, calculateSHA256);
      }
      if (stampData.status === 'failed') {
        throw new BasestampError(`Stamp ${stampId} failed: ${stampData.message || 'no message'}`);
      }
      if (!wait) {
        throw new BasestampError('Merkle proof not yet available');
      }
      if (Date.now() + pollInterval > deadline) {
        throw new BasestampError(`Timeout waiting for stamp after ${timeout} seconds`);
      }
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }
  }

  /**
   * @deprecated Use getStamp() which now returns a Stamp object with verify method
   */
  async getStampLegacy(stampId: string): Promise<StampData> {
    const response = await this.makeRequest<StampData>('GET', `/stamp/${encodeURIComponent(validateStampId(stampId))}`);
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

  /**
   * @deprecated The server no longer serves /batch/stats; this is derived from /info.
   */
  async batchStats(): Promise<BatchStats> {
    const info = await this.info();
    return {
      pending_stamps: info.pending_stamps ?? 0,
      batch_processor: info.status ?? 'unknown',
      batch_interval: info.batch_interval ?? 'unknown',
    };
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
      const init: Parameters<FetchLike>[1] = {
        method,
        headers: {
          'Content-Type': 'application/json',
          // Browsers forbid overriding User-Agent; only set it in Node and other runtimes.
          ...(isBrowser() ? {} : { 'User-Agent': userAgent() }),
        },
        signal: controller.signal,
      };

      if (body && method === 'POST') {
        init.body = JSON.stringify(body);
      }

      const response = await this.fetchImpl(url, init);
      clearTimeout(timeoutId);

      if (!response.ok) {
        let detail = '';
        try {
          const errBody = await response.json() as { message?: unknown; error?: unknown };
          const msg = typeof errBody?.message === 'string' ? errBody.message
            : typeof errBody?.error === 'string' ? errBody.error : '';
          detail = msg ? `: ${msg.slice(0, 200)}` : '';
        } catch {
          // non-JSON error body
        }
        throw new BasestampError(`Server returned error: ${response.status} ${response.statusText}${detail}`);
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
      
      throw new BasestampError(`Request failed: ${describeError(error)}`);
    }
  }
}

const STAMP_ID = /^[A-Za-z0-9_-]{1,128}$/;

function validateStampId(stampId: string): string {
  if (typeof stampId !== 'string' || !STAMP_ID.test(stampId)) {
    throw new BasestampError(`Invalid stamp id '${stampId}'`);
  }
  return stampId;
}
