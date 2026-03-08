// src/lib/engine.ts

import type { WorkerOutput, PaletteColor, Region, EditorMode } from './types';

/** Downscale image by blockSize, no smoothing (pixelated) */
export function pixelise(img: HTMLImageElement, blockSize: number): ImageData {
  const w = Math.max(1, Math.floor(img.width / blockSize));
  const h = Math.max(1, Math.floor(img.height / blockSize));
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, 0, 0, w, h);
  return ctx.getImageData(0, 0, w, h);
}

/** Downscale image with smooth interpolation (for smooth mode) */
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

/** Create and return the web worker instance */
export function createWorker(): Worker {
  return new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
}

/** Send image data to worker, return promise. Supports cancellation via AbortSignal-like jobId pattern */
let currentJobId = 0;
export function processImage(
  worker: Worker,
  imgData: ImageData,
  tolerance: number,
  mode: EditorMode = 'pixel',
): Promise<WorkerOutput> {
  const jobId = ++currentJobId;
  const pixelData = new Uint8ClampedArray(imgData.data);

  return new Promise((resolve, reject) => {
    worker.onmessage = (e: MessageEvent) => {
      if (jobId !== currentJobId) {
        reject(new Error('cancelled'));
        return;
      }
      const output: WorkerOutput = {
        palette: e.data.palette,
        pixelMap: e.data.pixelMap instanceof Uint8Array
          ? e.data.pixelMap
          : new Uint8Array(e.data.pixelMap),
        regions: e.data.regions,
        contours: e.data.contours,
      };
      resolve(output);
    };
    worker.onerror = (err) => reject(err);
    worker.postMessage({
      pixelData,
      width: imgData.width,
      height: imgData.height,
      tolerance,
      mode,
    });
  });
}

/** Generate a small thumbnail blob from an image */
export function generateThumbnail(img: HTMLImageElement, maxSize = 120): Promise<Blob> {
  return new Promise((resolve) => {
    const ratio = Math.min(maxSize / img.width, maxSize / img.height);
    const w = Math.round(img.width * ratio);
    const h = Math.round(img.height * ratio);
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(img, 0, 0, w, h);
    c.toBlob((blob) => resolve(blob!), 'image/png');
  });
}

/** Export to offscreen canvas at fixed cell size, return PNG Blob */
export function exportCanvas(options: {
  pixelMap: Uint8Array;
  palette: PaletteColor[];
  regions: Region[];
  width: number;
  height: number;
  showNumbers: boolean;
  showGrouped: boolean;
  showColored: boolean;
  cellSize?: number;
}): Promise<Blob> {
  const {
    pixelMap, palette, regions, width, height,
    showNumbers, showGrouped, showColored,
    cellSize = 40,
  } = options;

  const cw = width * cellSize;
  const ch = height * cellSize;
  const c = document.createElement('canvas');
  c.width = cw;
  c.height = ch;
  const ctx = c.getContext('2d')!;

  const fontSize = Math.max(8, Math.min(cellSize * 0.55, 32));
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `bold ${fontSize}px 'Space Grotesk', sans-serif`;

  // Draw cells
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = pixelMap[y * width + x];
      const col = palette[idx];
      const px = x * cellSize;
      const py = y * cellSize;

      // Background
      if (showColored) {
        ctx.fillStyle = `rgb(${col.r},${col.g},${col.b})`;
        ctx.fillRect(px, py, cellSize, cellSize);
      } else {
        ctx.fillStyle = '#fff';
        ctx.fillRect(px, py, cellSize, cellSize);
      }

      // Grid lines
      ctx.strokeStyle = showColored ? 'rgba(0,0,0,0.15)' : 'rgba(0,0,0,0.1)';
      ctx.lineWidth = 0.5;
      ctx.strokeRect(px, py, cellSize, cellSize);

      // Numbers (non-grouped)
      if (showNumbers && !showGrouped) {
        const num = (idx + 1).toString();
        const lum = col.r * 0.299 + col.g * 0.587 + col.b * 0.114;
        ctx.fillStyle = showColored ? (lum > 140 ? '#000' : '#fff') : '#333';
        ctx.fillText(num, px + cellSize / 2, py + cellSize / 2);
      }
    }
  }

  // Grouped numbers
  if (showNumbers && showGrouped) {
    for (const region of regions) {
      const col = palette[region.colorIdx];
      const num = (region.colorIdx + 1).toString();
      const rx = region.cx * cellSize + cellSize / 2;
      const ry = region.cy * cellSize + cellSize / 2;

      // Pill background
      const metrics = ctx.measureText(num);
      const tw = metrics.width + 8;
      const th = fontSize + 6;
      ctx.fillStyle = showColored
        ? `rgba(${col.r},${col.g},${col.b},0.9)`
        : 'rgba(255,255,255,0.9)';
      ctx.beginPath();
      ctx.roundRect(rx - tw / 2, ry - th / 2, tw, th, 4);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.2)';
      ctx.lineWidth = 0.5;
      ctx.stroke();

      // Number text
      const lum = col.r * 0.299 + col.g * 0.587 + col.b * 0.114;
      ctx.fillStyle = showColored ? (lum > 140 ? '#000' : '#fff') : '#333';
      ctx.fillText(num, rx, ry);
    }
  }

  return new Promise((resolve) => {
    c.toBlob((blob) => resolve(blob!), 'image/png');
  });
}

/** Export smooth-mode canvas at high resolution, return PNG Blob */
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

  // Fill background
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
        buf[off + 3] = 115;
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

    const metrics = ctx.measureText(num);
    const tw = metrics.width + 6;
    const th = fontSize + 4;
    ctx.fillStyle = showColored ? `rgba(${c.r},${c.g},${c.b},0.85)` : 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    ctx.roundRect(rx - tw / 2, ry - th / 2, tw, th, 3);
    ctx.fill();

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
