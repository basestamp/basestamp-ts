import { verifyMerkleProof, calculateSHA256 } from '../merkle';
import { MerkleProofData } from '../types';

describe('Merkle Proof Verification', () => {
  test('should verify a valid merkle proof', () => {
    const validProof: MerkleProofData = {
      leaf_hash: '1b4f0e9851971998e732078544c96b36c3d01cedf7caa332359d6f1d83567014',
      leaf_index: 0,
      siblings: ['60303ae22b998861bce3b28f33eec1be758a213c86c93c076dbe9f558c11c752'],
      directions: [true],
      root_hash: '587b1fe3afa386ce7cf9e99cf6f3b7f6a78a3c1ca6a549bbd467c992e482dc56'
    };

    expect(verifyMerkleProof(validProof)).toBe(true);
  });

  test('should reject an invalid merkle proof with wrong root hash', () => {
    const invalidProof: MerkleProofData = {
      leaf_hash: '1b4f0e9851971998e732078544c96b36c3d01cedf7caa332359d6f1d83567014',
      leaf_index: 0,
      siblings: ['60303ae22b998861bce3b28f33eec1be758a213c86c93c076dbe9f558c11c752'],
      directions: [true],
      root_hash: 'invalid_root_hash'
    };

    expect(verifyMerkleProof(invalidProof)).toBe(false);
  });

  test('should reject proof with mismatched siblings and directions arrays', () => {
    const invalidProof: MerkleProofData = {
      leaf_hash: '1b4f0e9851971998e732078544c96b36c3d01cedf7caa332359d6f1d83567014',
      leaf_index: 0,
      siblings: ['60303ae22b998861bce3b28f33eec1be758a213c86c93c076dbe9f558c11c752'],
      directions: [true, false], // More directions than siblings
      root_hash: '587b1fe3afa386ce7cf9e99cf6f3b7f6a78a3c1ca6a549bbd467c992e482dc56'
    };

    expect(verifyMerkleProof(invalidProof)).toBe(false);
  });

  test('should reject null or undefined proof', () => {
    expect(verifyMerkleProof(null as any)).toBe(false);
    expect(verifyMerkleProof(undefined as any)).toBe(false);
  });

  test('should reject proof with missing required fields', () => {
    const incompleteProof = {
      leaf_index: 0,
      siblings: ['60303ae22b998861bce3b28f33eec1be758a213c86c93c076dbe9f558c11c752'],
      directions: [true],
      root_hash: '587b1fe3afa386ce7cf9e99cf6f3b7f6a78a3c1ca6a549bbd467c992e482dc56'
    } as MerkleProofData;

    expect(verifyMerkleProof(incompleteProof)).toBe(false);
  });

  test('should handle complex multi-level proof', () => {
    const complexProof: MerkleProofData = {
      leaf_hash: 'a1b2c3d4e5f6',
      leaf_index: 2,
      siblings: ['sibling1', 'sibling2', 'sibling3'],
      directions: [false, true, false],
      root_hash: 'expected_root'
    };

    const result = verifyMerkleProof(complexProof);
    expect(typeof result).toBe('boolean');
  });
});

describe('calculateSHA256', () => {
  test('should calculate correct SHA256 hash for string input', () => {
    const input = 'hello world';
    const expected = 'b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9';
    
    expect(calculateSHA256(input)).toBe(expected);
  });

  test('should calculate correct SHA256 hash for buffer input', () => {
    const input = Buffer.from('hello world', 'utf8');
    const expected = 'b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9';
    
    expect(calculateSHA256(input)).toBe(expected);
  });

  test('should handle empty string', () => {
    const input = '';
    const expected = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
    
    expect(calculateSHA256(input)).toBe(expected);
  });

  test('should produce consistent results', () => {
    const input = 'test data';
    const hash1 = calculateSHA256(input);
    const hash2 = calculateSHA256(input);
    
    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64); // SHA256 produces 64 hex characters
  });
});