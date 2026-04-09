// ---- Export utilities for ASCII art ----

/**
 * Copy ASCII art text to clipboard.
 * Returns a promise that resolves when copying succeeds.
 */
export async function copyToClipboard(text) {
  await navigator.clipboard.writeText(text);
}

/**
 * Measure the ASCII art and render it onto an offscreen canvas, then trigger
 * a PNG download.
 */
export function downloadPNG(text, filename = 'ascii-art.png') {
  if (!text) return;

  const fontSize = 14;
  const lineHeight = fontSize * 1.2;
  const padding = 32;
  const fontFamily = "'JetBrains Mono', 'SF Mono', 'Fira Code', 'Consolas', monospace";

  const lines = text.split('\n');

  // Create a temporary canvas to measure text width
  const measureCanvas = document.createElement('canvas');
  const measureCtx = measureCanvas.getContext('2d');
  measureCtx.font = `${fontSize}px ${fontFamily}`;

  let maxWidth = 0;
  for (const line of lines) {
    const w = measureCtx.measureText(line).width;
    if (w > maxWidth) maxWidth = w;
  }

  const canvasWidth = Math.ceil(maxWidth + padding * 2);
  const canvasHeight = Math.ceil(lines.length * lineHeight + padding * 2);

  const canvas = document.createElement('canvas');
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;

  const ctx = canvas.getContext('2d');

  // Dark background matching the app theme
  ctx.fillStyle = '#0a0a0f';
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  // Draw text
  ctx.font = `${fontSize}px ${fontFamily}`;
  ctx.fillStyle = '#7c6aef'; // accent color
  ctx.textBaseline = 'top';

  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], padding, padding + i * lineHeight);
  }

  // Trigger download
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 'image/png');
}

/**
 * Build an SVG document from the ASCII text and trigger a download.
 */
export function downloadSVG(text, filename = 'ascii-art.svg') {
  if (!text) return;

  const fontSize = 14;
  const lineHeight = fontSize * 1.2;
  const padding = 32;
  const fontFamily = "'JetBrains Mono', 'SF Mono', 'Fira Code', 'Consolas', monospace";

  const lines = text.split('\n');

  // Estimate width: use a canvas to measure
  const measureCanvas = document.createElement('canvas');
  const measureCtx = measureCanvas.getContext('2d');
  measureCtx.font = `${fontSize}px ${fontFamily}`;

  let maxWidth = 0;
  for (const line of lines) {
    const w = measureCtx.measureText(line).width;
    if (w > maxWidth) maxWidth = w;
  }

  const svgWidth = Math.ceil(maxWidth + padding * 2);
  const svgHeight = Math.ceil(lines.length * lineHeight + padding * 2);

  // Escape XML special characters
  function escapeXml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  // Build tspan elements for each line
  const tspans = lines
    .map(
      (line, i) =>
        `<tspan x="${padding}" dy="${i === 0 ? 0 : lineHeight}">${escapeXml(line)}</tspan>`
    )
    .join('\n      ');

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${svgWidth}" height="${svgHeight}" viewBox="0 0 ${svgWidth} ${svgHeight}">
  <rect width="100%" height="100%" fill="#0a0a0f"/>
  <text
    font-family="${fontFamily}"
    font-size="${fontSize}"
    fill="#7c6aef"
    xml:space="preserve"
    dominant-baseline="text-before-edge"
    y="${padding}">
      ${tspans}
  </text>
</svg>`;

  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
