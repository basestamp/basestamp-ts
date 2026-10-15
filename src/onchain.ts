import { BasestampError } from './types';
import { normalizeHash } from './merkle';
import { NETWORKS, NetworkName } from './networks';
import { FetchLike, defaultFetch, describeError } from './http';

/**
 * Basestamp contract ABI (verified against the deployed bytecode on Base mainnet):
 *   function stamp(bytes32 root)                      selector 0xdd89581f (owner only)
 *   function owner() view returns (address)           selector 0x8da5cb5b
 *   event Stamped(bytes32 indexed root, uint256 timestamp, uint256 blockNumber, address indexed stamper)
 *   error NotOwner()
 * The contract keeps no storage of roots, so a root is proven on-chain by the Stamped event log.
 */
export const STAMPED_EVENT_TOPIC = '0x88ad9da3b29de3590ad9ee465751a6e2a86d8174c41c6a8fabe9360b13deb600';
export const STAMP_FUNCTION_SELECTOR = '0xdd89581f';
export const OWNER_FUNCTION_SELECTOR = '0x8da5cb5b';

export interface OnChainVerifyOptions {
  /** Network preset to take rpcURL/chainId/contract/signer defaults from. Defaults to 'mainnet'. */
  network?: NetworkName;
  rpcURL?: string;
  chainId?: number;
  contractAddress?: string;
  /** Expected stamper (contract owner). Defaults to the network's signer; pass null to skip the check. */
  signerAddress?: string | null;
  /** Minimum confirmations required (default 1 = included in a block). */
  minConfirmations?: number;
  /** If set, the receipt's block hash must equal this (e.g. the API's block_hash). */
  expectedBlockHash?: string;
  /** Per-RPC-request timeout in ms (default 30000). */
  timeout?: number;
  /** Custom fetch implementation (default: native fetch, falling back to node-fetch). */
  fetch?: FetchLike;
}

export interface OnChainVerification {
  verified: true;
  root: string;
  txHash: string;
  blockNumber: number;
  blockHash: string;
  /** block.timestamp recorded in the Stamped event (unix seconds). */
  timestamp: number;
  stamper: string;
  confirmations: number;
  chainId: number;
  contractAddress: string;
}

interface RpcLog {
  address: string;
  topics: string[];
  data: string;
  removed?: boolean;
}

interface RpcReceipt {
  status: string;
  to: string | null;
  blockNumber: string;
  blockHash: string;
  transactionHash: string;
  logs: RpcLog[];
}

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const TX_HASH = /^0x[0-9a-fA-F]{64}$/;

function eqAddr(a: string | null | undefined, b: string): boolean {
  return typeof a === 'string' && a.toLowerCase() === b.toLowerCase();
}

function topicToAddress(topic: string): string {
  return '0x' + topic.slice(-40).toLowerCase();
}

export class JsonRpcClient {
  private id = 0;

  private readonly fetchImpl: FetchLike;

  constructor(private readonly url: string, private readonly timeout = 30000, fetchImpl?: FetchLike) {
    this.fetchImpl = fetchImpl || defaultFetch();
    if (!/^https:\/\//i.test(url) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(url)) {
      throw new BasestampError(`RPC URL must use https: ${url}`);
    }
  }

  async call<T>(method: string, params: unknown[]): Promise<T> {
    const maxAttempts = 4;
    let lastError: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await this.callOnce<T>(method, params);
      } catch (error) {
        lastError = error;
        // Retry only rate limiting / transient transport errors, with backoff.
        const msg = String((error as Error)?.message || error);
        const transient = /429|rate|limit|timeout|ECONNRESET|ETIMEDOUT|EAI_AGAIN|502|503|504/i.test(msg);
        if (!transient || attempt === maxAttempts) {
          break;
        }
        await new Promise(resolve => setTimeout(resolve, 500 * 2 ** attempt));
      }
    }
    throw lastError instanceof BasestampError ? lastError : new BasestampError(`RPC ${method} failed: ${lastError}`);
  }

  private async callOnce<T>(method: string, params: unknown[]): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);
    try {
      const res = await this.fetchImpl(this.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: ++this.id, method, params }),
        signal: controller.signal,
      });
      if (!res.ok) {
        throw new BasestampError(`RPC ${method} HTTP ${res.status} ${res.statusText}`);
      }
      const body = (await res.json()) as { result?: T; error?: { code: number; message: string } };
      if (body.error) {
        throw new BasestampError(`RPC ${method} error ${body.error.code}: ${body.error.message}`);
      }
      return body.result as T;
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        throw new BasestampError(`RPC ${method} timeout`);
      }
      if (error instanceof BasestampError) {
        throw error;
      }
      throw new BasestampError(`RPC ${method} transport error: ${describeError(error)}`);
    } finally {
      clearTimeout(timer);
    }
  }
}

/**
 * Proves that `root` was stamped by the Basestamp contract in transaction `txHash`:
 *  - the RPC is on the expected chain (eth_chainId),
 *  - the transaction succeeded (receipt.status == 1) and was sent to the contract,
 *  - the receipt contains a Stamped(root, ..., stamper) log emitted by the contract,
 *  - the stamper equals the expected signer, which is the contract owner() (unless signerAddress is null),
 *  - the receipt's block is canonical (eth_getBlockByNumber hash == receipt.blockHash),
 *  - the block has at least minConfirmations confirmations (and matches expectedBlockHash, if given).
 * Throws BasestampError describing the first failed check; resolves with details on success.
 */
export async function verifyRootOnChain(
  root: string,
  txHash: string,
  options: OnChainVerifyOptions = {}
): Promise<OnChainVerification> {
  const net = NETWORKS[options.network ?? 'mainnet'];
  if (!net) {
    throw new BasestampError(`unknown network '${options.network}'`);
  }
  const rpcURL = options.rpcURL ?? net.rpcURL;
  const chainId = options.chainId ?? net.chainId;
  const contract = options.contractAddress ?? net.contractAddress;
  const signer: string | null = options.signerAddress === undefined ? net.signerAddress : options.signerAddress;
  const minConfirmations = options.minConfirmations ?? 1;

  const normalizedRoot = normalizeHash(root);
  if (normalizedRoot === null) {
    throw new BasestampError(`invalid merkle root '${root}'`);
  }
  if (typeof txHash !== 'string' || !TX_HASH.test(txHash)) {
    throw new BasestampError(`invalid transaction hash '${txHash}'`);
  }
  if (!ADDRESS.test(contract)) {
    throw new BasestampError(`invalid contract address '${contract}'`);
  }
  if (signer !== null && !ADDRESS.test(signer)) {
    throw new BasestampError(`invalid signer address '${signer}'`);
  }
  if (!Number.isInteger(minConfirmations) || minConfirmations < 1) {
    throw new BasestampError('minConfirmations must be an integer >= 1');
  }

  const rpc = new JsonRpcClient(rpcURL, options.timeout ?? 30000, options.fetch);

  const rpcChainId = parseInt(await rpc.call<string>('eth_chainId', []), 16);
  if (rpcChainId !== chainId) {
    throw new BasestampError(`RPC chain id ${rpcChainId} does not match expected ${chainId}`);
  }

  const receipt = await rpc.call<RpcReceipt | null>('eth_getTransactionReceipt', [txHash]);
  if (!receipt) {
    throw new BasestampError(`transaction ${txHash} not found or not yet mined`);
  }
  if (receipt.status !== '0x1') {
    throw new BasestampError(`transaction ${txHash} reverted (status ${receipt.status})`);
  }
  if (!eqAddr(receipt.to, contract)) {
    throw new BasestampError(`transaction ${txHash} was sent to ${receipt.to}, not the Basestamp contract ${contract}`);
  }
  if (options.expectedBlockHash !== undefined && !eqAddr(receipt.blockHash, options.expectedBlockHash)) {
    throw new BasestampError(`block hash mismatch: receipt ${receipt.blockHash}, expected ${options.expectedBlockHash}`);
  }

  const rootTopic = '0x' + normalizedRoot;
  const log = (receipt.logs || []).find(l =>
    !l.removed &&
    eqAddr(l.address, contract) &&
    Array.isArray(l.topics) &&
    l.topics.length === 3 &&
    l.topics[0].toLowerCase() === STAMPED_EVENT_TOPIC &&
    l.topics[1].toLowerCase() === rootTopic
  );
  if (!log) {
    throw new BasestampError(`no Stamped event for root ${rootTopic} in transaction ${txHash}`);
  }
  const stamper = topicToAddress(log.topics[2]);
  if (signer !== null && !eqAddr(stamper, signer)) {
    throw new BasestampError(`root was stamped by ${stamper}, expected signer ${signer}`);
  }

  const blockNumber = parseInt(receipt.blockNumber, 16);

  // The receipt's block must be the canonical block at that height (guards against reorged receipts).
  const block = await rpc.call<{ hash: string } | null>('eth_getBlockByNumber', [receipt.blockNumber, false]);
  if (!block || !eqAddr(block.hash, receipt.blockHash)) {
    throw new BasestampError(`block ${blockNumber} is not canonical (receipt ${receipt.blockHash}, chain ${block?.hash})`);
  }

  // The stamper must be the contract owner (only the owner can call stamp()). owner is an immutable in
  // the bytecode, so 'latest' is equivalent to the stamp block and works on non-archive RPC nodes.
  if (signer !== null) {
    const owner = await rpc.call<string>('eth_call', [{ to: contract, data: OWNER_FUNCTION_SELECTOR }, 'latest']);
    if (typeof owner !== 'string' || owner.length < 42 || !eqAddr(topicToAddress(owner), signer)) {
      throw new BasestampError(`contract owner ${owner} does not match expected signer ${signer}`);
    }
  }

  const head = parseInt(await rpc.call<string>('eth_blockNumber', []), 16);
  const confirmations = head - blockNumber + 1;
  if (confirmations < minConfirmations) {
    throw new BasestampError(`only ${confirmations} confirmations, need ${minConfirmations}`);
  }

  // data = abi.encode(uint256 timestamp, uint256 blockNumber)
  const data = (log.data || '').replace(/^0x/, '');
  const timestamp = data.length >= 64 ? parseInt(data.slice(0, 64), 16) : NaN;

  return {
    verified: true,
    root: normalizedRoot,
    txHash: receipt.transactionHash,
    blockNumber,
    blockHash: receipt.blockHash,
    timestamp,
    stamper,
    confirmations,
    chainId,
    contractAddress: contract,
  };
}
