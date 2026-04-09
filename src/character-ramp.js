/**
 * Character ramp system for mapping tonal values to ASCII characters.
 * Used by both text-to-ASCII and image-to-ASCII engines.
 */

// Ramps ordered from darkest (most dense) to lightest (least dense)
export const RAMPS = {
  classic: '@%#*+=-:. ',
  bold: '@#MW&8%B$Oo;:. ',
  minimal: '.:- ',
  dotwork: '●•·:. ',
  blocky: '\u2588\u2593\u2592\u2591 ',
};

export const DEFAULT_RAMP = 'classic';

/**
 * Apply contrast and brightness adjustments to an intensity value.
 * @param {number} intensity - Value from 0 to 1
 * @param {number} contrast - Contrast multiplier (0.5 to 2.0, default 1.0)
 * @param {number} brightness - Brightness offset (-0.5 to 0.5, default 0.0)
 * @returns {number} Adjusted intensity clamped to [0, 1]
 */
export function adjustIntensity(intensity, contrast = 1.0, brightness = 0.0) {
  // Apply contrast around midpoint (0.5), then shift by brightness
  let val = (intensity - 0.5) * contrast + 0.5 + brightness;
  return Math.max(0, Math.min(1, val));
}

/**
 * Get a character from the ramp based on a normalized intensity value.
 * @param {number} intensity - Value from 0 (darkest) to 1 (lightest)
 * @param {object} options
 * @param {string} options.rampName - Name of the character ramp to use
 * @param {boolean} options.inverted - If true, invert the mapping
 * @param {number} options.contrast - Contrast multiplier (default 1.0)
 * @param {number} options.brightness - Brightness offset (default 0.0)
 * @param {string|null} options.customRamp - Custom character string to use instead of named ramp
 * @returns {string} The mapped character
 */
export function getCharFromIntensity(intensity, rampNameOrOptions = DEFAULT_RAMP, inverted = false) {
  let rampName = DEFAULT_RAMP;
  let contrast = 1.0;
  let brightness = 0.0;
  let customRamp = null;

  if (typeof rampNameOrOptions === 'object' && rampNameOrOptions !== null) {
    rampName = rampNameOrOptions.rampName || DEFAULT_RAMP;
    inverted = rampNameOrOptions.inverted || false;
    contrast = rampNameOrOptions.contrast ?? 1.0;
    brightness = rampNameOrOptions.brightness ?? 0.0;
    customRamp = rampNameOrOptions.customRamp || null;
  } else {
    rampName = rampNameOrOptions;
  }

  const ramp = customRamp || RAMPS[rampName] || RAMPS[DEFAULT_RAMP];
  let val = adjustIntensity(intensity, contrast, brightness);
  if (inverted) val = 1 - val;
  const index = Math.min(Math.floor(val * ramp.length), ramp.length - 1);
  return ramp[index];
}

/**
 * Get the full ramp string for a given preset name.
 */
export function getRamp(name) {
  return RAMPS[name] || RAMPS[DEFAULT_RAMP];
}
