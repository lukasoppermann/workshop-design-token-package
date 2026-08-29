import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { checkPairings, formatFailure } from '../scripts/contrast.mjs';

const rootDir = path.resolve(import.meta.dirname, '..');
const resolved = JSON.parse(
  fs.readFileSync(path.join(rootDir, 'dist', 'tokens', 'resolved.json'), 'utf8')
);
const pairings = JSON.parse(
  fs.readFileSync(path.join(rootDir, 'tokens', 'contrast-pairings.json'), 'utf8')
);

describe('semantic foreground/background contrast', () => {
  const results = checkPairings(resolved, pairings);

  it('has at least one pairing to check', () => {
    expect(results.length).toBeGreaterThan(0);
  });

  for (const result of results) {
    it(`"${result.fg}" on "${result.bg}" meets ${result.minRatio}:1 in ${result.theme} theme`, () => {
      expect(result.pass, formatFailure(result)).toBe(true);
    });
  }
});
