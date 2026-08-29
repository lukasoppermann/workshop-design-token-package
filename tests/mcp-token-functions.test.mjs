import { describe, it, expect } from 'vitest';
import {
  getPublishedTokens,
  validatePairing,
  getTokenSet,
  validateTokenPairing,
} from '../mcp/token-functions.mjs';

describe('getPublishedTokens', () => {
  it('returns the resolved tokens for a theme', () => {
    const { theme, tokens } = getPublishedTokens('light');
    expect(theme).toBe('light');
    expect(tokens['fg.default']).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('throws a clear error for an unknown theme', () => {
    expect(() => getPublishedTokens('sepia')).toThrow(/Unknown theme "sepia"/);
  });
});

describe('validatePairing', () => {
  it('passes both contrast and semantic checks for an approved role pairing', () => {
    const result = validatePairing('fg.default', 'canvas.default', 'light');
    expect(result.contrast.pass).toBe(true);
    expect(result.semantic.pass).toBe(true);
  });

  it('passes contrast but fails semantic compatibility for a cross-role pairing', () => {
    const light = validatePairing('fg.default', 'canvas.subtle', 'light');
    expect(light.contrast.pass).toBe(true);
    expect(light.semantic.pass).toBe(false);
    expect(light.semantic.reason).toContain('not an approved semantic pairing');

    const dark = validatePairing('fg.default', 'canvas.subtle', 'dark');
    expect(dark.contrast.pass).toBe(true);
    expect(dark.semantic.pass).toBe(false);
  });

  it('reports a failing ratio precisely when contrast is insufficient', () => {
    const result = validatePairing('fg.onEmphasis', 'canvas.default', 'light');
    expect(result.contrast.pass).toBe(false);
    expect(result.semantic.pass).toBe(false);
    expect(typeof result.contrast.ratio).toBe('number');
  });

  it('throws for an unknown token', () => {
    expect(() => validatePairing('made-up.fg', 'canvas.default', 'light')).toThrow(
      /Unknown token "made-up.fg"/
    );
  });
});

describe('getTokenSet', () => {
  it('returns the approved interactive link tokens from the fixture data', () => {
    expect(getTokenSet('interactive-link', 'dark')).toMatchObject({
      role: 'interactive-link',
      theme: 'dark',
      foreground: 'accent.fg',
      background: 'canvas.default',
      source: {
        version: '1.0.0',
        tokens: 'dist/tokens/resolved.json',
        approvals: 'tokens/contrast-pairings.json',
      },
    });
  });

  it('rejects an unsupported role and invalid theme clearly', () => {
    expect(() => getTokenSet('button', 'dark')).toThrow(/Unsupported role "button"/);
    expect(() => getTokenSet('interactive-link', 'sepia')).toThrow(/Unknown theme "sepia"/);
  });
});

describe('validateTokenPairing', () => {
  it('approves the interactive link foreground on the default dark canvas', () => {
    const result = validateTokenPairing('accent.fg', 'canvas.default', 'dark');

    expect(result.approved).toBe(true);
    expect(result.contrastRatio).toBeGreaterThanOrEqual(result.minimumRequired);
    expect(result.reason).toContain('approved semantic pairing');
  });

  it('uses the minimum ratio defined by the shared contrast pairing', () => {
    const result = validateTokenPairing('accent.border', 'canvas.default', 'light');

    expect(result.approved).toBe(true);
    expect(result.minimumRequired).toBe(3);
  });

  it('rejects a readable but unapproved semantic pairing', () => {
    const result = validateTokenPairing('fg.default', 'canvas.subtle', 'dark');

    expect(result.approved).toBe(false);
    expect(result.contrastRatio).toBeGreaterThanOrEqual(result.minimumRequired);
    expect(result.reason).toContain('not an approved semantic pairing');
  });

  it('returns rejection details for missing tokens and invalid themes', () => {
    expect(validateTokenPairing('missing.fg', 'canvas.default', 'dark')).toMatchObject({
      approved: false,
      contrastRatio: null,
      reason: expect.stringMatching(/Unknown token "missing.fg"/),
    });
    expect(validateTokenPairing('accent.fg', 'canvas.default', 'sepia')).toMatchObject({
      approved: false,
      contrastRatio: null,
      reason: expect.stringMatching(/Unknown theme "sepia"/),
    });
  });
});
