/**
 * End-to-end test against Base MAINNET. Each run stamps a real hash and costs real ETH (paid by the
 * Basestamp signer), so it is skipped unless BASESTAMP_E2E=1.
 *
 *   BASESTAMP_E2E=1 yarn test src/__tests__/e2e.test.ts
 *
 * Optional env:
 *   BASESTAMP_E2E_URL            API base URL (default: mainnet)
 *   BASESTAMP_E2E_OUT            JSON file the stamp ids, raw API responses and on-chain result are written to
 *   BASESTAMP_E2E_STAMP_ID       resume: verify an existing stamp instead of submitting a new one
 *   BASESTAMP_E2E_HASH           resume: the hash submitted for BASESTAMP_E2E_STAMP_ID
 *   BASESTAMP_E2E_COMPANIONS     extra random hashes submitted concurrently (same batch => one tx) so the
 *                                proof has siblings; default 2, set 0 to disable
 */
import { randomBytes } from 'crypto';
import { mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { BasestampClient } from '../client';
import { computeLeafHash, verifyMerkleProof } from '../merkle';
import { MAINNET_BASE_URL } from '../networks';
import { StampData } from '../types';

const enabled = process.env.BASESTAMP_E2E === '1';
const d = enabled ? describe : describe.skip;

const POLL_MS = 12_000;
const MAX_WAIT_MS = 10 * 60_000;

d('E2E: Base mainnet', () => {
  jest.setTimeout(MAX_WAIT_MS + 3 * 60_000);

  test('stamp, wait for confirmation, verify merkle proof locally and on-chain', async () => {
    const baseURL = process.env.BASESTAMP_E2E_URL || MAINNET_BASE_URL;
    const out = process.env.BASESTAMP_E2E_OUT || join(tmpdir(), `basestamp-ts-e2e-${Date.now()}.json`);
    mkdirSync(dirname(out), { recursive: true });
    const client = new BasestampClient({ baseURL, timeout: 30_000 });
    const record: Record<string, unknown> = { baseURL, started_at: new Date().toISOString() };
    const save = () => writeFileSync(out, JSON.stringify(record, null, 2) + '\n');

    let stampId = process.env.BASESTAMP_E2E_STAMP_ID;
    let hash = process.env.BASESTAMP_E2E_HASH;
    if (stampId && hash) {
      record.resumed = true;
    } else {
      hash = randomBytes(32).toString('hex');
      const companions = Array.from(
        { length: Number(process.env.BASESTAMP_E2E_COMPANIONS ?? 2) },
        () => randomBytes(32).toString('hex')
      );
      // Submit concurrently, once. Never retried: every batch costs real ETH.
      const results = await Promise.allSettled([hash, ...companions].map(h => client.submitSHA256(h)));
      record.hash = hash;
      record.companions = companions
        .map((h, i) => ({ hash: h, result: results[i + 1] }))
        .filter(c => c.result.status === 'fulfilled')
        .map(c => ({ hash: c.hash, stamp_id: (c.result as PromiseFulfilledResult<string>).value }));
      if (results[0].status === 'rejected') {
        save();
        throw results[0].reason;
      }
      stampId = results[0].value;
    }
    record.hash = hash;
    record.stamp_id = stampId;
    save();
    console.log(`E2E ${record.resumed ? "resumed" : "submitted"} hash=${hash} stamp_id=${stampId} (record: ${out})`);

    // Poll until confirmed on-chain with a merkle proof.
    const deadline = Date.now() + MAX_WAIT_MS;
    let raw: StampData | undefined;
    for (;;) {
      try {
        raw = await client.getStampLegacy(stampId!);
        if (raw.status === 'failed') {
          throw new Error(`stamp failed: ${raw.message}`);
        }
        if (raw.status === 'confirmed' && raw.tx_id && raw.merkle_proof) {
          break;
        }
        console.log(`E2E status=${raw.status} ...`);
      } catch (error) {
        if (String(error).includes('stamp failed')) throw error;
        console.log(`E2E poll error (will retry): ${error}`);
      }
      if (Date.now() + POLL_MS > deadline) {
        throw new Error(`stamp ${stampId} not confirmed within ${MAX_WAIT_MS / 1000}s (last status ${raw?.status})`);
      }
      await new Promise(resolve => setTimeout(resolve, POLL_MS));
    }
    record.response = raw;
    save();
    console.log(`E2E confirmed tx=${raw.tx_id} https://basescan.org/tx/${raw.tx_id}`);

    // Companion proofs are kept for test vectors (same root expected).
    if (Array.isArray(record.companions)) {
      for (const c of record.companions as { stamp_id: string; response?: StampData }[]) {
        try {
          c.response = await client.getStampLegacy(c.stamp_id);
        } catch (error) {
          console.log(`E2E companion fetch failed: ${error}`);
        }
      }
      save();
    }

    // Local verification.
    const proof = raw.merkle_proof!;
    expect(computeLeafHash(raw.hash, raw.nonce)).toBe(proof.leaf_hash.toLowerCase());
    expect(verifyMerkleProof(proof)).toBe(true);
    const stamp = await client.getStamp(stampId!);
    expect(stamp.verify(hash!)).toBe(true);

    // On-chain verification against the contract.
    const onchain = await stamp.verifyOnChain({ network: 'mainnet' });
    expect(onchain.verified).toBe(true);
    expect(onchain.root).toBe(proof.root_hash.toLowerCase());
    record.onchain = onchain;
    record.finished_at = new Date().toISOString();
    save();
    console.log(`E2E OK stamp_id=${stampId} root=${onchain.root} tx=${onchain.txHash} block=${onchain.blockNumber} https://basescan.org/tx/${onchain.txHash}`);
  });
});
