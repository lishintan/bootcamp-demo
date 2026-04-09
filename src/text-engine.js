/**
 * Text-to-ASCII engine using figlet for block letter rendering.
 */
import figlet from 'figlet';
import standard from 'figlet/importable-fonts/Standard.js';
import big from 'figlet/importable-fonts/Big.js';
import banner from 'figlet/importable-fonts/Banner3.js';
import block from 'figlet/importable-fonts/Block.js';
import slant from 'figlet/importable-fonts/Slant.js';

// Register fonts
figlet.parseFont('Standard', standard);
figlet.parseFont('Big', big);
figlet.parseFont('Banner3', banner);
figlet.parseFont('Block', block);
figlet.parseFont('Slant', slant);

const DEFAULT_FONT = 'Standard';

/**
 * Convert text to ASCII block art.
 * @param {string} text - Input text to render
 * @param {object} options - Rendering options
 * @param {string} options.font - Figlet font name
 * @returns {string} Multi-line ASCII art string
 */
export function textToAscii(text, options = {}) {
  if (!text || text.trim().length === 0) {
    return '';
  }

  const font = options.font || DEFAULT_FONT;

  try {
    const result = figlet.textSync(text, {
      font,
      horizontalLayout: 'default',
      verticalLayout: 'default',
      whitespaceBreak: true,
    });
    return result;
  } catch {
    // If a character isn't supported by the font, try to render what we can
    // by filtering to printable ASCII
    const safeText = text.replace(/[^\x20-\x7E]/g, '');
    if (!safeText) return '';
    try {
      return figlet.textSync(safeText, {
        font,
        horizontalLayout: 'default',
        verticalLayout: 'default',
        whitespaceBreak: true,
      });
    } catch {
      return '';
    }
  }
}

/**
 * Get list of available fonts.
 */
export function getAvailableFonts() {
  return ['Standard', 'Big', 'Banner3', 'Block', 'Slant'];
}
