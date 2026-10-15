import { SDK_VERSION, userAgent } from '../version';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pkg = require('../../package.json');

describe('version', () => {
  it('matches package.json', () => {
    expect(SDK_VERSION).toBe(pkg.version);
  });
  it('builds a distinctive User-Agent', () => {
    expect(userAgent()).toMatch(/^basestamp-ts\/\d+\.\d+\.\d+/);
  });
});
