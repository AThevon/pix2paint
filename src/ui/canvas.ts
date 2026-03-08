import type { PaletteColor, Region, EditorMode } from '../lib/types';

interface CanvasState {
  pixelMap: Uint8Array;
  palette: PaletteColor[];
  regions: Region[];
  width: number;
  height: number;
  showColored: boolean;
  showNumbers: boolean;
  showGrouped: boolean;
  highlightColor: number;
  mode: EditorMode;
  contours: Uint32Array;
  contourThickness: number;
}

export function createCanvas(
  container: HTMLElement,
): {
  setState: (state: Partial<CanvasState>) => void;
  fitToView: () => void;
  zoom1to1: () => void;
  setHighlight: (colorIdx: number) => void;
  showLoading: (visible: boolean) => void;
  destroy: () => void;
} {
  // State
  const state: CanvasState = {
    pixelMap: new Uint8Array(0),
    palette: [],
    regions: [],
    width: 0,
    height: 0,
    showColored: true,
    showNumbers: true,
    showGrouped: false,
    highlightColor: -1,
    mode: 'pixel' as EditorMode,
    contours: new Uint32Array(0),
    contourThickness: 1,
  };

  // Zoom & pan state
  let scale = 1;
  let offsetX = 0;
  let offsetY = 0;
  let isDragging = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let dragOffsetX = 0;
  let dragOffsetY = 0;
  let renderPending = false;

  // Create DOM elements
  const cvs = document.createElement('canvas');
  const ctx = cvs.getContext('2d')!;

  const loadingOverlay = document.createElement('div');
  loadingOverlay.className = 'canvas-loading';
  loadingOverlay.innerHTML = `
    <div class="loader">
      <div class="loader-grid">
        ${Array.from({ length: 9 }, (_, i) => `<div class="loader-pixel" style="animation-delay:${i * 0.12}s"></div>`).join('')}
      </div>
      <span class="loader-text">Pixelating<span class="loader-dots"></span></span>
    </div>
  `;

  container.appendChild(cvs);
  container.appendChild(loadingOverlay);

  // Render function — ported from backup HTML
  function renderPixel() {
    if (state.width === 0 || state.height === 0) return;

    const cellSize = Math.max(1, scale);
    const cw = state.width * cellSize;
    const ch = state.height * cellSize;

    cvs.width = cw;
    cvs.height = ch;
    cvs.style.width = cw + 'px';
    cvs.style.height = ch + 'px';
    cvs.style.left = offsetX + 'px';
    cvs.style.top = offsetY + 'px';

    ctx.clearRect(0, 0, cw, ch);

    const fontSize = Math.max(8, Math.min(cellSize * 0.65, 40));
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `bold ${fontSize}px -apple-system, sans-serif`;

    const { pixelMap, palette, regions, showColored, showNumbers, showGrouped, highlightColor } = state;

    for (let y = 0; y < state.height; y++) {
      for (let x = 0; x < state.width; x++) {
        const idx = pixelMap[y * state.width + x];
        const c = palette[idx];
        if (!c) continue;
        const px = x * cellSize;
        const py = y * cellSize;

        // Background
        if (showColored) {
          if (highlightColor >= 0 && highlightColor !== idx) {
            ctx.fillStyle = `rgba(${c.r},${c.g},${c.b},0.15)`;
          } else {
            ctx.fillStyle = `rgba(${c.r},${c.g},${c.b},0.45)`;
          }
        } else {
          ctx.fillStyle = (highlightColor >= 0 && highlightColor === idx)
            ? `rgba(${c.r},${c.g},${c.b},0.3)`
            : '#fff';
        }
        ctx.fillRect(px, py, cellSize, cellSize);

        // Grid lines
        if (cellSize >= 12) {
          ctx.strokeStyle = 'rgba(100,100,100,0.25)';
          ctx.lineWidth = 0.5;
          ctx.strokeRect(px, py, cellSize, cellSize);
        }

        // Number (non-grouped mode)
        if (showNumbers && !showGrouped && cellSize >= 8) {
          const num = (idx + 1).toString();
          if (showColored) {
            const lum = c.r * 0.299 + c.g * 0.587 + c.b * 0.114;
            ctx.fillStyle = lum > 140 ? '#000' : '#fff';
          } else {
            ctx.fillStyle = '#333';
          }

          if (highlightColor >= 0 && highlightColor !== idx) {
            ctx.globalAlpha = 0.2;
          }
          ctx.fillText(num, px + cellSize / 2, py + cellSize / 2);
          ctx.globalAlpha = 1;
        }
      }
    }

    // Grouped numbers: one per region, drawn at centroid
    if (showNumbers && showGrouped && cellSize >= 4) {
      for (const region of regions) {
        const c = palette[region.colorIdx];
        if (!c) continue;
        const num = (region.colorIdx + 1).toString();
        const rx = region.cx * cellSize + cellSize / 2;
        const ry = region.cy * cellSize + cellSize / 2;

        // Background pill for readability
        const metrics = ctx.measureText(num);
        const tw = metrics.width + 6;
        const th = fontSize + 4;

        let pillAlpha = 0.7;
        if (highlightColor >= 0 && highlightColor !== region.colorIdx) {
          pillAlpha = 0.14;
        }

        ctx.globalAlpha = pillAlpha;
        if (showColored) {
          ctx.fillStyle = `rgba(${c.r},${c.g},${c.b},0.85)`;
        } else {
          ctx.fillStyle = 'rgba(255,255,255,0.85)';
        }
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
        ctx.globalAlpha = (highlightColor >= 0 && highlightColor !== region.colorIdx) ? 0.2 : 1;
        ctx.fillText(num, rx, ry);
        ctx.globalAlpha = 1;
      }
    }
  }

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

  function render() {
    if (state.mode === 'smooth') {
      renderSmooth();
    } else {
      renderPixel();
    }
  }

  function scheduleRender() {
    if (renderPending) return;
    renderPending = true;
    requestAnimationFrame(() => {
      renderPending = false;
      render();
    });
  }

  // Zoom (wheel)
  function onWheel(e: WheelEvent) {
    e.preventDefault();
    const rect = container.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    const oldScale = scale;
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    scale = Math.max(1, Math.min(200, scale * factor));

    offsetX = mx - (mx - offsetX) * (scale / oldScale);
    offsetY = my - (my - offsetY) * (scale / oldScale);

    scheduleRender();
  }

  // Pan (mouse)
  function onMouseDown(e: MouseEvent) {
    isDragging = true;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    dragOffsetX = offsetX;
    dragOffsetY = offsetY;
  }

  function onMouseMove(e: MouseEvent) {
    if (!isDragging) return;
    offsetX = dragOffsetX + (e.clientX - dragStartX);
    offsetY = dragOffsetY + (e.clientY - dragStartY);
    scheduleRender();
  }

  function onMouseUp() {
    isDragging = false;
  }

  // Resize
  function onResize() {
    if (state.width > 0) {
      fitToView();
    }
  }

  container.addEventListener('wheel', onWheel, { passive: false });
  container.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);
  window.addEventListener('resize', onResize);

  // Public methods
  function fitToView() {
    if (state.width === 0 || state.height === 0) return;
    const rect = container.getBoundingClientRect();
    const scaleX = rect.width / state.width;
    const scaleY = rect.height / state.height;
    scale = Math.min(scaleX, scaleY) * 0.95;
    offsetX = (rect.width - state.width * scale) / 2;
    offsetY = (rect.height - state.height * scale) / 2;
    render();
  }

  function zoom1to1() {
    const rect = container.getBoundingClientRect();
    scale = 20;
    offsetX = (rect.width - state.width * scale) / 2;
    offsetY = (rect.height - state.height * scale) / 2;
    render();
  }

  function setState(partial: Partial<CanvasState>) {
    Object.assign(state, partial);
    render();
  }

  function setHighlight(colorIdx: number) {
    state.highlightColor = colorIdx;
    render();
  }

  function showLoading(visible: boolean) {
    loadingOverlay.classList.toggle('visible', visible);
  }

  function destroy() {
    container.removeEventListener('wheel', onWheel);
    container.removeEventListener('mousedown', onMouseDown);
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', onMouseUp);
    window.removeEventListener('resize', onResize);
  }

  return { setState, fitToView, zoom1to1, setHighlight, showLoading, destroy };
}
