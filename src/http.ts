import nodeFetch from 'node-fetch';

export interface FetchResponseLike {
  ok: boolean;
  status: number;
  statusText: string;
  json(): Promise<unknown>;
}

export type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body?: string; signal?: AbortSignal }
) => Promise<FetchResponseLike>;

/**
 * Returns the runtime's native fetch (Node >= 18, browsers, Deno, Bun) when available, otherwise
 * node-fetch. node-fetch 2.6.8+/2.7.0 on Node >= 18 intermittently fails successful responses with
 * "Invalid response body ...: Premature close"; for POST /stamp that loses the stamp id of a stamp the
 * server already accepted, so native fetch is preferred.
 */
export function defaultFetch(): FetchLike {
  const native = (globalThis as { fetch?: unknown }).fetch;
  if (typeof native === 'function') {
    return native.bind(globalThis) as FetchLike;
  }
  return nodeFetch as unknown as FetchLike;
}

/** Formats a transport error including its cause (native fetch reports "fetch failed" + cause). */
export function describeError(error: unknown): string {
  const e = error as { message?: string; cause?: { message?: string; code?: string } };
  const base = e && e.message ? e.message : String(error);
  const cause = e && e.cause ? ` (${e.cause.code || e.cause.message || e.cause})` : '';
  return base + cause;
}
