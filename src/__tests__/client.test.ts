import { BasestampClient } from '../client';
import { BasestampError, MerkleProof, MerkleProofData, Stamp } from '../types';

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

  describe('submitSHA256', () => {
    test('should successfully submit SHA256 hash and return stamp_id', async () => {
      const mockResponse = {
        hash: 'test-hash',
        timestamp: '2023-01-01T00:00:00Z',
        status: 'pending',
        message: 'Timestamp created',
        stamp_id: 'test-stamp-id'
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      } as any);

      const result = await client.submitSHA256('test-hash');
      
      expect(mockFetch).toHaveBeenCalledWith(
        'https://test.example.com/stamp',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ hash: 'test-hash' })
        })
      );
      expect(result).toBe('test-stamp-id');
    });

    test('should fallback to hash as stamp_id when stamp_id not provided', async () => {
      const mockResponse = {
        hash: 'test-hash',
        timestamp: '2023-01-01T00:00:00Z',
        status: 'pending',
        message: 'Timestamp created'
        // No stamp_id field
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      } as any);

      const result = await client.submitSHA256('test-hash');
      expect(result).toBe('test-hash');
    });

    test('should handle server error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request'
      } as any);

      await expect(client.submitSHA256('invalid-hash'))
        .rejects.toThrow(BasestampError);
    });
  });

  describe('getStamp', () => {
    test('should successfully retrieve stamp and return Stamp object', async () => {
      const mockStampData = {
        stamp_id: 'test-stamp-id',
        hash: 'test-hash',
        original_hash: 'test-hash',
        nonce: 'test-nonce',
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
      expect(result).toBeInstanceOf(Stamp);
      expect(result.stamp_id).toBe('test-stamp-id');
      expect(result.hash).toBe('test-hash');
    });

    test('should handle wait and timeout options', async () => {
      const mockStampData = {
        stamp_id: 'test-stamp-id',
        hash: 'test-hash',
        original_hash: 'test-hash',
        nonce: 'test-nonce',
        timestamp: '2023-01-01T00:00:00Z',
        status: 'confirmed',
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

      const result = await client.getStamp('test-stamp-id', { wait: true, timeout: 10 });
      expect(result).toBeInstanceOf(Stamp);
    });

    test('should throw error when merkle proof is not available and wait is false', async () => {
      const mockStampData = {
        stamp_id: 'test-stamp-id',
        hash: 'test-hash',
        original_hash: 'test-hash',
        nonce: 'test-nonce',
        timestamp: '2023-01-01T00:00:00Z',
        status: 'pending'
        // No merkle_proof
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockStampData
      } as any);

      await expect(client.getStamp('test-stamp-id'))
        .rejects.toThrow('Merkle proof not yet available');
    });
  });

  describe('Stamp class', () => {
    test('should verify hash correctly with Stamp.verify() method', async () => {
      // Use testnonce + testoriginal = SHA256('testnonceoriginal') = 
      // Let's calculate the correct leaf hash for the test
      const originalHash = 'testoriginal';
      const nonce = 'testnonce';
      
      const mockStampData = {
        stamp_id: 'test-stamp-id',
        hash: originalHash,
        original_hash: originalHash,
        nonce: nonce,
        timestamp: '2023-01-01T00:00:00Z',
        status: 'confirmed',
        merkle_proof: {
          leaf_hash: '1b4f0e9851971998e732078544c96b36c3d01cedf7caa332359d6f1d83567014', // Valid leaf from merkle tests
          leaf_index: 0,
          siblings: ['60303ae22b998861bce3b28f33eec1be758a213c86c93c076dbe9f558c11c752'],
          directions: [true],
          root_hash: '587b1fe3afa386ce7cf9e99cf6f3b7f6a78a3c1ca6a549bbd467c992e482dc56'
        } as MerkleProofData
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockStampData
      } as any);

      const stamp = await client.getStamp('test-stamp-id');
      
      // Test that providing wrong hash throws descriptive error
      expect(() => stamp.verify('wrong-hash')).toThrow('Hash mismatch: provided hash \'wrong-hash\' does not match stamp\'s original hash \'testoriginal\'');
      
      // Since the leaf hash doesn't match nonce+original, it should throw leaf hash error
      expect(() => stamp.verify(originalHash)).toThrow('Leaf hash verification failed');
    });

    test('should throw error during verification when merkle proof is not available', async () => {
      const mockStampData = {
        stamp_id: 'test-stamp-id',
        hash: 'test-hash',
        original_hash: 'test-hash',
        nonce: 'test-nonce',
        timestamp: '2023-01-01T00:00:00Z',
        status: 'pending'
        // No merkle_proof
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockStampData
      } as any);

      // This should fail at getStamp level since merkle_proof is required
      await expect(client.getStamp('test-stamp-id'))
        .rejects.toThrow('Merkle proof not yet available');
    });

    test('should use legacy mode when nonce is missing', async () => {
      const mockStampData = {
        stamp_id: 'test-stamp-id',
        hash: '1b4f0e9851971998e732078544c96b36c3d01cedf7caa332359d6f1d83567014',
        original_hash: '1b4f0e9851971998e732078544c96b36c3d01cedf7caa332359d6f1d83567014',
        nonce: '', // Empty nonce for legacy mode
        timestamp: '2023-01-01T00:00:00Z',
        status: 'confirmed',
        merkle_proof: {
          leaf_hash: '1b4f0e9851971998e732078544c96b36c3d01cedf7caa332359d6f1d83567014', // In legacy mode, leaf_hash should match the hash
          leaf_index: 0,
          siblings: ['60303ae22b998861bce3b28f33eec1be758a213c86c93c076dbe9f558c11c752'],
          directions: [true],
          root_hash: '587b1fe3afa386ce7cf9e99cf6f3b7f6a78a3c1ca6a549bbd467c992e482dc56' // Valid root from merkle tests
        } as MerkleProofData
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockStampData
      } as any);

      const stamp = await client.getStamp('test-stamp-id');
      const result = stamp.verify('1b4f0e9851971998e732078544c96b36c3d01cedf7caa332359d6f1d83567014');
      expect(result).toBe(true);
    });

    test('should throw descriptive error for invalid proof', async () => {
      const mockStampData = {
        stamp_id: 'test-stamp-id',
        hash: 'test-hash',
        original_hash: 'test-hash',
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

      const stamp = await client.getStamp('test-stamp-id');
      expect(() => stamp.verify('test-hash')).toThrow('Leaf hash verification failed');
    });
  });

  describe('get_merkle_proof (deprecated)', () => {
    test('should successfully get merkle proof through deprecated method', async () => {
      const mockStampData = {
        stamp_id: 'test-stamp-id',
        hash: 'test-hash',
        original_hash: 'test-hash',
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
      expect(proof.original_hash).toBe('test-hash');
      expect(proof.leaf_hash).toBe('993cad762aeeebe03d453f2c6f5debf388a89f94c1a85b362adff7b83e9468b9');
    });
  });

  describe('verifyStamp (deprecated)', () => {
    test('should successfully verify stamp through deprecated method', async () => {
      const mockStampData = {
        stamp_id: 'test-stamp-id',
        hash: '1b4f0e9851971998e732078544c96b36c3d01cedf7caa332359d6f1d83567014',
        original_hash: '1b4f0e9851971998e732078544c96b36c3d01cedf7caa332359d6f1d83567014',
        nonce: '', // Empty nonce for legacy mode
        timestamp: '2023-01-01T00:00:00Z',
        status: 'confirmed',
        merkle_proof: {
          leaf_hash: '1b4f0e9851971998e732078544c96b36c3d01cedf7caa332359d6f1d83567014',
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

      const result = await client.verifyStamp('test-stamp-id');
      expect(result).toBe(true);
    });

    test('should throw error for invalid verification', async () => {
      const mockStampData = {
        stamp_id: 'test-stamp-id',
        hash: 'testinvalid',
        original_hash: 'testinvalid',
        nonce: 'testnonce',
        timestamp: '2023-01-01T00:00:00Z',
        status: 'confirmed',
        merkle_proof: {
          leaf_hash: 'invalid-leaf-hash', // This will cause verification to fail
          leaf_index: 0,
          siblings: ['sibling1'],
          directions: [true],
          root_hash: 'invalid-root-hash'
        }
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockStampData
      } as any);

      await expect(client.verifyStamp('test-stamp-id')).rejects.toThrow('Leaf hash verification failed');
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

      await expect(client.submitSHA256('test-hash'))
        .rejects.toThrow(BasestampError);
    });

    test('should handle invalid JSON response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => { throw new Error('Invalid JSON'); }
      } as any);

      await expect(client.submitSHA256('test-hash'))
        .rejects.toThrow(BasestampError);
    });
  });
});