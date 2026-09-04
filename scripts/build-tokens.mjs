import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tokensDir = path.join(rootDir, 'tokens');
const semanticDir = path.join(tokensDir, 'semantic');
const outputDir = path.join(rootDir, 'dist', 'tokens');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function getToken(tokens, tokenPath) {
  return tokenPath.split('.').reduce((value, segment) => value?.[segment], tokens);
}

function resolveValue(tokens, tokenPath, resolving = new Set()) {
  if (resolving.has(tokenPath)) {
    throw new Error(`Circular token reference: ${[...resolving, tokenPath].join(' -> ')}`);
  }

  const token = getToken(tokens, tokenPath);
  if (!token || !Object.hasOwn(token, '$value')) {
    throw new Error(`Unknown token reference "${tokenPath}"`);
  }

  const value = token.$value;
  const reference = typeof value === 'string' && value.match(/^\{([^}]+)\}$/);
  if (reference) {
    return resolveValue(tokens, reference[1], new Set([...resolving, tokenPath]));
  }

  if (token.$type === 'color' && value && typeof value === 'object' && value.hex) {
    return value.hex;
  }

  return value;
}

function flattenTokens(node, allTokens, prefix = [], output = {}) {
  for (const [name, value] of Object.entries(node)) {
    const tokenPath = [...prefix, name];
    if (value && typeof value === 'object' && Object.hasOwn(value, '$value')) {
      output[tokenPath.join('.')] = resolveValue(allTokens, tokenPath.join('.'));
    } else if (value && typeof value === 'object') {
      flattenTokens(value, allTokens, tokenPath, output);
    }
  }
  return output;
}

function formatCss(theme, tokens) {
  const declarations = Object.entries(tokens)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, value]) => `  --color-${name.replaceAll('.', '-')}: ${value};`)
    .join('\n');

  return `:root[data-theme='${theme}'] {\n${declarations}\n}\n`;
}

const primitives = readJson(path.join(tokensDir, 'primitives.json'));
const themes = fs.readdirSync(semanticDir)
  .filter((fileName) => fileName.endsWith('.json'))
  .sort();
const resolved = {};

fs.mkdirSync(outputDir, { recursive: true });

for (const fileName of themes) {
  const theme = path.basename(fileName, '.json');
  const semantic = readJson(path.join(semanticDir, fileName));
  const tokens = flattenTokens(semantic, { ...primitives, ...semantic });
  resolved[theme] = tokens;
  fs.writeFileSync(path.join(outputDir, `${theme}.css`), formatCss(theme, tokens));
}

fs.writeFileSync(
  path.join(outputDir, 'resolved.json'),
  `${JSON.stringify(resolved, null, 2)}\n`
);

console.log(`Built ${themes.length} themes in ${path.relative(rootDir, outputDir)}`);
