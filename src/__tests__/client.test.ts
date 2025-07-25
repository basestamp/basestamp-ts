import { BasestampClient } from '../client';
import { BasestampError, MerkleProof } from '../types';

// Mock node-fetch
jest.mock('node-fetch');
const mockFetch = require('node-fetch') as jest.MockedFunction<typeof import('node-fetch').default>;

describe('BasestampClient', () => {
  let client: BasestampClient;

  beforeEach(() => {
    client = new BasestampClient({ baseURL: 'https://test.example.com' });
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    test('should use default baseURL when not provided', () => {
      const defaultClient = new BasestampClient();
      expect(defaultClient).toBeDefined();
    });

    test('should use provided options', () => {
      const customClient = new BasestampClient({
        baseURL: 'https://custom.example.com',
        timeout: 5000
      });
      expect(customClient).toBeDefined();
    });
  });

  describe('timestamp', () => {
    test('should successfully create timestamp', async () => {
      const mockResponse = {
        hash: 'test-hash',
        timestamp: '2023-01-01T00:00:00Z',
        status: 'pending',
        message: 'Timestamp created'
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      } as any);

      const result = await client.timestamp('test-hash');
      
      expect(mockFetch).toHaveBeenCalledWith(
        'https://test.example.com/stamp',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ hash: 'test-hash' })
        })
      );
      expect(result).toEqual(mockResponse);
    });

    test('should handle server error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request'
      } as any);

      await expect(client.timestamp('invalid-hash'))
        .rejects.toThrow(BasestampError);
    });
  });

  describe('getStamp', () => {
    test('should successfully retrieve stamp data', async () => {
      const mockStampData = {
        stamp_id: 'test-stamp-id',
        hash: 'test-hash',
        timestamp: '2023-01-01T00:00:00Z',
        status: 'confirmed',
        tx_id: 'test-tx-id',
        merkle_proof: {
          leaf_hash: 'leaf-hash',
          leaf_index: 0,
          siblings: ['sibling1'],
          directions: [true],
          root_hash: 'root-hash'
        }
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockStampData
      } as any);

      const result = await client.getStamp('test-stamp-id');
      
      expect(mockFetch).toHaveBeenCalledWith(
        'https://test.example.com/stamp/test-stamp-id',
        expect.objectContaining({
          method: 'GET',
          headers: { 'Content-Type': 'application/json' }
        })
      );
      expect(result).toEqual(mockStampData);
    });
  });

  describe('verifyStamp', () => {
    test('should successfully verify valid stamp', async () => {
      const mockStampData = {
        stamp_id: 'test-stamp-id',
        hash: 'test-hash',
        timestamp: '2023-01-01T00:00:00Z',
        status: 'confirmed',
        merkle_proof: {
          leaf_hash: '1b4f0e9851971998e732078544c96b36c3d01cedf7caa332359d6f1d83567014',
          leaf_index: 0,
          siblings: ['60303ae22b998861bce3b28f33eec1be758a213c86c93c076dbe9f558c11c752'],
          directions: [true],
          root_hash: '587b1fe3afa386ce7cf9e99cf6f3b7f6a78a3c1ca6a549bbd467c992e482dc56'
        } as MerkleProof
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockStampData
      } as any);

      const result = await client.verifyStamp('test-stamp-id');
      expect(result).toBe(true);
    });

    test('should throw error when merkle proof is not available', async () => {
      const mockStampData = {
        stamp_id: 'test-stamp-id',
        hash: 'test-hash',
        timestamp: '2023-01-01T00:00:00Z',
        status: 'pending'
        // No merkle_proof
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockStampData
      } as any);

      await expect(client.verifyStamp('test-stamp-id'))
        .rejects.toThrow('Merkle proof not yet available');
    });

    test('should return false for invalid proof', async () => {
      const mockStampData = {
        stamp_id: 'test-stamp-id',
        hash: 'test-hash',
        timestamp: '2023-01-01T00:00:00Z',
        status: 'confirmed',
        merkle_proof: {
          leaf_hash: 'invalid-leaf-hash',
          leaf_index: 0,
          siblings: ['sibling1'],
          directions: [true],
          root_hash: 'invalid-root-hash'
        } as MerkleProof
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockStampData
      } as any);

      const result = await client.verifyStamp('test-stamp-id');
      expect(result).toBe(false);
    });
  });

  describe('info', () => {
    test('should successfully retrieve server info', async () => {
      const mockInfo = {
        name: 'BaseStamp Calendar Server',
        version: '1.0.0',
        networks: [{
          name: 'BASE Sepolia',
          chain_id: '84532',
          rpc: 'https://sepolia.base.org',
          is_testnet: true
        }],
        features: ['timestamping', 'merkle_batching']
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockInfo
      } as any);

      const result = await client.info();
      expect(result).toEqual(mockInfo);
    });
  });

  describe('health', () => {
    test('should successfully check health', async () => {
      const mockHealth = {
        status: 'ok',
        timestamp: '2023-01-01T00:00:00Z'
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockHealth
      } as any);

      const result = await client.health();
      expect(result).toEqual(mockHealth);
    });
  });

  describe('batchStats', () => {
    test('should successfully retrieve batch stats', async () => {
      const mockStats = {
        pending_stamps: 5,
        processor_status: 'running',
        batch_interval: '5s'
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockStats
      } as any);

      const result = await client.batchStats();
      expect(result).toEqual(mockStats);
    });
  });

  describe('error handling', () => {
    test('should handle network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      await expect(client.timestamp('test-hash'))
        .rejects.toThrow(BasestampError);
    });

    test('should handle invalid JSON response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => { throw new Error('Invalid JSON'); }
      } as any);

      await expect(client.timestamp('test-hash'))
        .rejects.toThrow(BasestampError);
    });
  });
});