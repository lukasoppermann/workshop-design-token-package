function channelToLinear(channel) {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(hex) {
  const match = hex.match(/^#([0-9a-f]{6})$/i);
  if (!match) {
    throw new Error(`Invalid hex color "${hex}"`);
  }

  const channels = match[1].match(/.{2}/g).map((channel) => channelToLinear(Number.parseInt(channel, 16)));
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

export function contrastRatio(foreground, background) {
  const foregroundLuminance = relativeLuminance(foreground);
  const backgroundLuminance = relativeLuminance(background);
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

export function checkPairings(tokensByTheme, pairings) {
  return Object.entries(tokensByTheme).flatMap(([theme, tokens]) =>
    pairings.map(({ fg, bg, minRatio }) => {
      if (!tokens[fg]) {
        throw new Error(`Unknown token "${fg}" (theme: ${theme})`);
      }
      if (!tokens[bg]) {
        throw new Error(`Unknown token "${bg}" (theme: ${theme})`);
      }

      const ratio = contrastRatio(tokens[fg], tokens[bg]);
      return { fg, bg, theme, ratio, minRatio, pass: ratio >= minRatio };
    })
  );
}

export function formatFailure({ fg, bg, theme, ratio, minRatio }) {
  return `"${fg}" on "${bg}" in the ${theme} theme has a ${ratio.toFixed(2)}:1 contrast ratio, below the required ${minRatio}:1`;
}
