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
const contrastPairingsPath = path.join(rootDir, 'tokens', 'contrast-pairings.json');
const packagePath = path.join(rootDir, 'package.json');

const DEFAULT_MIN_RATIO = 4.5;
const ROLE_ALIASES = {
  accent: ['accent', 'interactive', 'link', 'primary'],
  attention: ['attention', 'caution', 'notice', 'warning'],
  border: ['border', 'divider', 'outline'],
  canvas: ['background', 'canvas', 'surface'],
  danger: ['danger', 'destructive', 'error', 'failed', 'failure'],
  fg: ['content', 'foreground', 'text'],
  success: ['complete', 'completed', 'positive', 'saved', 'success', 'successful'],
};

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

function readContrastPairings() {
  return JSON.parse(fs.readFileSync(contrastPairingsPath, 'utf8'));
}

function normalizeSearchTerm(value) {
  return value?.trim().toLowerCase().replaceAll('_', '-');
}

function findRole(value, availableRoles) {
  const term = normalizeSearchTerm(value);
  if (!term) return null;
  if (availableRoles.includes(term)) return term;

  return Object.entries(ROLE_ALIASES).find(
    ([role, aliases]) => availableRoles.includes(role) && aliases.includes(term)
  )?.[0] ?? null;
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

  const approvedPairing = readContrastPairings().find((pairing) => pairing.fg === fg && pairing.bg === bg);
  const requiredRatio = minRatio ?? approvedPairing?.minRatio ?? DEFAULT_MIN_RATIO;
  const ratio = contrastRatio(fgHex, bgHex);

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
      pass: Boolean(approvedPairing),
      reason: approvedPairing
        ? `"${fg}" on "${bg}" is an approved semantic pairing`
        : `"${fg}" on "${bg}" is not an approved semantic pairing`,
    },
  };
}

/**
 * Finds an exact token or all tokens related to a semantic role or intent.
 * Common UI terms are mapped to token families, such as "saved" to "success".
 *
 * @param {string|undefined} token
 * @param {string|undefined} role
 * @param {"light"|"dark"} theme
 */
export function getTokens(token, role, theme) {
  const { tokens } = getPublishedTokens(theme);
  const pairings = readContrastPairings();
  const availableRoles = [...new Set(Object.keys(tokens).map((name) => name.split('.')[0]))];
  const exactToken = token && tokens[token] ? token : null;
  const matchedRole = findRole(role ?? token?.split('.')[0], availableRoles);
  const tokenQuery = normalizeSearchTerm(token);

  if (!tokenQuery && !normalizeSearchTerm(role)) {
    throw new Error('Provide a token or role to search for');
  }

  const matches = Object.entries(tokens)
    .filter(([name]) =>
      name === exactToken ||
      (matchedRole && (name === matchedRole || name.startsWith(`${matchedRole}.`))) ||
      (!matchedRole && tokenQuery && name.toLowerCase().includes(tokenQuery))
    )
    .sort(([left], [right]) => {
      if (left === exactToken) return -1;
      if (right === exactToken) return 1;
      return left.localeCompare(right);
    })
    .map(([name, value]) => ({ name, value }));

  if (matches.length === 0) {
    const search = role ?? token;
    throw new Error(`No tokens found for "${search}". Available roles: ${availableRoles.join(', ')}`);
  }

  const matchedNames = new Set(matches.map(({ name }) => name));
  const relatedPairings = pairings
    .filter(({ fg, bg }) => matchedNames.has(fg) || matchedNames.has(bg))
    .map(({ fg, bg, minRatio }) => ({
      foreground: { name: fg, value: tokens[fg] },
      background: { name: bg, value: tokens[bg] },
      minRatio,
    }));

  return {
    theme,
    query: { token: token ?? null, role: role ?? null },
    matchedRole,
    tokens: matches,
    relatedPairings,
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
