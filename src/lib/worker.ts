// src/lib/worker.ts
// Web Worker for color quantization + connected components detection

import type { PaletteColor, Region, WorkerInput, WorkerOutput } from './types';

function colorDistance(r1: number, g1: number, b1: number, r2: number, g2: number, b2: number): number {
  return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);
}

function quantizeColors(data: Uint8ClampedArray, width: number, height: number, tolerance: number) {
  const colors: { r: number; g: number; b: number; count: number }[] = [];

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    let found = false;
    for (let j = 0; j < colors.length; j++) {
      if (colorDistance(r, g, b, colors[j].r, colors[j].g, colors[j].b) <= tolerance) {
        const c = colors[j];
        const total = c.count + 1;
        c.r = Math.round((c.r * c.count + r) / total);
        c.g = Math.round((c.g * c.count + g) / total);
        c.b = Math.round((c.b * c.count + b) / total);
        c.count = total;
        found = true;
        break;
      }
    }
    if (!found) {
      colors.push({ r, g, b, count: 1 });
    }
  }

  colors.sort((a, b) => b.count - a.count);
  const pal: PaletteColor[] = colors.slice(0, 20).map(c => ({
    ...c,
    hex: '#' + [c.r, c.g, c.b].map(v => v.toString(16).padStart(2, '0')).join(''),
  }));

  const map = new Uint8Array(width * height);
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    let bestIdx = 0, bestDist = Infinity;
    for (let j = 0; j < pal.length; j++) {
      const d = colorDistance(r, g, b, pal[j].r, pal[j].g, pal[j].b);
      if (d < bestDist) { bestDist = d; bestIdx = j; }
    }
    map[i / 4] = bestIdx;
  }

  for (const c of pal) c.count = 0;
  for (let i = 0; i < map.length; i++) pal[map[i]].count++;

  return { palette: pal, pixelMap: map };
}

function findRegions(pixelMap: Uint8Array, width: number, height: number): Region[] {
  const visited = new Uint8Array(width * height);
  const regions: Region[] = [];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (visited[i]) continue;
      const colorIdx = pixelMap[i];

      const queue = [x, y];
      let sumX = 0, sumY = 0, count = 0;
      visited[i] = 1;

      while (queue.length > 0) {
        const py = queue.pop()!;
        const px = queue.pop()!;
        sumX += px;
        sumY += py;
        count++;

        const neighbors: [number, number][] = [[px - 1, py], [px + 1, py], [px, py - 1], [px, py + 1]];
        for (const [nx, ny] of neighbors) {
          if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
          const ni = ny * width + nx;
          if (visited[ni] || pixelMap[ni] !== colorIdx) continue;
          visited[ni] = 1;
          queue.push(nx, ny);
        }
      }

      regions.push({
        colorIdx,
        cx: Math.round(sumX / count),
        cy: Math.round(sumY / count),
        pixelCount: count,
      });
    }
  }

  return regions;
}

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

self.onmessage = (e: MessageEvent<WorkerInput>) => {
  const { pixelData, width, height, tolerance, mode } = e.data;
  const { palette, pixelMap } = quantizeColors(pixelData, width, height, tolerance);
  const regions = findRegions(pixelMap, width, height);

  const result: WorkerOutput = { palette, pixelMap, regions };
  const transfer: ArrayBuffer[] = [pixelMap.buffer as ArrayBuffer];

  if (mode === 'smooth') {
    result.contours = traceContours(pixelMap, width, height);
    transfer.push(result.contours.buffer as ArrayBuffer);
  }

  // @ts-expect-error transferable
  self.postMessage(result, transfer);
};
