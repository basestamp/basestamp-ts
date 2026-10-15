// Keep in sync with package.json "version" (checked by a unit test).
export const SDK_VERSION = '0.1.0';

/**
 * User-Agent sent by BasestampClient outside browsers, e.g. "basestamp-ts/0.1.0 (node v20.11.0)".
 * Lets the service count usage per SDK/version. No other telemetry is collected.
 */
export function userAgent(): string {
  const proc = (globalThis as { process?: { version?: string } }).process;
  const runtime = proc && proc.version ? `node ${proc.version}` : 'js';
  return `basestamp-ts/${SDK_VERSION} (${runtime})`;
}

export function isBrowser(): boolean {
  return typeof (globalThis as { window?: unknown }).window !== 'undefined' &&
    typeof (globalThis as { document?: unknown }).document !== 'undefined';
}
