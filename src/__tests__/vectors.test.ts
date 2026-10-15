import { readFileSync } from 'fs';
import { join } from 'path';
import { calculateSHA256, computeLeafHash, normalizeHash, verifyMerkleProof } from '../merkle';
import { MerkleProofData, Stamp } from '../types';

/**
 * Cross-SDK test vectors shared by basestamp-ts, basestamp-python and basestamp-go
 * (testdata/vectors.json). A vector is valid iff
 *   proof.leaf_hash == SHA256(utf8(nonce + hash))
 *   AND the proof's siblings reconstruct proof.root_hash (sorted-pair SHA256)
 *   AND proof.root_hash == expected_root (the value anchored on-chain).
 */
interface Vector {
  name: string;
  description?: string;
  hash: string;
  nonce: string;
  proof: MerkleProofData;
  expected_root: string;
  valid: boolean;
  stamp_id?: string;
  tx_id?: string;
  chain_id?: number;
}

const vectors: Vector[] = JSON.parse(
  readFileSync(join(__dirname, '..', '..', 'testdata', 'vectors.json'), 'utf8')
);

function verifyVector(v: Vector): boolean {
  let leafOk: boolean;
  try {
    leafOk = computeLeafHash(v.hash, v.nonce) === normalizeHash(v.proof.leaf_hash);
  } catch {
    leafOk = false;
  }
  const rootOk = normalizeHash(v.proof.root_hash) !== null &&
    normalizeHash(v.proof.root_hash) === normalizeHash(v.expected_root);
  return leafOk && verifyMerkleProof(v.proof) && rootOk;
}

function verifyViaStamp(v: Vector): boolean {
  const stamp = new Stamp(
    {
      stamp_id: v.stamp_id || 'vector',
      hash: v.hash,
      original_hash: v.hash,
      nonce: v.nonce,
      timestamp: '',
      status: 'confirmed',
      merkle_root: v.expected_root,
      merkle_proof: v.proof,
    },
    verifyMerkleProof,
    calculateSHA256
  );
  try {
    return stamp.verify(v.hash);
  } catch {
    return false;
  }
}

describe('shared test vectors (testdata/vectors.json)', () => {
  test('file contains real mainnet vectors and negative cases', () => {
    expect(vectors.length).toBeGreaterThan(0);
    expect(vectors.some(v => v.valid && v.tx_id && v.chain_id === 8453)).toBe(true);
    expect(vectors.some(v => !v.valid)).toBe(true);
    expect(new Set(vectors.map(v => v.name)).size).toBe(vectors.length);
  });

  test.each(vectors.map(v => [v.name, v] as const))('%s', (_name, v) => {
    expect(verifyVector(v)).toBe(v.valid);
    expect(verifyViaStamp(v)).toBe(v.valid);
  });
});
