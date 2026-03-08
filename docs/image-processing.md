# Image Processing

All heavy computation runs in a Web Worker (`src/lib/worker.ts`).

## Pipeline

```
Image → Downscale → Quantize → Find Regions → Trace Contours (smooth only)
```

## Downscaling

### Pixel Mode (`pixelise`)
- Nearest-neighbor downscale: `drawImage` with `imageSmoothingEnabled = false`
- Grid dimensions: `floor(imageWidth / pixelSize)` × `floor(imageHeight / pixelSize)`
- Dynamic bounds: min pixel size ensures grid ≤ 150×150, max ensures grid ≥ 5×5

### Smooth Mode (`downscaleSmooth`)
- Bilinear interpolation: `imageSmoothingEnabled = true`, quality `high`
- Detail level slider (1-4) maps to divisors [4, 3, 2, 1]
- Capped at 1500px max side

## Color Quantization (`quantizeColors`)

Sequential greedy algorithm:
1. For each pixel, find nearest existing color (Euclidean RGB distance)
2. If distance ≤ tolerance → merge (running weighted average)
3. If distance > tolerance → create new color
4. Sort by count, keep top 20
5. Re-map all pixels to the final palette (nearest match)

**Tolerance slider** (0-80): higher = fewer colors, more merging.

The algorithm is intentionally simple — no k-means, no octree. It runs fast on downscaled images (typically < 150×150 for pixel mode, < 750×750 for smooth mode).

## Region Detection (`findRegions`)

BFS flood fill on the pixel map:
- For each unvisited pixel, start a new region
- Expand to 4-connected neighbors with same color index
- Track centroid (average x, y) and pixel count
- Produces `Region { colorIdx, cx, cy, pixelCount }`

## Contour Tracing (`traceContours`)

Only used in smooth mode. For each pixel:
- If right neighbor has different color → vertical line segment at boundary
- If bottom neighbor has different color → horizontal line segment at boundary

Output: flat `Uint32Array` of `[x1, y1, x2, y2, ...]` segments.

## Data Transfer

Worker uses **Transferable ArrayBuffers** for zero-copy messaging:
- `pixelMap.buffer` (Uint8Array)
- `contours.buffer` (Uint32Array, smooth mode only)

## Job Cancellation

A simple `jobId` counter in `processImage()`: if a new job starts before the previous one resolves, the old result is rejected with `'cancelled'`.
