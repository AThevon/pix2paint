# Smooth Mode — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a "smooth" rendering mode that produces traditional paint-by-numbers with organic contour lines instead of a pixel grid.

**Architecture:** Extend the existing pipeline with a new `mode` setting. In smooth mode, the image is downscaled with bilinear smoothing (not pixelised), the worker adds contour tracing after quantization + flood fill, and the canvas uses `putImageData()` + stroke-based contour rendering instead of per-cell grid rendering. The toolbar adapts its controls based on the active mode.

**Tech Stack:** Same — Vite, TypeScript, Web Worker, Canvas 2D

---

### Task 1: Extend types with smooth mode fields

**Files:**
- Modify: `src/lib/types.ts`

**Step 1: Add EditorMode type and new settings fields**

```typescript
export type EditorMode = 'pixel' | 'smooth';

export interface ProjectSettings {
  pixelSize: number;
  tolerance: number;
  showColored: boolean;
  showNumbers: boolean;
  showGrouped: boolean;
  sidebarOpen: boolean;
  mode: EditorMode;
  detailLevel: number;
  contourThickness: number;
}

export interface WorkerInput {
  pixelData: Uint8ClampedArray;
  width: number;
  height: number;
  tolerance: number;
  mode: EditorMode;
}

export interface WorkerOutput {
  palette: PaletteColor[];
  pixelMap: Uint8Array;
  regions: Region[];
  contours?: Uint32Array;
}

export const DEFAULT_SETTINGS: ProjectSettings = {
  pixelSize: 1,
  tolerance: 30,
  showColored: true,
  showNumbers: true,
  showGrouped: false,
  sidebarOpen: true,
  mode: 'pixel',
  detailLevel: 2,
  contourThickness: 1,
};
```

**Step 2: Verify build**

Run: `npx tsc --noEmit`
Expected: errors in worker.ts and engine.ts (they reference old WorkerInput shape) — that's expected, fixed in next tasks.

---

### Task 2: Add smooth downscale function to engine

**Files:**
- Modify: `src/lib/engine.ts`

**Step 1: Add `downscaleSmooth` function**

Add after the existing `pixelise` function:

```typescript
export function downscaleSmooth(img: HTMLImageElement, detailLevel: number): ImageData {
  const maxSide = 1500;
  const divisors = [4, 3, 2, 1];
  const divisor = divisors[Math.min(detailLevel - 1, 3)];
  let w = Math.round(img.width / divisor);
  let h = Math.round(img.height / divisor);

  // Cap at maxSide
  if (Math.max(w, h) > maxSide) {
    const ratio = maxSide / Math.max(w, h);
    w = Math.round(w * ratio);
    h = Math.round(h * ratio);
  }

  const cvs = document.createElement('canvas');
  cvs.width = w;
  cvs.height = h;
  const ctx = cvs.getContext('2d')!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, w, h);
  return ctx.getImageData(0, 0, w, h);
}
```

**Step 2: Verify build**

Run: `npx tsc --noEmit`

---

### Task 3: Add contour tracing to worker

**Files:**
- Modify: `src/lib/worker.ts`

**Step 1: Add `traceContours` function**

After `findRegions`, add:

```typescript
function traceContours(map: Uint8Array, width: number, height: number): Uint32Array {
  const segments: number[] = [];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = map[y * width + x];

      // Check right neighbor
      if (x < width - 1 && map[y * width + (x + 1)] !== idx) {
        segments.push(x + 1, y, x + 1, y + 1);
      }

      // Check bottom neighbor
      if (y < height - 1 && map[(y + 1) * width + x] !== idx) {
        segments.push(x, y + 1, x + 1, y + 1);
      }
    }
  }

  return new Uint32Array(segments);
}
```

**Step 2: Update the `onmessage` handler**

The handler receives `mode` from `WorkerInput`. If mode is `'smooth'`, also run `traceContours` and include the result. Transfer the contours buffer alongside pixelMap.

```typescript
self.onmessage = (e: MessageEvent<WorkerInput>) => {
  const { pixelData, width, height, tolerance, mode } = e.data;
  const { palette, pixelMap } = quantizeColors(pixelData, width, height, tolerance);
  const regions = findRegions(pixelMap, width, height);

  const result: WorkerOutput = { palette, pixelMap, regions };
  const transfer: ArrayBuffer[] = [pixelMap.buffer];

  if (mode === 'smooth') {
    result.contours = traceContours(pixelMap, width, height);
    transfer.push(result.contours.buffer);
  }

  self.postMessage(result, transfer);
};
```

**Step 3: Verify build**

Run: `npx tsc --noEmit`

---

### Task 4: Update engine to pass mode to worker

**Files:**
- Modify: `src/lib/engine.ts`

**Step 1: Update `processImage` to accept and forward mode**

Change the signature and the postMessage call:

```typescript
export function processImage(
  worker: Worker,
  imgData: ImageData,
  tolerance: number,
  mode: EditorMode = 'pixel',
): Promise<WorkerOutput> {
```

In the body, update the postMessage:

```typescript
worker.postMessage(
  { pixelData: imgData.data, width: imgData.width, height: imgData.height, tolerance, mode } as WorkerInput,
  [imgData.data.buffer],
);
```

**Step 2: Add `exportCanvasSmooth` function**

Add a new export function for smooth mode. It renders at a fixed max side of 3000px:

```typescript
export async function exportCanvasSmooth(options: {
  pixelMap: Uint8Array;
  palette: PaletteColor[];
  regions: Region[];
  contours: Uint32Array;
  width: number;
  height: number;
  showColored: boolean;
  contourThickness: number;
}): Promise<Blob> {
  const { pixelMap, palette, regions, contours, width, height, showColored, contourThickness } = options;

  const maxSide = 3000;
  const exportScale = maxSide / Math.max(width, height);
  const ew = Math.round(width * exportScale);
  const eh = Math.round(height * exportScale);

  const cvs = new OffscreenCanvas(ew, eh);
  const ctx = cvs.getContext('2d')!;

  // Fill background with color data or white
  const imgData = ctx.createImageData(ew, eh);
  const buf = imgData.data;

  for (let y = 0; y < eh; y++) {
    for (let x = 0; x < ew; x++) {
      const srcX = Math.floor(x / exportScale);
      const srcY = Math.floor(y / exportScale);
      const idx = pixelMap[srcY * width + srcX];
      const c = palette[idx];
      const off = (y * ew + x) * 4;
      if (showColored && c) {
        buf[off] = c.r;
        buf[off + 1] = c.g;
        buf[off + 2] = c.b;
        buf[off + 3] = 115; // ~0.45 alpha
      } else {
        buf[off] = 255;
        buf[off + 1] = 255;
        buf[off + 2] = 255;
        buf[off + 3] = 255;
      }
    }
  }
  ctx.putImageData(imgData, 0, 0);

  // Draw contours
  ctx.strokeStyle = 'rgba(60, 60, 60, 0.8)';
  ctx.lineWidth = contourThickness * exportScale;
  ctx.beginPath();
  for (let i = 0; i < contours.length; i += 4) {
    ctx.moveTo(contours[i] * exportScale, contours[i + 1] * exportScale);
    ctx.lineTo(contours[i + 2] * exportScale, contours[i + 3] * exportScale);
  }
  ctx.stroke();

  // Draw numbers at region centroids
  const fontSize = Math.max(10, Math.min(exportScale * 0.6, 28));
  ctx.font = `bold ${fontSize}px -apple-system, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  for (const region of regions) {
    const c = palette[region.colorIdx];
    if (!c) continue;
    const rx = (region.cx + 0.5) * exportScale;
    const ry = (region.cy + 0.5) * exportScale;
    const num = (region.colorIdx + 1).toString();

    // Pill background
    const metrics = ctx.measureText(num);
    const tw = metrics.width + 6;
    const th = fontSize + 4;
    ctx.fillStyle = showColored ? `rgba(${c.r},${c.g},${c.b},0.85)` : 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    ctx.roundRect(rx - tw / 2, ry - th / 2, tw, th, 3);
    ctx.fill();

    // Number text
    if (showColored) {
      const lum = c.r * 0.299 + c.g * 0.587 + c.b * 0.114;
      ctx.fillStyle = lum > 140 ? '#000' : '#fff';
    } else {
      ctx.fillStyle = '#333';
    }
    ctx.fillText(num, rx, ry);
  }

  return cvs.convertToBlob({ type: 'image/png' });
}
```

**Step 3: Import EditorMode type**

Add to engine.ts imports:
```typescript
import type { WorkerInput, WorkerOutput, PaletteColor, Region, EditorMode } from './types';
```

**Step 4: Verify build**

Run: `npx tsc --noEmit`

---

### Task 5: Smooth canvas renderer

**Files:**
- Modify: `src/ui/canvas.ts`

**Step 1: Add mode and contourThickness to CanvasState**

```typescript
interface CanvasState {
  // existing fields...
  mode: EditorMode;
  contours: Uint32Array;
  contourThickness: number;
}
```

Initialize defaults: `mode: 'pixel'`, `contours: new Uint32Array(0)`, `contourThickness: 1`.

**Step 2: Add `renderSmooth` function**

After the existing `render()` function, add a `renderSmooth()` that:

1. Creates an `ImageData` of canvas size
2. Fills it by mapping pixelMap colors (scaled by zoom) — or white
3. `putImageData()` in one call
4. Draws contour line segments on top (scaled by zoom + offset)
5. Draws region numbers at centroids (always grouped)

```typescript
function renderSmooth() {
  if (state.width === 0 || state.height === 0) return;

  const cw = Math.round(state.width * scale);
  const ch = Math.round(state.height * scale);

  cvs.width = cw;
  cvs.height = ch;
  cvs.style.width = cw + 'px';
  cvs.style.height = ch + 'px';
  cvs.style.left = offsetX + 'px';
  cvs.style.top = offsetY + 'px';

  const { pixelMap, palette, contours, showColored, highlightColor, showNumbers } = state;

  // 1. Fill via ImageData
  const imgData = ctx.createImageData(cw, ch);
  const buf = imgData.data;

  for (let y = 0; y < ch; y++) {
    const srcY = Math.floor(y / scale);
    for (let x = 0; x < cw; x++) {
      const srcX = Math.floor(x / scale);
      const idx = pixelMap[srcY * state.width + srcX];
      const c = palette[idx];
      const off = (y * cw + x) * 4;
      if (showColored && c) {
        const dimmed = highlightColor >= 0 && highlightColor !== idx;
        buf[off] = c.r;
        buf[off + 1] = c.g;
        buf[off + 2] = c.b;
        buf[off + 3] = dimmed ? 38 : 115;
      } else {
        buf[off] = 255;
        buf[off + 1] = 255;
        buf[off + 2] = 255;
        buf[off + 3] = 255;
      }
    }
  }
  ctx.putImageData(imgData, 0, 0);

  // 2. Draw contours
  ctx.strokeStyle = 'rgba(60, 60, 60, 0.8)';
  ctx.lineWidth = state.contourThickness;
  ctx.beginPath();
  for (let i = 0; i < contours.length; i += 4) {
    ctx.moveTo(contours[i] * scale, contours[i + 1] * scale);
    ctx.lineTo(contours[i + 2] * scale, contours[i + 3] * scale);
  }
  ctx.stroke();

  // 3. Numbers (always grouped in smooth mode)
  if (showNumbers && scale >= 4) {
    const fontSize = Math.max(8, Math.min(scale * 0.55, 40));
    ctx.font = `bold ${fontSize}px -apple-system, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (const region of state.regions) {
      const c = palette[region.colorIdx];
      if (!c) continue;
      const num = (region.colorIdx + 1).toString();
      const rx = (region.cx + 0.5) * scale;
      const ry = (region.cy + 0.5) * scale;

      const metrics = ctx.measureText(num);
      const tw = metrics.width + 6;
      const th = fontSize + 4;

      let pillAlpha = 0.7;
      if (highlightColor >= 0 && highlightColor !== region.colorIdx) pillAlpha = 0.14;

      ctx.globalAlpha = pillAlpha;
      ctx.fillStyle = showColored ? `rgba(${c.r},${c.g},${c.b},0.85)` : 'rgba(255,255,255,0.85)';
      ctx.beginPath();
      ctx.roundRect(rx - tw / 2, ry - th / 2, tw, th, 3);
      ctx.fill();

      ctx.fillStyle = showColored ? ((c.r * 0.299 + c.g * 0.587 + c.b * 0.114) > 140 ? '#000' : '#fff') : '#333';
      ctx.globalAlpha = (highlightColor >= 0 && highlightColor !== region.colorIdx) ? 0.2 : 1;
      ctx.fillText(num, rx, ry);
      ctx.globalAlpha = 1;
    }
  }
}
```

**Step 3: Update `render` dispatch and `scheduleRender`**

Wrap the existing `render()` content in a mode check:

```typescript
function render() {
  if (state.mode === 'smooth') {
    renderSmooth();
  } else {
    renderPixel();
  }
}
```

Rename the existing `render()` body to `renderPixel()`.

**Step 4: Add EditorMode import**

```typescript
import type { PaletteColor, Region, EditorMode } from '../lib/types';
```

**Step 5: Verify build**

Run: `npx tsc --noEmit`

---

### Task 6: Mode toggle in toolbar

**Files:**
- Modify: `src/ui/toolbar.ts`

**Step 1: Add mode toggle buttons and conditional control groups**

Add two mode buttons at the start of the toolbar (after Back button). Wrap pixel-only and smooth-only controls in containers with data attributes for easy show/hide.

Mode toggle HTML (after the Back button + divider):

```html
<div class="toolbar-group">
  <button class="btn btn-ghost toolbar-mode-pixel active">Pixel</button>
  <button class="btn btn-ghost toolbar-mode-smooth">Smooth</button>
</div>
<div class="toolbar-divider"></div>
```

Pixel-only group (wrap existing pixel size slider):
```html
<div class="toolbar-group toolbar-pixel-only">
  <span class="toolbar-label">Pixel size</span>
  <input type="range" ...>
  <span class="toolbar-value toolbar-pixel-value">...</span>
</div>
```

Smooth-only groups (new):
```html
<div class="toolbar-group toolbar-smooth-only" style="display:none">
  <span class="toolbar-label">Detail</span>
  <input type="range" class="toolbar-detail-slider" min="1" max="4" value="${initialSettings.detailLevel}">
  <span class="toolbar-value toolbar-detail-value">${initialSettings.detailLevel}</span>
</div>

<div class="toolbar-group toolbar-smooth-only" style="display:none">
  <span class="toolbar-label">Contour</span>
  <input type="range" class="toolbar-contour-slider" min="0.5" max="3" step="0.5" value="${initialSettings.contourThickness}">
  <span class="toolbar-value toolbar-contour-value">${initialSettings.contourThickness}</span>
</div>
```

**Step 2: Add event listeners for mode toggle**

```typescript
btnModePixel.addEventListener('click', () => {
  callbacks.onSettingsChange({ mode: 'pixel' });
});
btnModeSmooth.addEventListener('click', () => {
  callbacks.onSettingsChange({ mode: 'smooth' });
});
```

**Step 3: Add event listeners for smooth sliders**

Detail level slider (debounced 300ms):
```typescript
detailSlider.addEventListener('input', () => {
  detailValue.textContent = detailSlider.value;
  clearTimeout(detailTimeout);
  detailTimeout = window.setTimeout(() => {
    callbacks.onSettingsChange({ detailLevel: parseInt(detailSlider.value) });
  }, 300);
});
```

Contour thickness slider (no debounce, just re-render):
```typescript
contourSlider.addEventListener('input', () => {
  contourValue.textContent = contourSlider.value;
  callbacks.onSettingsChange({ contourThickness: parseFloat(contourSlider.value) });
});
```

**Step 4: Update `updateSettings` to handle mode visibility**

```typescript
function updateSettings(s: ProjectSettings) {
  // existing updates...

  // Mode toggle
  btnModePixel.classList.toggle('active', s.mode === 'pixel');
  btnModeSmooth.classList.toggle('active', s.mode === 'smooth');

  // Show/hide mode-specific controls
  const pixelOnly = container.querySelectorAll('.toolbar-pixel-only');
  const smoothOnly = container.querySelectorAll('.toolbar-smooth-only');
  pixelOnly.forEach(el => (el as HTMLElement).style.display = s.mode === 'pixel' ? '' : 'none');
  smoothOnly.forEach(el => (el as HTMLElement).style.display = s.mode === 'smooth' ? '' : 'none');

  // Update smooth sliders
  detailSlider.value = String(s.detailLevel);
  detailValue.textContent = String(s.detailLevel);
  contourSlider.value = String(s.contourThickness);
  contourValue.textContent = String(s.contourThickness);
}
```

**Step 5: Verify build**

Run: `npx tsc --noEmit`

---

### Task 7: Wire smooth mode in editor

**Files:**
- Modify: `src/ui/editor.ts`

**Step 1: Update process() to handle both modes**

```typescript
async function process() {
  canvas.showLoading(true);

  let imgData: ImageData;
  if (settings.mode === 'smooth') {
    imgData = downscaleSmooth(img, settings.detailLevel);
  } else {
    imgData = pixelise(img, settings.pixelSize);
  }
  latestImgData = imgData;

  try {
    const result = await processImage(worker, imgData, settings.tolerance, settings.mode);
    latestResult = result;
    sidebar.update(result.palette, imgData.width, imgData.height);

    setTimeout(() => {
      canvas.setState({
        pixelMap: result.pixelMap,
        palette: result.palette,
        regions: result.regions,
        width: imgData.width,
        height: imgData.height,
        showColored: settings.showColored,
        showNumbers: settings.showNumbers,
        showGrouped: settings.mode === 'smooth' ? true : settings.showGrouped,
        mode: settings.mode,
        contours: result.contours ?? new Uint32Array(0),
        contourThickness: settings.contourThickness,
      });
      canvas.fitToView();
      canvas.showLoading(false);
      firstRender = false;
    }, firstRender ? 300 : 0);
  } catch (e) {
    if ((e as Error).message !== 'cancelled') throw e;
    canvas.showLoading(false);
  }
}
```

**Step 2: Update onSettingsChange to trigger reprocess on mode/detail changes**

```typescript
onSettingsChange: async (partial) => {
  const needsReprocess =
    'pixelSize' in partial ||
    'tolerance' in partial ||
    'mode' in partial ||
    'detailLevel' in partial;

  Object.assign(settings, partial);
  toolbar.updateSettings(settings);

  if ('sidebarOpen' in partial) {
    sidebar.toggle();
    setTimeout(() => canvas.fitToView(), 300);
  }

  if (needsReprocess) {
    await process();
  } else if ('contourThickness' in partial) {
    // Just re-render with new thickness, no reprocess
    canvas.setState({ contourThickness: settings.contourThickness });
  } else {
    canvas.setState({
      showColored: settings.showColored,
      showNumbers: settings.showNumbers,
      showGrouped: settings.mode === 'smooth' ? true : settings.showGrouped,
    });
  }
  autoSave();
},
```

**Step 3: Update export handler for smooth mode**

```typescript
onExport: async (mode) => {
  let result = latestResult;
  let imgData = latestImgData;
  if (!result || !imgData) {
    imgData = settings.mode === 'smooth'
      ? downscaleSmooth(img, settings.detailLevel)
      : pixelise(img, settings.pixelSize);
    result = await processImage(worker, imgData, settings.tolerance, settings.mode);
  }

  let blob: Blob;
  if (settings.mode === 'smooth' && result.contours) {
    blob = await exportCanvasSmooth({
      pixelMap: result.pixelMap,
      palette: result.palette,
      regions: result.regions,
      contours: result.contours,
      width: imgData.width,
      height: imgData.height,
      showColored: settings.showColored,
      contourThickness: settings.contourThickness,
    });
  } else {
    blob = await exportCanvas({
      pixelMap: result.pixelMap,
      palette: result.palette,
      regions: result.regions,
      width: imgData.width,
      height: imgData.height,
      showNumbers: mode !== 'none',
      showGrouped: mode === 'grouped',
      showColored: settings.showColored,
    });
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${project.name}.png`;
  a.click();
  URL.revokeObjectURL(url);
},
```

**Step 4: Add imports**

```typescript
import { pixelise, downscaleSmooth, createWorker, processImage, exportCanvas, exportCanvasSmooth } from '../lib/engine';
```

**Step 5: Verify build**

Run: `npx tsc --noEmit`

---

### Task 8: Visual polish & verify

**Files:**
- Modify: `src/style.css` (if any toolbar styling needed for new controls)

**Step 1: Test full flow**

1. Open app, upload an image
2. Default mode = Pixel — verify everything works as before
3. Switch to Smooth — loader appears, image re-renders with contours
4. Adjust Detail slider — reprocesses at different resolutions
5. Adjust Contour thickness — updates without reprocess
6. Toggle Colored/White — white mode shows classic PBN look
7. Export in smooth mode — downloads PNG at 3000px
8. Switch back to Pixel — everything restores

**Step 2: Verify build**

Run: `npx tsc --noEmit && pnpm build`

**Step 3: Commit**

```bash
git add -A
git commit -m "feat: add smooth mode for traditional paint-by-numbers rendering"
```

---
