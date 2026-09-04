function parseHex(hex) {
  const match = hex.match(/^#([0-9a-f]{6})$/i);
  if (!match) throw new Error(`Invalid hex color "${hex}"`);

  return [0, 2, 4].map((offset) => Number.parseInt(match[1].slice(offset, offset + 2), 16) / 255);
}

function relativeLuminance(hex) {
  const [red, green, blue] = parseHex(hex).map((channel) =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  );
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

export function contrastRatio(foreground, background) {
  const foregroundLuminance = relativeLuminance(foreground);
  const backgroundLuminance = relativeLuminance(background);
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

export function checkPairings(themes, pairings) {
  return Object.entries(themes).flatMap(([theme, tokens]) =>
    pairings.map(({ fg, bg, minRatio }) => {
      if (!tokens[fg]) throw new Error(`Unknown token "${fg}" (theme: ${theme})`);
      if (!tokens[bg]) throw new Error(`Unknown token "${bg}" (theme: ${theme})`);

      const ratio = contrastRatio(tokens[fg], tokens[bg]);
      return { theme, fg, bg, ratio, minRatio, pass: ratio >= minRatio };
    })
  );
}

export function formatFailure({ theme, fg, bg, ratio, minRatio }) {
  return `"${fg}" on "${bg}" in ${theme} has contrast ${ratio.toFixed(2)}:1; required ${minRatio}:1`;
}