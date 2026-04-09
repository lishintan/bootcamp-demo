/**
 * Image-to-ASCII engine.
 * Loads an image onto an offscreen canvas, extracts luminance per pixel,
 * and maps it to characters via the character ramp system.
 */
import { getCharFromIntensity, DEFAULT_RAMP } from './character-ramp.js';

const SUPPORTED_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

const DEFAULT_WIDTH = 100;

/**
 * Validate that a file is a supported image type.
 * @param {File} file
 * @returns {{ valid: boolean, message?: string }}
 */
export function validateImageFile(file) {
  if (!file) {
    return { valid: false, message: 'No file provided.' };
  }
  if (!SUPPORTED_TYPES.has(file.type)) {
    const ext = file.name.split('.').pop();
    return {
      valid: false,
      message: `Unsupported file type "${ext}". Please upload a JPEG, PNG, WebP, or GIF image.`,
    };
  }
  return { valid: true };
}

/**
 * Load a File as an HTMLImageElement.
 * For GIFs this naturally renders only the first frame.
 * @param {File} file
 * @returns {Promise<HTMLImageElement>}
 */
function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image.'));
    };
    img.src = url;
  });
}

/**
 * Convert an image file to ASCII art.
 * All processing is client-side via an offscreen canvas.
 *
 * @param {File} file - The image file to convert
 * @param {object} options
 * @param {number} options.width - Output width in characters (default 100)
 * @param {string} options.ramp - Character ramp name (default 'classic')
 * @param {boolean} options.inverted - Invert light/dark mapping
 * @returns {Promise<string>} ASCII art string
 */
export async function imageToAscii(file, options = {}) {
  const width = options.width || DEFAULT_WIDTH;
  const rampName = options.ramp || DEFAULT_RAMP;
  const inverted = options.inverted || false;
  const contrast = options.contrast ?? 1.0;
  const brightness = options.brightness ?? 0.0;
  const customRamp = options.customRamp || null;

  const img = await loadImage(file);

  // Calculate height preserving aspect ratio.
  // Characters are roughly twice as tall as wide, so halve the vertical resolution.
  const aspectRatio = img.height / img.width;
  const height = Math.round(width * aspectRatio * 0.5);

  // Draw image onto offscreen canvas at the target character dimensions
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, width, height);

  const imageData = ctx.getImageData(0, 0, width, height);
  const pixels = imageData.data;

  const charOptions = { rampName, inverted, contrast, brightness, customRamp };

  const lines = [];
  for (let y = 0; y < height; y++) {
    let line = '';
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const r = pixels[i];
      const g = pixels[i + 1];
      const b = pixels[i + 2];
      const a = pixels[i + 3];

      // For transparent pixels, use space
      if (a < 10) {
        line += ' ';
        continue;
      }

      // Relative luminance (ITU-R BT.709)
      const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
      line += getCharFromIntensity(luminance, charOptions);
    }
    lines.push(line);
  }

  return lines.join('\n');
}
