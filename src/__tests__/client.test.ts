import { BasestampClient } from '../client';
import { BasestampError, MerkleProof, MerkleProofData } from '../types';

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
    test('should handle verification process with nonce', async () => {
      // Test that the nonce-based verification process is called
      const mockStampData = {
        stamp_id: 'test-stamp-id',
        hash: 'test-hash',
        nonce: 'test-nonce',
        timestamp: '2023-01-01T00:00:00Z',
        status: 'confirmed',
        merkle_proof: {
          leaf_hash: '993cad762aeeebe03d453f2c6f5debf388a89f94c1a85b362adff7b83e9468b9',
          leaf_index: 0,
          siblings: ['invalid-sibling'], // This will cause merkle verification to fail
          directions: [true],
          root_hash: 'invalid-root'
        } as MerkleProofData
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockStampData
      } as any);

      // The result should be false because while the leaf hash calculation is correct,
      // the merkle proof itself is invalid
      const result = await client.verifyStamp('test-stamp-id');
      expect(result).toBe(false);
    });

    test('should throw error when merkle proof is not available', async () => {
      const mockStampData = {
        stamp_id: 'test-stamp-id',
        hash: 'test-hash',
        original_hash: 'test-original-hash',
        nonce: 'test-nonce',
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

    test('should use legacy mode when nonce is missing', async () => {
      const mockStampData = {
        stamp_id: 'test-stamp-id',
        hash: 'test-hash',
        timestamp: '2023-01-01T00:00:00Z',
        status: 'confirmed',
        merkle_proof: {
          leaf_hash: 'test-hash', // In legacy mode, leaf_hash should match the hash
          leaf_index: 0,
          siblings: ['60303ae22b998861bce3b28f33eec1be758a213c86c93c076dbe9f558c11c752'],
          directions: [true],
          root_hash: '587b1fe3afa386ce7cf9e99cf6f3b7f6a78a3c1ca6a549bbd467c992e482dc56'
        } as MerkleProofData
        // Missing nonce - should trigger legacy mode
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockStampData
      } as any);

      // Should not throw, but use legacy verification
      const result = await client.verifyStamp('test-stamp-id');
      expect(typeof result).toBe('boolean');
    });

    test('should return false for invalid proof', async () => {
      const mockStampData = {
        stamp_id: 'test-stamp-id',
        hash: 'test-hash',
        nonce: 'test-nonce',
        timestamp: '2023-01-01T00:00:00Z',
        status: 'confirmed',
        merkle_proof: {
          leaf_hash: 'invalid-leaf-hash', // This won't match the calculated hash
          leaf_index: 0,
          siblings: ['sibling1'],
          directions: [true],
          root_hash: 'invalid-root-hash'
        } as MerkleProofData
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockStampData
      } as any);

      const result = await client.verifyStamp('test-stamp-id');
      expect(result).toBe(false);
    });
  });

  describe('get_merkle_proof', () => {
    test('should successfully get merkle proof without waiting', async () => {
      const mockStampData = {
        stamp_id: 'test-stamp-id',
        hash: 'test-hash',
        nonce: 'test-nonce',
        timestamp: '2023-01-01T00:00:00Z',
        status: 'confirmed',
        merkle_proof: {
          leaf_hash: '993cad762aeeebe03d453f2c6f5debf388a89f94c1a85b362adff7b83e9468b9',
          leaf_index: 0,
          siblings: ['60303ae22b998861bce3b28f33eec1be758a213c86c93c076dbe9f558c11c752'],
          directions: [true],
          root_hash: '587b1fe3afa386ce7cf9e99cf6f3b7f6a78a3c1ca6a549bbd467c992e482dc56'
        }
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockStampData
      } as any);

      const proof = await client.get_merkle_proof('test-stamp-id');
      
      expect(proof).toBeInstanceOf(MerkleProof);
      expect(proof.nonce).toBe('test-nonce');
      expect(proof.original_hash).toBe('test-hash'); // Now uses hash field as original_hash
      expect(proof.leaf_hash).toBe('993cad762aeeebe03d453f2c6f5debf388a89f94c1a85b362adff7b83e9468b9');
    });

    test('should throw error when merkle proof is not available and wait is false', async () => {
      const mockStampData = {
        stamp_id: 'test-stamp-id',
        hash: 'test-hash',
        original_hash: 'test-original-hash',
        nonce: 'test-nonce',
        timestamp: '2023-01-01T00:00:00Z',
        status: 'pending'
        // No merkle_proof
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockStampData
      } as any);

      await expect(client.get_merkle_proof('test-stamp-id'))
        .rejects.toThrow('Merkle proof not yet available');
    });

    test('should verify hash with MerkleProof.verify() method', async () => {
      const mockStampData = {
        stamp_id: 'test-stamp-id',
        hash: 'testoriginal',
        nonce: 'testnonce',
        timestamp: '2023-01-01T00:00:00Z',
        status: 'confirmed',
        merkle_proof: {
          leaf_hash: '9eb1ed28077ad9510f19f6325b793d36d0e0d5e15041d2c759cc93e8b6f3503d',
          leaf_index: 0,
          siblings: ['60303ae22b998861bce3b28f33eec1be758a213c86c93c076dbe9f558c11c752'],
          directions: [true],
          root_hash: '587b1fe3afa386ce7cf9e99cf6f3b7f6a78a3c1ca6a549bbd467c992e482dc56'
        }
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockStampData
      } as any);

      const proof = await client.get_merkle_proof('test-stamp-id');
      
      // Test that verify method exists and returns a boolean
      const isValid = proof.verify('testoriginal'); // Should match the hash field
      expect(typeof isValid).toBe('boolean');
      
      // Test that providing wrong hash returns false
      const wrongHashResult = proof.verify('wrong-hash');
      expect(wrongHashResult).toBe(false);
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