import { verifyMerkleProof, calculateSHA256, computeMerkleRoot, computeLeafHash, normalizeHash, isValidHash, MAX_PROOF_DEPTH } from '../merkle';
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

  test('rejects non-hex / wrong-length hashes instead of silently decoding them', () => {
    const base: MerkleProofData = {
      leaf_hash: '1b4f0e9851971998e732078544c96b36c3d01cedf7caa332359d6f1d83567014',
      leaf_index: 0,
      siblings: ['60303ae22b998861bce3b28f33eec1be758a213c86c93c076dbe9f558c11c752'],
      directions: [true],
      root_hash: '587b1fe3afa386ce7cf9e99cf6f3b7f6a78a3c1ca6a549bbd467c992e482dc56'
    };
    expect(verifyMerkleProof(base)).toBe(true);
    expect(verifyMerkleProof({ ...base, leaf_hash: 'a1b2c3d4e5f6' })).toBe(false);
    expect(verifyMerkleProof({ ...base, siblings: ['sibling1'] })).toBe(false);
    expect(verifyMerkleProof({ ...base, siblings: [base.siblings[0] + 'zz'] })).toBe(false);
    expect(verifyMerkleProof({ ...base, directions: ['yes' as unknown as boolean] })).toBe(false);
    expect(verifyMerkleProof({ ...base, siblings: 'x' as unknown as string[] })).toBe(false);
  });

  test('accepts uppercase / 0x-prefixed hex', () => {
    expect(verifyMerkleProof({
      leaf_hash: '0x1B4F0E9851971998E732078544C96B36C3D01CEDF7CAA332359D6F1D83567014',
      leaf_index: 0,
      siblings: ['60303AE22B998861BCE3B28F33EEC1BE758A213C86C93C076DBE9F558C11C752'],
      directions: [true],
      root_hash: '0x587B1FE3AFA386CE7CF9E99CF6F3B7F6A78A3C1CA6A549BBD467C992E482DC56'
    })).toBe(true);
  });

  test('uses sorted-pair hashing: sibling order within a pair does not depend on directions', () => {
    const a = 'a'.repeat(64);
    const b = 'b'.repeat(64);
    const root = calculateSHA256(Buffer.from(a + b, 'hex'));
    expect(computeMerkleRoot({ leaf_hash: a, leaf_index: 0, siblings: [b], directions: [true], root_hash: '' })).toBe(root);
    expect(computeMerkleRoot({ leaf_hash: a, leaf_index: 0, siblings: [b], directions: [false], root_hash: '' })).toBe(root);
    expect(computeMerkleRoot({ leaf_hash: b, leaf_index: 1, siblings: [a], directions: [false], root_hash: '' })).toBe(root);
  });

  test('single-leaf tree: root equals leaf', () => {
    const leaf = 'c'.repeat(64);
    expect(verifyMerkleProof({ leaf_hash: leaf, leaf_index: 0, siblings: [], directions: [], root_hash: leaf })).toBe(true);
  });

  test('rejects proofs deeper than MAX_PROOF_DEPTH', () => {
    const n = MAX_PROOF_DEPTH + 1;
    expect(verifyMerkleProof({
      leaf_hash: 'c'.repeat(64), leaf_index: 0,
      siblings: Array(n).fill('d'.repeat(64)), directions: Array(n).fill(true), root_hash: 'e'.repeat(64)
    })).toBe(false);
  });
});

describe('computeLeafHash / normalizeHash', () => {
  test('leaf = SHA256(utf8(nonce + hash)) (real mainnet stamp)', () => {
    expect(computeLeafHash('9b5ab67b282d6372b7587d91d9a1a107dc0517f308bf4c1c09fcb98e373837bf', '1792084020825457904'))
      .toBe('83e66150c69969917c93f619440670ef7ba109a8cbf9a3564dce55af3a79ab90');
  });

  test('rejects invalid hash input', () => {
    expect(() => computeLeafHash('nothex', '1')).toThrow(/invalid hash/);
  });

  test('normalizeHash', () => {
    expect(normalizeHash('0xAB' + 'c'.repeat(62))).toBe('ab' + 'c'.repeat(62));
    expect(normalizeHash('c'.repeat(63))).toBeNull();
    expect(normalizeHash(42)).toBeNull();
    expect(isValidHash('c'.repeat(64))).toBe(true);
    expect(isValidHash('g'.repeat(64))).toBe(false);
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