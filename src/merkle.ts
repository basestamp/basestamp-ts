import { createHash } from 'crypto';
import { MerkleProof } from './types';

function hashPair(left: string, right: string): string {
  const leftBytes = Buffer.from(left, 'hex');
  const rightBytes = Buffer.from(right, 'hex');
  
  let combined: Buffer;
  if (leftBytes.length === rightBytes.length) {
    // Use lexicographic ordering for deterministic results
    if (left < right) {
      combined = Buffer.concat([leftBytes, rightBytes]);
    } else {
      combined = Buffer.concat([rightBytes, leftBytes]);
    }
  } else {
    // This shouldn't happen in our use case, but handle it securely
    combined = Buffer.concat([leftBytes, rightBytes]);
  }
  
  return createHash('sha256').update(combined).digest('hex');
}

export function verifyMerkleProof(proof: MerkleProof): boolean {
  if (!proof) {
    return false;
  }

  if (!proof.leaf_hash || !proof.root_hash) {
    return false;
  }

  if (proof.siblings.length !== proof.directions.length) {
    return false;
  }

  let currentHash = proof.leaf_hash;
  
  for (let i = 0; i < proof.siblings.length; i++) {
    const sibling = proof.siblings[i];
    const direction = proof.directions[i];
    
    if (direction) {
      // Sibling is on the right
      currentHash = hashPair(currentHash, sibling);
    } else {
      // Sibling is on the left
      currentHash = hashPair(sibling, currentHash);
    }
  }
  
  return currentHash === proof.root_hash;
}

export function calculateSHA256(data: Buffer | string): string {
  const buffer = typeof data === 'string' ? Buffer.from(data, 'utf8') : data;
  return createHash('sha256').update(buffer).digest('hex');
}