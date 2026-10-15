import { readFileSync } from 'fs';
import { join } from 'path';
import { NETWORKS, SEPOLIA_BASE_URL } from '../networks';
import { BasestampClient } from '../client';
import { FetchLike } from '../http';
import { BasestampError, MerkleProof, Stamp } from '../types';

const mockFetch = jest.fn() as jest.MockedFunction<FetchLike>;

// Real Base mainnet stamp (see testdata/vectors.json).
const vectors = JSON.parse(readFileSync(join(__dirname, '..', '..', 'testdata', 'vectors.json'), 'utf8'));
const V = vectors.find((v: { name: string }) => v.name === 'mainnet-3-leaf-batch-index-0');
const HASH: string = V.hash;
const STAMP_ID: string = V.stamp_id;

function realStampResponse(overrides: Record<string, unknown> = {}) {
  return {
    stamp_id: STAMP_ID,
    hash: HASH,
    nonce: V.nonce,
    timestamp: '2026-10-15T17:07:04.082020452Z',
    status: 'confirmed',
    message: 'Stamp confirmed on blockchain with merkle proof',
    network: 'BASE Mainnet',
    tx_id: V.tx_id,
    block_hash: '0x3985dff0b1e8f9c2ed2b90a89f184762f31d8d90c084fd1deb99c7dc18f731fe',
    merkle_root: V.expected_root,
    merkle_proof: JSON.parse(JSON.stringify(V.proof)),
    ...overrides,
  };
}

function ok(body: unknown) {
  return { ok: true, status: 200, statusText: 'OK', json: async () => body };
}

function fail(status: number, statusText: string, body?: unknown) {
  return {
    ok: false, status, statusText,
    json: async () => { if (body === undefined) throw new Error('no json'); return body; },
  };
}

describe('BasestampClient', () => {
  let client: BasestampClient;

  beforeEach(() => {
    mockFetch.mockReset();
    client = new BasestampClient({ baseURL: 'https://test.example.com', fetch: mockFetch });
  });

  describe('constructor', () => {
    test('should use default baseURL when not provided', () => {
      const defaultClient = new BasestampClient();
      expect((defaultClient as any).baseURL).toBe('https://api-mainnet.basestamp.io');
      expect(NETWORKS.mainnet.chainId).toBe(8453);
    });

    test('Sepolia remains selectable', () => {
      const c = new BasestampClient({ baseURL: SEPOLIA_BASE_URL });
      expect((c as any).baseURL).toBe('https://api-sepolia.basestamp.io');
      expect(NETWORKS.sepolia.chainId).toBe(84532);
    });

    test('should use provided options and strip trailing slashes', () => {
      const c = new BasestampClient({ baseURL: 'https://custom.example.com/', timeout: 5000 });
      expect((c as any).baseURL).toBe('https://custom.example.com');
      expect((c as any).timeout).toBe(5000);
    });

    test('rejects plain http for remote hosts unless allowInsecure', () => {
      expect(() => new BasestampClient({ baseURL: 'http://api.example.com' })).toThrow(/https/);
      expect(() => new BasestampClient({ baseURL: 'http://api.example.com', allowInsecure: true })).not.toThrow();
      expect(() => new BasestampClient({ baseURL: 'http://localhost:8080' })).not.toThrow();
    });

    test('rejects invalid baseURL and timeout', () => {
      expect(() => new BasestampClient({ baseURL: 'not a url' })).toThrow(BasestampError);
      expect(() => new BasestampClient({ timeout: -1 })).toThrow(/timeout/);
    });
  });

  describe('submitSHA256', () => {
    test('should successfully submit SHA256 hash and return stamp_id', async () => {
      mockFetch.mockResolvedValueOnce(ok({ stamp_id: STAMP_ID, hash: HASH, status: 'pending', timestamp: '' }));

      const result = await client.submitSHA256(HASH);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://test.example.com/stamp',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'User-Agent': expect.stringMatching(/^basestamp-ts\//),
          }),
          body: JSON.stringify({ hash: HASH }),
        })
      );
      expect(result).toBe(STAMP_ID);
    });

    test('normalizes 0x-prefixed / uppercase input to lowercase hex', async () => {
      mockFetch.mockResolvedValueOnce(ok({ stamp_id: STAMP_ID }));
      await client.submitSHA256('0x' + HASH.toUpperCase());
      expect(mockFetch.mock.calls[0][1].body).toBe(JSON.stringify({ hash: HASH }));
    });

    test.each(['test-hash', '', 'zz'.repeat(32), HASH.slice(1), HASH + '00'])('rejects invalid hash %p before any request', async bad => {
      await expect(client.submitSHA256(bad)).rejects.toThrow(/Invalid hash/);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    test('throws (instead of returning the hash) when the server omits stamp_id', async () => {
      mockFetch.mockResolvedValueOnce(ok({ hash: HASH, status: 'pending' }));
      await expect(client.submitSHA256(HASH)).rejects.toThrow(/stamp_id/);
    });

    test('should handle server error and surface the server message', async () => {
      mockFetch.mockResolvedValueOnce(fail(400, 'Bad Request', { error: true, message: 'Invalid hash: bad' }));
      await expect(client.submitSHA256(HASH)).rejects.toThrow('Server returned error: 400 Bad Request: Invalid hash: bad');
    });
  });

  describe('getStamp', () => {
    test('should successfully retrieve stamp and return Stamp object', async () => {
      mockFetch.mockResolvedValueOnce(ok(realStampResponse()));

      const result = await client.getStamp(STAMP_ID);

      expect(mockFetch).toHaveBeenCalledWith(
        `https://test.example.com/stamp/${STAMP_ID}`,
        expect.objectContaining({ method: 'GET' })
      );
      expect(result).toBeInstanceOf(Stamp);
      expect(result.stamp_id).toBe(STAMP_ID);
      expect(result.hash).toBe(HASH);
      expect(result.original_hash).toBe(HASH);
      expect(result.merkle_root).toBe(V.expected_root);
      expect(result.verify(HASH)).toBe(true);
    });

    test('rejects stamp ids that could alter the request path', async () => {
      for (const bad of ['../info', 'a/b', 'a?b', '', 'x'.repeat(200)]) {
        await expect(client.getStamp(bad)).rejects.toThrow(/Invalid stamp id/);
      }
      expect(mockFetch).not.toHaveBeenCalled();
    });

    test('should throw error when merkle proof is not available and wait is false', async () => {
      mockFetch.mockResolvedValueOnce(ok(realStampResponse({ status: 'pending', merkle_proof: undefined })));
      await expect(client.getStamp(STAMP_ID)).rejects.toThrow('Merkle proof not yet available');
    });

    test('wait polls until the proof is available', async () => {
      mockFetch
        .mockResolvedValueOnce(ok(realStampResponse({ status: 'pending', merkle_proof: undefined })))
        .mockResolvedValueOnce(ok(realStampResponse({ status: 'pending', merkle_proof: undefined })))
        .mockResolvedValueOnce(ok(realStampResponse()));
      const result = await client.getStamp(STAMP_ID, { wait: true, timeout: 10, pollInterval: 5 });
      expect(result).toBeInstanceOf(Stamp);
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    test('wait honours the timeout (deadline based)', async () => {
      mockFetch.mockResolvedValue(ok(realStampResponse({ status: 'pending', merkle_proof: undefined })));
      const start = Date.now();
      await expect(client.getStamp(STAMP_ID, { wait: true, timeout: 0.2, pollInterval: 50 }))
        .rejects.toThrow(/Timeout waiting for stamp after 0.2 seconds/);
      expect(Date.now() - start).toBeLessThan(2000);
    });

    test('fails fast on a failed stamp', async () => {
      mockFetch.mockResolvedValueOnce(ok(realStampResponse({ status: 'failed', message: 'boom', merkle_proof: undefined })));
      await expect(client.getStamp(STAMP_ID, { wait: true, timeout: 10 })).rejects.toThrow(/failed: boom/);
    });

    test('404 surfaces the server message', async () => {
      mockFetch.mockResolvedValueOnce(fail(404, 'Not Found', { error: true, message: 'Stamp not found' }));
      await expect(client.getStamp(STAMP_ID)).rejects.toThrow('404 Not Found: Stamp not found');
    });
  });

  describe('Stamp class', () => {
    async function getRealStamp(overrides: Record<string, unknown> = {}) {
      mockFetch.mockResolvedValueOnce(ok(realStampResponse(overrides)));
      return client.getStamp(STAMP_ID);
    }

    test('verifies a real mainnet stamp (case-insensitive, 0x tolerated)', async () => {
      const stamp = await getRealStamp();
      expect(stamp.verify(HASH)).toBe(true);
      expect(stamp.verify('0x' + HASH.toUpperCase())).toBe(true);
    });

    test('rejects a different hash', async () => {
      const stamp = await getRealStamp();
      const other = 'f'.repeat(64);
      expect(() => stamp.verify(other)).toThrow(`Hash mismatch: provided hash '${other}' does not match stamp's original hash '${HASH}'`);
    });

    test('rejects malformed hash input', async () => {
      const stamp = await getRealStamp();
      expect(() => stamp.verify('wrong-hash')).toThrow(/Invalid hash/);
    });

    test('rejects a tampered nonce (leaf binding)', async () => {
      const stamp = await getRealStamp({ nonce: '1792084020825457905' });
      expect(() => stamp.verify(HASH)).toThrow('Leaf hash verification failed');
    });

    test('rejects a tampered sibling', async () => {
      const resp = realStampResponse();
      resp.merkle_proof.siblings[1] = '0'.repeat(64);
      const stamp = await getRealStamp(resp);
      expect(() => stamp.verify(HASH)).toThrow('Merkle proof verification failed');
    });

    test('rejects a tampered root', async () => {
      const resp = realStampResponse();
      resp.merkle_proof.root_hash = '0'.repeat(64);
      resp.merkle_root = '0'.repeat(64);
      const stamp = await getRealStamp(resp);
      expect(() => stamp.verify(HASH)).toThrow('Merkle proof verification failed');
    });

    test('rejects merkle_root that disagrees with proof.root_hash', async () => {
      const stamp = await getRealStamp({ merkle_root: '1'.repeat(64) });
      expect(() => stamp.verify(HASH)).toThrow('Merkle root mismatch');
    });

    test('legacy mode (no nonce): leaf must equal the hash', async () => {
      const leaf = V.proof.leaf_hash;
      const stamp = await getRealStamp({ hash: leaf, nonce: '' });
      expect(stamp.verify(leaf)).toBe(true);
      const stamp2 = await getRealStamp({ nonce: '' });
      expect(() => stamp2.verify(HASH)).toThrow('Legacy verification failed');
    });

    test('getMerkleProof returns a verifiable MerkleProof', async () => {
      const stamp = await getRealStamp();
      const proof = stamp.getMerkleProof();
      expect(proof).toBeInstanceOf(MerkleProof);
      expect(proof.verify(HASH)).toBe(true);
      expect(() => proof.verify('f'.repeat(64))).toThrow('Hash mismatch');
    });
  });

  describe('get_merkle_proof (deprecated)', () => {
    test('should successfully get merkle proof through deprecated method', async () => {
      mockFetch.mockResolvedValueOnce(ok(realStampResponse()));
      const proof = await client.get_merkle_proof(STAMP_ID);
      expect(proof).toBeInstanceOf(MerkleProof);
      expect(proof.nonce).toBe(V.nonce);
      expect(proof.original_hash).toBe(HASH);
      expect(proof.leaf_hash).toBe(V.proof.leaf_hash);
    });
  });

  describe('verifyStamp (deprecated)', () => {
    test('should successfully verify stamp through deprecated method', async () => {
      mockFetch.mockResolvedValueOnce(ok(realStampResponse()));
      await expect(client.verifyStamp(STAMP_ID)).resolves.toBe(true);
    });

    test('should throw error for invalid verification', async () => {
      const resp = realStampResponse();
      resp.merkle_proof.leaf_hash = '0'.repeat(64);
      mockFetch.mockResolvedValueOnce(ok(resp));
      await expect(client.verifyStamp(STAMP_ID)).rejects.toThrow('Leaf hash verification failed');
    });
  });

  describe('info', () => {
    test('should successfully retrieve server info', async () => {
      const mockInfo = {
        batch_interval: '5s', chain_id: '8453', contract_address: NETWORKS.mainnet.contractAddress,
        is_testnet: false, network: 'BASE Mainnet', pending_stamps: 0, rpc_url_host: 'mainnet.base.org',
        signer_address: NETWORKS.mainnet.signerAddress,
      };
      mockFetch.mockResolvedValueOnce(ok(mockInfo));
      await expect(client.info()).resolves.toEqual(mockInfo);
    });
  });

  describe('health', () => {
    test('should successfully check health', async () => {
      const mockHealth = { status: 'healthy', timestamp: '2023-01-01T00:00:00Z' };
      mockFetch.mockResolvedValueOnce(ok(mockHealth));
      await expect(client.health()).resolves.toEqual(mockHealth);
    });
  });

  describe('batchStats (deprecated)', () => {
    test('is derived from /info (the server no longer serves /batch/stats)', async () => {
      mockFetch.mockResolvedValueOnce(ok({ pending_stamps: 5, batch_interval: '5s', network: 'BASE Mainnet' }));
      await expect(client.batchStats()).resolves.toEqual({ pending_stamps: 5, batch_interval: '5s', batch_processor: 'unknown' });
      expect(mockFetch.mock.calls[0][0]).toBe('https://test.example.com/info');
    });
  });

  describe('error handling', () => {
    test('should handle network error', async () => {
      mockFetch.mockRejectedValueOnce(Object.assign(new Error('fetch failed'), { cause: { code: 'ECONNREFUSED' } }));
      await expect(client.health()).rejects.toThrow('Request failed: fetch failed (ECONNREFUSED)');
    });

    test('should handle invalid JSON response', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200, statusText: 'OK', json: async () => { throw new Error('Invalid JSON'); } });
      await expect(client.submitSHA256(HASH)).rejects.toThrow(BasestampError);
    });

    test('should time out', async () => {
      const slow = new BasestampClient({
        baseURL: 'https://test.example.com',
        timeout: 20,
        fetch: (_url, init) => new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
        }),
      });
      await expect(slow.health()).rejects.toThrow('Request timeout');
    });
  });
});
