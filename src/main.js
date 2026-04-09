import { textToAscii } from './text-engine.js';
import { imageToAscii, validateImageFile } from './image-engine.js';
import { copyToClipboard, downloadPNG, downloadSVG } from './export.js';

// ---- DOM refs ----

// Text mode elements
const textInput = document.getElementById('text-input');
const fontSelect = document.getElementById('font-select');
const textInputSection = document.getElementById('text-input-section');

// Image mode elements
const imageInputSection = document.getElementById('image-input-section');
const imageDropZone = document.getElementById('image-drop-zone');
const imageFileInput = document.getElementById('image-file-input');
const browseBtn = document.getElementById('browse-btn');
const uploadFilename = document.getElementById('upload-filename');
const uploadPrompt = document.getElementById('upload-prompt');
const imageError = document.getElementById('image-error');

// Shared
const asciiOutput = document.getElementById('ascii-output');
const modeTabs = document.querySelectorAll('.mode-tab');
const presetsSection = document.getElementById('presets-section');
const advancedSection = document.getElementById('advanced-section');
const outputHint = document.getElementById('output-hint');

// Preset buttons
const presetButtons = document.querySelectorAll('.preset-btn');

// Advanced controls
const advancedToggle = document.getElementById('advanced-toggle');
const advancedToggleIcon = document.getElementById('advanced-toggle-icon');
const advancedPanel = document.getElementById('advanced-panel');
const widthSlider = document.getElementById('width-slider');
const widthValue = document.getElementById('width-value');
const contrastSlider = document.getElementById('contrast-slider');
const contrastValue = document.getElementById('contrast-value');
const brightnessSlider = document.getElementById('brightness-slider');
const brightnessValue = document.getElementById('brightness-value');
const customCharset = document.getElementById('custom-charset');
const invertToggle = document.getElementById('invert-toggle');
const fontControl = document.getElementById('font-control');
const widthControl = document.getElementById('width-control');
const contrastControl = document.getElementById('contrast-control');
const brightnessControl = document.getElementById('brightness-control');
const charsetControl = document.getElementById('charset-control');
const invertControl = document.getElementById('invert-control');

// ---- State ----

let currentMode = 'text';
let currentImageFile = null;
let currentPreset = 'classic';
let isInverted = false;

// Map preset names to figlet fonts for text mode
const PRESET_TO_FONT = {
  classic: 'Standard',
  bold: 'Block',
  minimal: 'Big',
  dotwork: 'Slant',
  blocky: 'Banner3',
};

// ---- Helpers ----

function getOutputWidth() {
  return parseInt(widthSlider.value, 10);
}

function getContrast() {
  return parseInt(contrastSlider.value, 10) / 100;
}

function getBrightness() {
  return parseInt(brightnessSlider.value, 10) / 100;
}

function getCustomRamp() {
  const val = customCharset.value.trim();
  if (!val) return null;
  return val.includes(' ') ? val : val + ' ';
}

function getImageOptions() {
  return {
    width: getOutputWidth(),
    ramp: currentPreset,
    inverted: isInverted,
    contrast: getContrast(),
    brightness: getBrightness(),
    customRamp: getCustomRamp(),
  };
}

// ---- Visibility helpers for advanced controls ----

function updateAdvancedVisibility() {
  if (currentMode === 'text') {
    // In text mode: show font, hide image-specific controls
    fontControl.classList.remove('hidden');
    widthControl.classList.add('hidden');
    contrastControl.classList.add('hidden');
    brightnessControl.classList.add('hidden');
    charsetControl.classList.add('hidden');
    invertControl.classList.add('hidden');
  } else {
    // In image mode: hide font, show image controls
    fontControl.classList.add('hidden');
    widthControl.classList.remove('hidden');
    contrastControl.classList.remove('hidden');
    brightnessControl.classList.remove('hidden');
    charsetControl.classList.remove('hidden');
    invertControl.classList.remove('hidden');
  }
}

// ---- Text mode rendering ----

function renderText() {
  const text = textInput.value;
  // In text mode, preset determines the figlet font
  const font = PRESET_TO_FONT[currentPreset] || fontSelect.value;
  // Also sync the font dropdown
  fontSelect.value = font;
  asciiOutput.textContent = textToAscii(text, { font });
}

textInput.addEventListener('input', renderText);
fontSelect.addEventListener('change', () => {
  // When user manually picks a font, render with that font
  // Find if this font matches a preset and highlight it
  const font = fontSelect.value;
  let matchedPreset = null;
  for (const [preset, f] of Object.entries(PRESET_TO_FONT)) {
    if (f === font) {
      matchedPreset = preset;
      break;
    }
  }
  if (matchedPreset) {
    currentPreset = matchedPreset;
    presetButtons.forEach((b) => b.classList.remove('active'));
    document.querySelector(`.preset-btn[data-preset="${matchedPreset}"]`).classList.add('active');
  }
  renderText();
});

// ---- Image mode rendering ----

function showImageError(msg) {
  imageError.textContent = msg;
  imageError.classList.remove('hidden');
}

function clearImageError() {
  imageError.textContent = '';
  imageError.classList.add('hidden');
}

async function handleImageFile(file) {
  clearImageError();

  const validation = validateImageFile(file);
  if (!validation.valid) {
    showImageError(validation.message);
    return;
  }

  currentImageFile = file;
  uploadFilename.textContent = file.name;
  uploadFilename.classList.remove('hidden');
  uploadPrompt.style.display = 'none';

  try {
    const ascii = await imageToAscii(file, getImageOptions());
    asciiOutput.textContent = ascii;
  } catch (err) {
    showImageError('Failed to process image: ' + err.message);
  }
}

async function reRenderImage() {
  if (!currentImageFile) return;
  try {
    const ascii = await imageToAscii(currentImageFile, getImageOptions());
    asciiOutput.textContent = ascii;
  } catch (err) {
    showImageError('Failed to process image: ' + err.message);
  }
}

function reRender() {
  if (currentMode === 'text') {
    renderText();
  } else {
    reRenderImage();
  }
}

// ---- Image upload interactions ----

browseBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  imageFileInput.click();
});

imageDropZone.addEventListener('click', () => {
  imageFileInput.click();
});

imageFileInput.addEventListener('change', () => {
  if (imageFileInput.files.length > 0) {
    handleImageFile(imageFileInput.files[0]);
  }
});

// Drop zone drag events
imageDropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  imageDropZone.classList.add('dragover');
});

imageDropZone.addEventListener('dragleave', () => {
  imageDropZone.classList.remove('dragover');
});

imageDropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  imageDropZone.classList.remove('dragover');
  if (e.dataTransfer.files.length > 0) {
    handleImageFile(e.dataTransfer.files[0]);
  }
});

// ---- Page-level drag-and-drop overlay ----

const dragOverlay = document.createElement('div');
dragOverlay.className = 'drag-overlay';
dragOverlay.innerHTML = `
  <div class="drag-overlay-content">
    <div class="drag-overlay-icon">
      <svg width="48" height="48" viewBox="0 0 48 48" fill="none"><rect x="4" y="8" width="40" height="32" rx="5" stroke="currentColor" stroke-width="2.5"/><circle cx="16" cy="20" r="4" stroke="currentColor" stroke-width="2"/><path d="M4 34l10-9 7 7 8-8 15 15" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </div>
    <p class="drag-overlay-text">Drop image to convert to ASCII</p>
  </div>
`;
document.body.appendChild(dragOverlay);

let dragCounter = 0;

document.addEventListener('dragenter', (e) => {
  e.preventDefault();
  dragCounter++;
  if (dragCounter === 1) {
    // Auto-switch to image mode when dragging a file
    if (currentMode === 'text') {
      switchToMode('image');
    }
    dragOverlay.classList.add('visible');
  }
});

document.addEventListener('dragover', (e) => {
  e.preventDefault();
});

document.addEventListener('dragleave', (e) => {
  e.preventDefault();
  dragCounter--;
  if (dragCounter <= 0) {
    dragCounter = 0;
    dragOverlay.classList.remove('visible');
  }
});

document.addEventListener('drop', (e) => {
  e.preventDefault();
  dragCounter = 0;
  dragOverlay.classList.remove('visible');
  if (e.dataTransfer.files.length > 0) {
    // Switch to image mode if not already
    if (currentMode !== 'image') {
      switchToMode('image');
    }
    handleImageFile(e.dataTransfer.files[0]);
  }
});

// ---- Mode switching ----

function switchToMode(mode) {
  if (mode === currentMode) return;

  currentMode = mode;
  modeTabs.forEach((t) => t.classList.remove('active'));
  document.querySelector(`.mode-tab[data-mode="${mode}"]`).classList.add('active');

  if (mode === 'text') {
    textInputSection.classList.remove('hidden');
    imageInputSection.classList.add('hidden');
    updateAdvancedVisibility();
    renderText();
    outputHint.textContent = 'Type text or click presets to change the style';
  } else {
    textInputSection.classList.add('hidden');
    imageInputSection.classList.remove('hidden');
    updateAdvancedVisibility();
    if (currentImageFile) {
      reRenderImage();
    } else {
      asciiOutput.textContent = '';
    }
    outputHint.textContent = 'Upload an image to see it converted to ASCII art';
  }
}

modeTabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    switchToMode(tab.dataset.mode);
  });
});

// ---- Preset buttons ----

presetButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    const preset = btn.dataset.preset;
    if (preset === currentPreset) return;

    currentPreset = preset;
    presetButtons.forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');

    // Clear custom charset when switching presets
    customCharset.value = '';

    // In text mode, also sync the font dropdown
    if (currentMode === 'text') {
      const font = PRESET_TO_FONT[preset];
      if (font) fontSelect.value = font;
    }

    reRender();
  });
});

// ---- Advanced controls toggle ----

advancedToggle.addEventListener('click', () => {
  const isOpen = !advancedPanel.classList.contains('hidden');
  if (isOpen) {
    advancedPanel.classList.add('hidden');
    advancedToggleIcon.classList.remove('open');
  } else {
    advancedPanel.classList.remove('hidden');
    advancedToggleIcon.classList.add('open');
  }
});

// ---- Advanced control inputs ----

widthSlider.addEventListener('input', () => {
  widthValue.textContent = widthSlider.value;
  reRender();
});

contrastSlider.addEventListener('input', () => {
  contrastValue.textContent = getContrast().toFixed(1);
  reRender();
});

brightnessSlider.addEventListener('input', () => {
  brightnessValue.textContent = getBrightness().toFixed(1);
  reRender();
});

customCharset.addEventListener('input', () => {
  reRender();
});

invertToggle.addEventListener('click', () => {
  isInverted = !isInverted;
  invertToggle.setAttribute('aria-pressed', isInverted ? 'true' : 'false');
  reRender();
});

// ---- Export buttons ----

const copyBtn = document.getElementById('copy-btn');
const copyBtnLabel = document.getElementById('copy-btn-label');
const downloadPngBtn = document.getElementById('download-png-btn');
const downloadSvgBtn = document.getElementById('download-svg-btn');

function getAsciiText() {
  return asciiOutput.textContent || '';
}

function flashSuccess(btn, labelEl, originalLabel) {
  btn.classList.add('success');
  if (labelEl) labelEl.textContent = originalLabel === 'Copy' ? 'Copied!' : 'Done!';
  setTimeout(() => {
    btn.classList.remove('success');
    if (labelEl) labelEl.textContent = originalLabel;
  }, 1500);
}

copyBtn.addEventListener('click', async () => {
  const text = getAsciiText();
  if (!text) return;
  try {
    await copyToClipboard(text);
    flashSuccess(copyBtn, copyBtnLabel, 'Copy');
  } catch {
    // Fallback: select text in the output element
    const range = document.createRange();
    range.selectNodeContents(asciiOutput);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }
});

downloadPngBtn.addEventListener('click', () => {
  const text = getAsciiText();
  if (!text) return;
  downloadPNG(text);
  flashSuccess(downloadPngBtn, downloadPngBtn.querySelector('.export-btn-label'), 'Download PNG');
});

downloadSvgBtn.addEventListener('click', () => {
  const text = getAsciiText();
  if (!text) return;
  downloadSVG(text);
  flashSuccess(downloadSvgBtn, downloadSvgBtn.querySelector('.export-btn-label'), 'Download SVG');
});

// ---- Initial render ----

// Show presets and advanced controls in both modes
// (presets map to fonts in text mode, to character ramps in image mode)
updateAdvancedVisibility();
outputHint.textContent = 'Type text or click presets to change the style';

textInput.value = 'Hello';
renderText();
