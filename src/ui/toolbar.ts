import type { ProjectSettings, EditorMode } from '../lib/types';

interface ToolbarCallbacks {
  onSettingsChange: (settings: Partial<ProjectSettings>) => void;
  onExport: (mode: 'numbers' | 'grouped' | 'none') => void;
  onBack: () => void;
  onZoomFit: () => void;
  onZoom1to1: () => void;
}

const iconBack = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>`;
const iconExport = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`;

export function createToolbar(
  container: HTMLElement,
  initialSettings: ProjectSettings,
  callbacks: ToolbarCallbacks,
  options?: { minPixelSize?: number; maxPixelSize?: number; imageWidth?: number; imageHeight?: number },
): { updateSettings: (s: ProjectSettings) => void } {
  const minPixelSize = options?.minPixelSize ?? 1;
  const maxPixelSize = options?.maxPixelSize ?? 50;
  const imgW = options?.imageWidth ?? 0;
  const imgH = options?.imageHeight ?? 0;

  function gridLabel(pixelSize: number): string {
    if (!imgW || !imgH) return String(pixelSize);
    const gw = Math.ceil(imgW / pixelSize);
    const gh = Math.ceil(imgH / pixelSize);
    return `${pixelSize} → ${gw}×${gh}`;
  }
  function exportLabel(pixelSize: number): string {
    if (!imgW || !imgH) return '';
    const gw = Math.ceil(imgW / pixelSize);
    const gh = Math.ceil(imgH / pixelSize);
    return `Export: ${gw * 40}×${gh * 40}px`;
  }
  let pixelTimeout: number | undefined;
  let toleranceTimeout: number | undefined;
  let detailTimeout: number | undefined;
  let contourTimeout: number | undefined;

  container.innerHTML = `
    <button class="btn btn-ghost toolbar-back" title="Back to projects">
      ${iconBack}
      <span>Back</span>
    </button>

    <div class="toolbar-divider"></div>

    <div class="toolbar-toggle-group">
      <button class="btn toolbar-mode-pixel ${initialSettings.mode === 'pixel' ? 'active' : ''}">Pixel</button>
      <button class="btn toolbar-mode-smooth ${initialSettings.mode === 'smooth' ? 'active' : ''}">Smooth</button>
    </div>

    <div class="toolbar-divider"></div>

    <div class="toolbar-toggle-group">
      <button class="btn toolbar-colored ${initialSettings.showColored ? 'active' : ''}">Colored</button>
      <button class="btn toolbar-white ${!initialSettings.showColored ? 'active' : ''}">White</button>
    </div>

    <div class="toolbar-divider toolbar-pixel-only" ${initialSettings.mode === 'smooth' ? 'style="display:none"' : ''}></div>

    <div class="toolbar-group toolbar-pixel-only" ${initialSettings.mode === 'smooth' ? 'style="display:none"' : ''}>
      <span class="toolbar-label">Size</span>
      <input type="range" class="toolbar-pixel-slider" min="${minPixelSize}" max="${maxPixelSize}" value="${initialSettings.pixelSize}" aria-label="Pixel size">
      <span class="toolbar-value toolbar-pixel-value">${gridLabel(initialSettings.pixelSize)}</span>
      <span class="toolbar-export-res" title="Export resolution">${exportLabel(initialSettings.pixelSize)}</span>
    </div>

    <div class="toolbar-group toolbar-smooth-only" ${initialSettings.mode === 'pixel' ? 'style="display:none"' : ''}>
      <span class="toolbar-label">Detail</span>
      <input type="range" class="toolbar-detail-slider" min="1" max="4" value="${initialSettings.detailLevel}" aria-label="Detail level">
      <span class="toolbar-value toolbar-detail-value">${initialSettings.detailLevel}</span>
    </div>

    <div class="toolbar-divider toolbar-smooth-only" ${initialSettings.mode === 'pixel' ? 'style="display:none"' : ''}></div>

    <div class="toolbar-group toolbar-smooth-only" ${initialSettings.mode === 'pixel' ? 'style="display:none"' : ''}>
      <span class="toolbar-label">Contour</span>
      <input type="range" class="toolbar-contour-slider" min="0.5" max="3" step="0.5" value="${initialSettings.contourThickness}" aria-label="Contour thickness">
      <span class="toolbar-value toolbar-contour-value">${initialSettings.contourThickness}</span>
    </div>

    <div class="toolbar-divider"></div>

    <div class="toolbar-group">
      <span class="toolbar-label">Tolerance</span>
      <input type="range" class="toolbar-tolerance-slider" min="0" max="80" value="${initialSettings.tolerance}" aria-label="Color tolerance">
      <span class="toolbar-value toolbar-tolerance-value">${initialSettings.tolerance}</span>
    </div>

    <div class="toolbar-divider"></div>

    <div class="toolbar-group">
      <button class="btn toolbar-checkbox toolbar-numbers ${initialSettings.showNumbers ? 'active' : ''}">
        <span class="toolbar-check-indicator"></span>
        Numbers
      </button>
      <button class="btn toolbar-checkbox toolbar-grouped ${initialSettings.showGrouped ? 'active' : ''}">
        <span class="toolbar-check-indicator"></span>
        Group
      </button>
    </div>

    <div class="toolbar-divider"></div>

    <div class="toolbar-group">
      <button class="btn btn-ghost toolbar-zoom-fit">Fit</button>
      <button class="btn btn-ghost toolbar-zoom-1">1:1</button>
    </div>

    <div class="toolbar-spacer"></div>

    <div class="export-wrap">
      <button class="btn btn-accent toolbar-export">
        ${iconExport}
        Export
      </button>
      <div class="export-dropdown">
        <button class="export-option" data-mode="numbers">With numbers</button>
        <button class="export-option" data-mode="grouped">Grouped numbers</button>
        <button class="export-option" data-mode="none">No numbers</button>
      </div>
    </div>
  `;

  // Elements
  const btnBack = container.querySelector('.toolbar-back') as HTMLButtonElement;
  const btnModePixel = container.querySelector('.toolbar-mode-pixel') as HTMLButtonElement;
  const btnModeSmooth = container.querySelector('.toolbar-mode-smooth') as HTMLButtonElement;
  const btnColored = container.querySelector('.toolbar-colored') as HTMLButtonElement;
  const btnWhite = container.querySelector('.toolbar-white') as HTMLButtonElement;
  const pixelSlider = container.querySelector('.toolbar-pixel-slider') as HTMLInputElement;
  const pixelValue = container.querySelector('.toolbar-pixel-value') as HTMLSpanElement;
  const detailSlider = container.querySelector('.toolbar-detail-slider') as HTMLInputElement;
  const detailValue = container.querySelector('.toolbar-detail-value') as HTMLSpanElement;
  const contourSlider = container.querySelector('.toolbar-contour-slider') as HTMLInputElement;
  const contourValue = container.querySelector('.toolbar-contour-value') as HTMLSpanElement;
  const toleranceSlider = container.querySelector('.toolbar-tolerance-slider') as HTMLInputElement;
  const toleranceValue = container.querySelector('.toolbar-tolerance-value') as HTMLSpanElement;
  const btnNumbers = container.querySelector('.toolbar-numbers') as HTMLButtonElement;
  const btnGrouped = container.querySelector('.toolbar-grouped') as HTMLButtonElement;
  const btnZoomFit = container.querySelector('.toolbar-zoom-fit') as HTMLButtonElement;
  const btnZoom1 = container.querySelector('.toolbar-zoom-1') as HTMLButtonElement;
  const btnExport = container.querySelector('.toolbar-export') as HTMLButtonElement;
  const exportDropdown = container.querySelector('.export-dropdown') as HTMLDivElement;
  const exportOptions = container.querySelectorAll<HTMLButtonElement>('.export-option');

  // Back
  btnBack.addEventListener('click', () => callbacks.onBack());

  // Mode toggle
  btnModePixel.addEventListener('click', () => {
    callbacks.onSettingsChange({ mode: 'pixel' as EditorMode });
  });
  btnModeSmooth.addEventListener('click', () => {
    callbacks.onSettingsChange({ mode: 'smooth' as EditorMode });
  });

  // Colored / White toggle
  btnColored.addEventListener('click', () => {
    callbacks.onSettingsChange({ showColored: true });
  });
  btnWhite.addEventListener('click', () => {
    callbacks.onSettingsChange({ showColored: false });
  });

  const exportRes = container.querySelector('.toolbar-export-res') as HTMLSpanElement;

  // Pixel size slider (debounced)
  pixelSlider.addEventListener('input', () => {
    const val = parseInt(pixelSlider.value);
    pixelValue.textContent = gridLabel(val);
    if (exportRes) exportRes.textContent = exportLabel(val);
    clearTimeout(pixelTimeout);
    pixelTimeout = window.setTimeout(() => {
      callbacks.onSettingsChange({ pixelSize: val });
    }, 300);
  });

  // Detail slider (debounced)
  detailSlider.addEventListener('input', () => {
    detailValue.textContent = detailSlider.value;
    clearTimeout(detailTimeout);
    detailTimeout = window.setTimeout(() => {
      callbacks.onSettingsChange({ detailLevel: parseInt(detailSlider.value) });
    }, 300);
  });

  // Contour slider (debounced to avoid jank in smooth mode)
  contourSlider.addEventListener('input', () => {
    contourValue.textContent = contourSlider.value;
    clearTimeout(contourTimeout);
    contourTimeout = window.setTimeout(() => {
      callbacks.onSettingsChange({ contourThickness: parseFloat(contourSlider.value) });
    }, 50);
  });

  // Tolerance slider (debounced)
  toleranceSlider.addEventListener('input', () => {
    toleranceValue.textContent = toleranceSlider.value;
    clearTimeout(toleranceTimeout);
    toleranceTimeout = window.setTimeout(() => {
      callbacks.onSettingsChange({ tolerance: parseInt(toleranceSlider.value) });
    }, 300);
  });

  // Numbers toggle
  btnNumbers.addEventListener('click', () => {
    const isActive = btnNumbers.classList.contains('active');
    callbacks.onSettingsChange({ showNumbers: !isActive });
  });

  // Grouped toggle
  btnGrouped.addEventListener('click', () => {
    const isActive = btnGrouped.classList.contains('active');
    callbacks.onSettingsChange({ showGrouped: !isActive });
  });

  // Zoom
  btnZoomFit.addEventListener('click', () => callbacks.onZoomFit());
  btnZoom1.addEventListener('click', () => callbacks.onZoom1to1());

  // Export dropdown
  btnExport.addEventListener('click', (e) => {
    e.stopPropagation();
    exportDropdown.classList.toggle('visible');
  });

  exportOptions.forEach((opt) => {
    opt.addEventListener('click', () => {
      const mode = opt.dataset.mode as 'numbers' | 'grouped' | 'none';
      exportDropdown.classList.remove('visible');
      callbacks.onExport(mode);
    });
  });

  // Close dropdown on outside click
  document.addEventListener('click', () => {
    exportDropdown.classList.remove('visible');
  });

  function updateSettings(s: ProjectSettings) {
    // Mode toggle
    btnModePixel.classList.toggle('active', s.mode === 'pixel');
    btnModeSmooth.classList.toggle('active', s.mode === 'smooth');

    // Show/hide mode-specific controls
    const pixelOnly = container.querySelectorAll<HTMLElement>('.toolbar-pixel-only');
    const smoothOnly = container.querySelectorAll<HTMLElement>('.toolbar-smooth-only');
    pixelOnly.forEach(el => el.style.display = s.mode === 'pixel' ? '' : 'none');
    smoothOnly.forEach(el => el.style.display = s.mode === 'smooth' ? '' : 'none');

    btnColored.classList.toggle('active', s.showColored);
    btnWhite.classList.toggle('active', !s.showColored);
    pixelSlider.value = String(s.pixelSize);
    pixelValue.textContent = gridLabel(s.pixelSize);
    if (exportRes) exportRes.textContent = exportLabel(s.pixelSize);
    toleranceSlider.value = String(s.tolerance);
    toleranceValue.textContent = String(s.tolerance);
    btnNumbers.classList.toggle('active', s.showNumbers);
    btnGrouped.classList.toggle('active', s.showGrouped);

    // Update smooth sliders
    detailSlider.value = String(s.detailLevel);
    detailValue.textContent = String(s.detailLevel);
    contourSlider.value = String(s.contourThickness);
    contourValue.textContent = String(s.contourThickness);
  }

  return { updateSettings };
}
