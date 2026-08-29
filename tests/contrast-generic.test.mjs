import { describe, it, expect } from 'vitest';
import { contrastRatio, checkPairings, formatFailure } from '../scripts/contrast.mjs';

// These tests use synthetic tokens (not the real design system) to prove the
// checker is generic: it works for any token names/colors, and its failure
// output always names the foreground token, background token, theme,
// measured ratio, and required threshold.
describe('generic contrast checker', () => {
  it('computes known WCAG ratios correctly', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 0);
    expect(contrastRatio('#ffffff', '#ffffff')).toBeCloseTo(1, 5);
  });

  it('passes a pairing that meets its threshold', () => {
    const tokens = { light: { 'demo.fg': '#000000', 'demo.bg': '#ffffff' } };
    const [result] = checkPairings(tokens, [{ fg: 'demo.fg', bg: 'demo.bg', minRatio: 4.5 }]);
    expect(result.pass).toBe(true);
  });

  it('fails a pairing that does not meet its threshold and reports full detail', () => {
    const tokens = { light: { 'demo.fg': '#eeeeee', 'demo.bg': '#ffffff' } };
    const [result] = checkPairings(tokens, [{ fg: 'demo.fg', bg: 'demo.bg', minRatio: 4.5 }]);
    expect(result.pass).toBe(false);

    const message = formatFailure(result);
    expect(message).toContain('demo.fg');
    expect(message).toContain('demo.bg');
    expect(message).toContain('light');
    expect(message).toContain(result.ratio.toFixed(2));
    expect(message).toContain('4.5');
  });

  it('checks the same pairing across multiple themes independently', () => {
    const tokens = {
      light: { 'demo.fg': '#000000', 'demo.bg': '#ffffff' },
      dark: { 'demo.fg': '#eeeeee', 'demo.bg': '#ffffff' },
    };
    const results = checkPairings(tokens, [{ fg: 'demo.fg', bg: 'demo.bg', minRatio: 4.5 }]);
    expect(results).toHaveLength(2);
    expect(results.find((r) => r.theme === 'light').pass).toBe(true);
    expect(results.find((r) => r.theme === 'dark').pass).toBe(false);
  });

  it('throws a clear error for an unknown token', () => {
    const tokens = { light: { 'demo.fg': '#000000' } };
    expect(() =>
      checkPairings(tokens, [{ fg: 'demo.fg', bg: 'demo.missing', minRatio: 4.5 }])
    ).toThrow(/demo.missing/);
  });
});
