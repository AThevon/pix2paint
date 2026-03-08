# Smooth Mode — Design Document

**Goal:** Add a "smooth" rendering mode to Pix2Paint that produces traditional paint-by-numbers output with organic contour lines instead of a pixel grid.

## Mode Toggle UI

Two radio-style buttons in the toolbar (before other controls):
- **Pixel** — current mode, grid of squares
- **Smooth** — new mode, contour lines between color regions

Controls adapt per mode:

| Control | Pixel | Smooth |
|---------|-------|--------|
| Pixel size | yes | no |
| Detail level | no | yes |
| Contour thickness | no | yes |
| Tolerance | yes | yes |
| Numbers | yes | yes |
| Group | yes | yes (forced on) |
| Colored/White | yes | yes |
| Export | yes | yes |

Switching mode shows the loader and reprocesses the image.

## Pipeline — Smooth Mode

### Step 1: Moderate Downscale
- Reduce image based on "Detail level" slider (1-4):
  - Level 1: image / 4 (~500px side)
  - Level 2: image / 3 (~700px)
  - Level 3: image / 2 (~1000px)
  - Level 4: original resolution
- Cap at 1500px on longest side regardless of level
- Use `imageSmoothingEnabled = true` (bilinear) for soft transitions

### Step 2: Color Quantization
Same algorithm as pixel mode — Euclidean RGB distance + tolerance. Produces `pixelMap` + `palette`.

### Step 3: Flood Fill Regions
Same BFS as pixel mode. Produces `regions[]` with centroids.

### Step 4: Contour Tracing (new)
In the worker: iterate over pixelMap, for each pixel check right and bottom neighbors. If `colorIdx` differs → record a contour segment `[x1,y1,x2,y2]`. Collect all segments as a packed `Uint32Array`.

### Worker Output (smooth)
```
WorkerOutput {
  palette, pixelMap, regions  // same as pixel
  contours?: Uint32Array      // packed [x1,y1,x2,y2,...] segments
}
```

## Canvas Rendering — Smooth Mode

### Colored mode
- Write pixelMap colors directly into an `ImageData` buffer → single `putImageData()` call
- Draw contour segments on top as thin lines

### White mode (classic PBN)
- White background
- Contour lines only + numbers
- Closest to traditional paint-by-numbers kits

### Contours
- `ctx.strokeStyle` dark gray, thickness from slider (0.5-3px)
- Simple line segments between pixels of different colors

### Numbers
- One per region at centroid (grouped mode forced)
- Font size adapted to region size (smaller regions = smaller numbers)

## Export
- Fixed resolution: longest side = 3000px
- Same rendering as canvas but on offscreen canvas
- Output: PNG blob → download

## Performance Guards

1. **Resolution cap** — Detail level slider + hard cap at 1500px side for interactive rendering
2. **Lightweight contour tracing** — Only line segments (no Bézier curves), minimal memory
3. **Fast canvas rendering** — `putImageData()` for fill instead of per-pixel `fillRect()`
4. **Separate export** — 3000px render on offscreen canvas, no impact on viewport

## Types

```typescript
type EditorMode = 'pixel' | 'smooth';

interface ProjectSettings {
  // existing
  pixelSize: number;
  tolerance: number;
  showColored: boolean;
  showNumbers: boolean;
  showGrouped: boolean;
  sidebarOpen: boolean;
  // new
  mode: EditorMode;
  detailLevel: number;      // 1-4
  contourThickness: number; // 0.5-3
}
```

## Data Flow

```
Pixel:  pixelise(blockSize) → worker(quantize + flood) → canvas grid render
Smooth: downscale(detailLevel, smooth) → worker(quantize + flood + contours) → canvas contour render
```
