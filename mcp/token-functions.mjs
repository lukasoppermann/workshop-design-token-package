// Deterministic functions backing the workshop's MCP material. No network
// access: everything is read from the built token output (dist/tokens) and
// local JSON metadata. Run `npm run build` before using these.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { contrastRatio } from '../scripts/contrast.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const resolvedPath = path.join(rootDir, 'dist', 'tokens', 'resolved.json');
const pairingsPath = path.join(rootDir, 'tokens', 'contrast-pairings.json');
const tokenSetsPath = path.join(__dirname, 'token-sets.json');
const packagePath = path.join(rootDir, 'package.json');

const DEFAULT_MIN_RATIO = 4.5;

function readPackage() {
  return JSON.parse(fs.readFileSync(packagePath, 'utf8'));
}

function getSource() {
  return {
    version: readPackage().version,
    tokens: 'dist/tokens/resolved.json',
    approvals: 'tokens/contrast-pairings.json',
  };
}

function readResolvedTokens() {
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(
      `Token build output not found at ${path.relative(rootDir, resolvedPath)}. ` +
        'Run "npm run build" first.'
    );
  }
  return JSON.parse(fs.readFileSync(resolvedPath, 'utf8'));
}

function readApprovedPairings() {
  return JSON.parse(fs.readFileSync(pairingsPath, 'utf8'));
}

function readTokenSets() {
  return JSON.parse(fs.readFileSync(tokenSetsPath, 'utf8'));
}

/**
 * Returns the currently published (built) token set for a theme.
 * @param {"light"|"dark"} theme
 * @returns {{ theme: string, tokens: Record<string, string> }}
 */
export function getPublishedTokens(theme) {
  const resolved = readResolvedTokens();
  if (!resolved[theme]) {
    throw new Error(`Unknown theme "${theme}". Expected one of: ${Object.keys(resolved).join(', ')}`);
  }
  return { theme, tokens: resolved[theme] };
}

/**
 * Validates a foreground/background token pairing on two independent axes:
 *   - contrast: does it meet the WCAG ratio threshold?
 *   - semantic: is this combination an approved role pairing?
 * A pairing can pass contrast while failing semantic compatibility (e.g. a
 * readable foreground/background pair that is not an approved combination).
 *
 * @param {string} fg - token path, e.g. "fg.default"
 * @param {string} bg - token path, e.g. "canvas.subtle"
 * @param {"light"|"dark"} theme
 * @param {number} [minRatio]
 */
export function validatePairing(fg, bg, theme, minRatio) {
  const { tokens } = getPublishedTokens(theme);
  const fgHex = tokens[fg];
  const bgHex = tokens[bg];
  if (!fgHex) throw new Error(`Unknown token "${fg}" (theme: ${theme})`);
  if (!bgHex) throw new Error(`Unknown token "${bg}" (theme: ${theme})`);

  const ratio = contrastRatio(fgHex, bgHex);
  const pairing = readApprovedPairings().find((candidate) => candidate.fg === fg && candidate.bg === bg);
  const requiredRatio = minRatio ?? pairing?.minRatio ?? DEFAULT_MIN_RATIO;

  return {
    fg,
    bg,
    theme,
    contrast: {
      ratio,
      minRatio: requiredRatio,
      pass: ratio >= requiredRatio,
    },
    semantic: {
      pass: Boolean(pairing),
      reason: pairing
        ? `"${fg}" on "${bg}" is an approved semantic pairing`
        : `"${fg}" on "${bg}" is not an approved semantic pairing`,
    },
  };
}

/**
 * Returns the approved semantic token set for a UI role. Role definitions are
 * data, not application logic, and each set must point to an approved pairing.
 *
 * @param {string} role
 * @param {"light"|"dark"} theme
 */
export function getTokenSet(role, theme) {
  const { tokens } = getPublishedTokens(theme);
  const tokenSets = readTokenSets();
  const pairings = readApprovedPairings();
  const tokenSet = tokenSets[role];

  if (!tokenSet) {
    throw new Error(`Unsupported role "${role}". Expected one of: ${Object.keys(tokenSets).join(', ')}`);
  }
  if (!tokens[tokenSet.foreground]) {
    throw new Error(`Role "${role}" references unknown token "${tokenSet.foreground}" (theme: ${theme})`);
  }
  if (!tokens[tokenSet.background]) {
    throw new Error(`Role "${role}" references unknown token "${tokenSet.background}" (theme: ${theme})`);
  }
  if (!pairings.some((pairing) => pairing.fg === tokenSet.foreground && pairing.bg === tokenSet.background)) {
    throw new Error(`Role "${role}" does not reference an approved semantic pairing`);
  }

  return {
    role,
    theme,
    foreground: tokenSet.foreground,
    background: tokenSet.background,
    source: getSource(),
  };
}

/**
 * Produces the MCP tool result shape while reusing the underlying contrast and
 * semantic validation. Invalid token and theme input is a rejected result so
 * the caller receives a useful reason in the normal tool response.
 *
 * @param {string} foreground
 * @param {string} background
 * @param {"light"|"dark"} theme
 */
export function validateTokenPairing(foreground, background, theme) {
  try {
    const result = validatePairing(foreground, background, theme);
    const approved = result.contrast.pass && result.semantic.pass;
    let reason;

    if (!result.contrast.pass) {
      reason =
        `"${foreground}" on "${background}" fails contrast at ${result.contrast.ratio.toFixed(2)}:1, ` +
        `which is below the required ${result.contrast.minRatio}:1`;
    } else if (!result.semantic.pass) {
      reason =
        `"${foreground}" on "${background}" meets contrast at ${result.contrast.ratio.toFixed(2)}:1 ` +
        'but is not an approved semantic pairing';
    } else {
      reason =
        `"${foreground}" on "${background}" is an approved semantic pairing and meets ` +
        `the ${result.contrast.minRatio}:1 contrast requirement`;
    }

    return {
      approved,
      contrastRatio: result.contrast.ratio,
      minimumRequired: result.contrast.minRatio,
      source: getSource(),
      reason,
    };
  } catch (error) {
    return {
      approved: false,
      contrastRatio: null,
      minimumRequired: DEFAULT_MIN_RATIO,
      source: getSource(),
      reason: error.message,
    };
  }
}
