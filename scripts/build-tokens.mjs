import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const primitivesPath = path.join(rootDir, 'tokens', 'primitives.json');
const semanticDir = path.join(rootDir, 'tokens', 'semantic');
const outputDir = path.join(rootDir, 'dist', 'tokens');
const themes = ['light', 'dark'];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function flattenTokens(value, prefix = '', result = {}) {
  if (value && typeof value === 'object' && Object.hasOwn(value, '$value')) {
    result[prefix] = value;
    return result;
  }

  for (const [key, child] of Object.entries(value)) {
    flattenTokens(child, prefix ? `${prefix}.${key}` : key, result);
  }

  return result;
}

function resolveToken(name, tokens, resolving = new Set()) {
  const token = tokens[name];
  if (!token) {
    throw new Error(`Unknown token reference "${name}"`);
  }
  if (resolving.has(name)) {
    throw new Error(`Circular token reference involving "${name}"`);
  }

  const value = token.$value;
  const reference = typeof value === 'string' && value.match(/^\{([^}]+)\}$/);
  if (reference) {
    return resolveToken(reference[1], tokens, new Set([...resolving, name]));
  }
  if (token.$type === 'color' && value && typeof value === 'object' && typeof value.hex === 'string') {
    return value.hex;
  }
  if (typeof value === 'string' || typeof value === 'number') {
    return value;
  }

  throw new Error(`Token "${name}" has an unsupported value`);
}

function toCss(theme, tokens) {
  const declarations = Object.entries(tokens)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, value]) => `  --color-${name.replaceAll('.', '-')}: ${value};`)
    .join('\n');

  return `:root[data-theme='${theme}'] {\n${declarations}\n}\n`;
}

const primitives = flattenTokens(readJson(primitivesPath));
const resolved = {};

fs.mkdirSync(outputDir, { recursive: true });

for (const theme of themes) {
  const semantic = flattenTokens(readJson(path.join(semanticDir, `${theme}.json`)));
  const allTokens = { ...primitives, ...semantic };
  resolved[theme] = Object.fromEntries(
    Object.keys(semantic)
      .sort()
      .map((name) => [name, resolveToken(name, allTokens)])
  );

  fs.writeFileSync(path.join(outputDir, `${theme}.css`), toCss(theme, resolved[theme]));
}

fs.writeFileSync(path.join(outputDir, 'resolved.json'), `${JSON.stringify(resolved, null, 2)}\n`);
