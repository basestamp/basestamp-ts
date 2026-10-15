import { readFileSync } from 'fs';
import { join } from 'path';
import { verifyRootOnChain, STAMPED_EVENT_TOPIC, OnChainVerifyOptions } from '../onchain';
import { FetchLike } from '../http';
import { calculateSHA256, verifyMerkleProof } from '../merkle';
import { NETWORKS } from '../networks';
import { BasestampError, Stamp } from '../types';

// Real receipt of the basestamp-ts mainnet E2E stamp (tx 0xb655fb0d...).
const RECEIPT = JSON.parse(
  readFileSync(join(__dirname, '..', '..', 'testdata', 'receipt-mainnet-b655fb0d.json'), 'utf8')
);
const ROOT = 'e20a3da731c0d8f1654f32131d74e93c8221982462772fa780b76657608f62b5';
const TX = '0xb655fb0d467d763667fcf61dbcea71d3a7c8239c988fb8d859dd34260bd5eee1';
const SIGNER = NETWORKS.mainnet.signerAddress;
const OWNER_WORD = '0x000000000000000000000000' + SIGNER.slice(2).toLowerCase();

type Handlers = Record<string, (params: unknown[]) => unknown>;

function rpcFetch(overrides: Handlers = {}): jest.MockedFunction<FetchLike> {
  const handlers: Handlers = {
    eth_chainId: () => '0x2105',
    eth_getTransactionReceipt: () => RECEIPT,
    eth_getBlockByNumber: () => ({ hash: RECEIPT.blockHash }),
    eth_call: () => OWNER_WORD,
    eth_blockNumber: () => '0x' + (parseInt(RECEIPT.blockNumber, 16) + 9).toString(16),
    ...overrides,
  };
  return jest.fn(async (_url, init) => {
    const req = JSON.parse(init.body as string);
    const handler = handlers[req.method];
    const body = handler
      ? { jsonrpc: '2.0', id: req.id, result: handler(req.params) }
      : { jsonrpc: '2.0', id: req.id, error: { code: -32601, message: 'method not found' } };
    return { ok: true, status: 200, statusText: 'OK', json: async () => body };
  });
}

function clone<T>(x: T): T {
  return JSON.parse(JSON.stringify(x));
}

async function verify(overrides: Handlers = {}, opts: OnChainVerifyOptions = {}, root = ROOT, tx = TX) {
  return verifyRootOnChain(root, tx, { fetch: rpcFetch(overrides), ...opts });
}

describe('verifyRootOnChain', () => {
  test('accepts the real mainnet stamp receipt', async () => {
    const r = await verify({}, { expectedBlockHash: RECEIPT.blockHash });
    expect(r).toMatchObject({
      verified: true,
      root: ROOT,
      txHash: TX,
      blockNumber: 52647338,
      timestamp: 1792084023,
      stamper: SIGNER.toLowerCase(),
      confirmations: 10,
      chainId: 8453,
    });
  });

  test('accepts 0x-prefixed / uppercase root', async () => {
    await expect(verify({}, {}, '0x' + ROOT.toUpperCase())).resolves.toMatchObject({ root: ROOT });
  });

  test('sends requests to the mainnet RPC by default', async () => {
    const f = rpcFetch();
    await verifyRootOnChain(ROOT, TX, { fetch: f });
    expect(f.mock.calls[0][0]).toBe('https://mainnet.base.org');
  });

  const reject = (name: string, run: () => Promise<unknown>, msg: RegExp) =>
    test(`rejects: ${name}`, async () => {
      await expect(run()).rejects.toThrow(BasestampError);
      await expect(run()).rejects.toThrow(msg);
    });

  reject('tampered root', () => verify({}, {}, ROOT.replace(/^e/, 'f')), /no Stamped event/);
  reject('wrong chain id', () => verify({ eth_chainId: () => '0x14a34' }), /chain id/);
  reject('tx not found', () => verify({ eth_getTransactionReceipt: () => null }), /not found/);
  reject('reverted tx', () => verify({ eth_getTransactionReceipt: () => ({ ...RECEIPT, status: '0x0' }) }), /reverted/);
  reject('tx to another contract', () =>
    verify({ eth_getTransactionReceipt: () => ({ ...RECEIPT, to: '0x' + '1'.repeat(40) }) }), /not the Basestamp contract/);
  reject('log emitted by another address', () => {
    const r = clone(RECEIPT);
    r.logs[0].address = '0x' + '2'.repeat(40);
    return verify({ eth_getTransactionReceipt: () => r });
  }, /no Stamped event/);
  reject('wrong event topic', () => {
    const r = clone(RECEIPT);
    r.logs[0].topics[0] = '0x' + '3'.repeat(64);
    return verify({ eth_getTransactionReceipt: () => r });
  }, /no Stamped event/);
  reject('removed (reorged) log', () => {
    const r = clone(RECEIPT);
    r.logs[0].removed = true;
    return verify({ eth_getTransactionReceipt: () => r });
  }, /no Stamped event/);
  reject('stamped by a different account', () => {
    const r = clone(RECEIPT);
    r.logs[0].topics[2] = '0x' + '0'.repeat(24) + '4'.repeat(40);
    return verify({ eth_getTransactionReceipt: () => r });
  }, /expected signer/);
  reject('contract owner differs from signer', () => verify({ eth_call: () => '0x' + '0'.repeat(24) + '5'.repeat(40) }), /owner/);
  reject('non-canonical block', () => verify({ eth_getBlockByNumber: () => ({ hash: '0x' + '6'.repeat(64) }) }), /not canonical/);
  reject('block hash differs from API block_hash', () => verify({}, { expectedBlockHash: '0x' + '7'.repeat(64) }), /block hash mismatch/);
  reject('not enough confirmations', () => verify({}, { minConfirmations: 11 }), /confirmations/);
  reject('RPC error', () => verify({ eth_getTransactionReceipt: undefined as never }), /method not found/);
  reject('invalid root', () => verify({}, {}, 'zz'), /invalid merkle root/);
  reject('invalid tx hash', () => verify({}, {}, ROOT, '0x1234'), /invalid transaction hash/);
  reject('plain http RPC', () => verify({}, { rpcURL: 'http://evil.example.com' }), /https/);

  test('signer check can be disabled explicitly', async () => {
    const r = clone(RECEIPT);
    r.logs[0].topics[2] = '0x' + '0'.repeat(24) + '4'.repeat(40);
    await expect(verify({ eth_getTransactionReceipt: () => r }, { signerAddress: null })).resolves.toMatchObject({ verified: true });
  });

  test('event topic constant matches keccak256("Stamped(bytes32,uint256,uint256,address)") from the deployed contract', () => {
    expect(RECEIPT.logs[0].topics[0]).toBe(STAMPED_EVENT_TOPIC);
  });
});

describe('Stamp.verifyOnChain', () => {
  const vectors = JSON.parse(readFileSync(join(__dirname, '..', '..', 'testdata', 'vectors.json'), 'utf8'));
  const v = vectors.find((x: { name: string }) => x.name === 'mainnet-3-leaf-batch-index-0');

  function stamp(extra: Record<string, unknown> = {}) {
    return new Stamp({
      stamp_id: v.stamp_id, hash: v.hash, original_hash: v.hash, nonce: v.nonce, timestamp: '',
      status: 'confirmed', tx_id: v.tx_id, block_hash: RECEIPT.blockHash, merkle_root: v.expected_root,
      merkle_proof: v.proof, ...extra,
    }, verifyMerkleProof, calculateSHA256);
  }

  test('verifyFull binds hash -> leaf -> root -> chain', async () => {
    await expect(stamp().verifyFull(v.hash, { fetch: rpcFetch() })).resolves.toMatchObject({ verified: true, root: ROOT });
  });

  test('fails when the API block_hash does not match the receipt', async () => {
    await expect(stamp({ block_hash: '0x' + '8'.repeat(64) }).verifyOnChain({ fetch: rpcFetch() })).rejects.toThrow(/block hash mismatch/);
  });

  test('fails without tx_id', async () => {
    await expect(stamp({ tx_id: undefined }).verifyOnChain({ fetch: rpcFetch() })).rejects.toThrow(/no tx_id/);
  });

  test('fails when merkle_root disagrees with the proof root', async () => {
    await expect(stamp({ merkle_root: '9'.repeat(64) }).verifyOnChain({ fetch: rpcFetch() })).rejects.toThrow(/Merkle root mismatch/);
  });
});
