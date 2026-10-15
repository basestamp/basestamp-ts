import { createHash } from 'crypto';
import { MerkleProofData } from './types';

/** Upper bound on proof depth (a tree of 2^64 leaves); anything deeper is rejected as malformed. */
export const MAX_PROOF_DEPTH = 64;

const HEX32 = /^[0-9a-f]{64}$/;

/**
 * Normalizes a 32-byte hex hash: trims, strips an optional 0x prefix and lowercases.
 * Returns null if the value is not exactly 64 hex characters.
 */
export function normalizeHash(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  let h = value.trim().toLowerCase();
  if (h.startsWith('0x')) {
    h = h.slice(2);
  }
  return HEX32.test(h) ? h : null;
}

/** Returns true if value is a 32-byte hex hash (optional 0x prefix, any case). */
export function isValidHash(value: unknown): boolean {
  return normalizeHash(value) !== null;
}

function sha256(data: Buffer): Buffer {
  return createHash('sha256').update(data).digest();
}

/**
 * Leaf construction used by the Basestamp server:
 *   leaf_hash = SHA256(utf8(nonce + hash))
 * i.e. the nonce string (a decimal string, e.g. "1792084020825457904") immediately followed by the
 * lowercase hex hash string, hashed as UTF-8 text (not hex-decoded bytes). Confirmed against real
 * Base mainnet proofs (see testdata/vectors.json). Note: the OpenAPI description "SHA256(file_hash + nonce)"
 * has the order wrong.
 */
export function computeLeafHash(hash: string, nonce: string): string {
  const h = normalizeHash(hash);
  if (h === null) {
    throw new Error(`invalid hash '${hash}': expected 64 hex characters`);
  }
  if (typeof nonce !== 'string') {
    throw new Error('nonce must be a string');
  }
  return sha256(Buffer.from(nonce + h, 'utf8')).toString('hex');
}

/** Sorted-pair node hash: SHA256(min(a, b) || max(a, b)) over the raw 32-byte values. */
function hashSortedPair(a: Buffer, b: Buffer): Buffer {
  return Buffer.compare(a, b) <= 0 ? sha256(Buffer.concat([a, b])) : sha256(Buffer.concat([b, a]));
}

/**
 * Recomputes the merkle root implied by a proof.
 *
 * Algorithm (matches the server, confirmed on Base mainnet): nodes are 32-byte SHA256 digests and each
 * parent is SHA256(min(a, b) || max(a, b)) of its two children compared as raw bytes ("sorted pairs");
 * an odd node at the end of a level is paired with itself. Because pairs are sorted, `directions` are
 * not part of the commitment: the server reports them (true = sibling on the right, mirroring the bits
 * of leaf_index) but they do not affect the root. They are still validated for shape.
 *
 * Throws on any malformed input (non-hex / wrong-length hashes, mismatched arrays, excessive depth).
 */
export function computeMerkleRoot(proof: MerkleProofData): string {
  if (!proof || typeof proof !== 'object') {
    throw new Error('proof must be an object');
  }
  const leaf = normalizeHash(proof.leaf_hash);
  if (leaf === null) {
    throw new Error('leaf_hash must be 64 hex characters');
  }
  const { siblings, directions } = proof;
  if (!Array.isArray(siblings) || !Array.isArray(directions)) {
    throw new Error('siblings and directions must be arrays');
  }
  if (siblings.length !== directions.length) {
    throw new Error('siblings and directions must have the same length');
  }
  if (siblings.length > MAX_PROOF_DEPTH) {
    throw new Error(`proof depth ${siblings.length} exceeds maximum ${MAX_PROOF_DEPTH}`);
  }

  let current = Buffer.from(leaf, 'hex');
  for (let i = 0; i < siblings.length; i++) {
    const sib = normalizeHash(siblings[i]);
    if (sib === null) {
      throw new Error(`siblings[${i}] must be 64 hex characters`);
    }
    if (typeof directions[i] !== 'boolean') {
      throw new Error(`directions[${i}] must be a boolean`);
    }
    current = hashSortedPair(current, Buffer.from(sib, 'hex'));
  }
  return current.toString('hex');
}

/**
 * Verifies that the proof's leaf_hash, siblings and directions reconstruct root_hash.
 * Never throws: malformed proofs return false. This only checks internal consistency of the proof;
 * use Stamp.verify() to bind it to your hash, and verifyRootOnChain() to bind the root to Base.
 */
export function verifyMerkleProof(proof: MerkleProofData): boolean {
  try {
    const root = normalizeHash(proof?.root_hash);
    if (root === null) {
      return false;
    }
    return computeMerkleRoot(proof) === root;
  } catch {
    return false;
  }
}

export function calculateSHA256(data: Buffer | string): string {
  const buffer = typeof data === 'string' ? Buffer.from(data, 'utf8') : data;
  return createHash('sha256').update(buffer).digest('hex');
}
