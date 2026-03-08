# Architecture

## Overview

Pix2Paint is a vanilla TypeScript + Vite app with no framework. It runs 100% client-side with no backend.

## Routing

Simple query-string router in `src/main.ts`:
- `/` → Home (upload + project list)
- `/?project=<id>` → Editor

Navigation uses `pushState` + `popstate`. No external router library.

## Module Structure

```
src/
├── main.ts              # Entry point, router
├── style.css            # All styles (design tokens, components, animations)
├── lib/
│   ├── types.ts         # Shared types, interfaces, defaults
│   ├── db.ts            # IndexedDB persistence (raw API)
│   ├── engine.ts        # Image processing (pixelise, downscale, export)
│   └── worker.ts        # Web Worker (quantization, BFS, contours)
└── ui/
    ├── home.ts          # Homepage (dropzone, project cards)
    ├── editor.ts        # Editor orchestrator (wires toolbar, canvas, sidebar)
    ├── toolbar.ts       # Toolbar controls (sliders, toggles, export dropdown)
    ├── canvas.ts        # Canvas renderer (pixel mode, smooth mode, zoom/pan)
    └── sidebar.ts       # Collapsible sidebar (color legend)
```

## Data Flow

```
Image Upload → Blob stored in IndexedDB
     ↓
Editor loads Blob → HTMLImageElement
     ↓
pixelise() or downscaleSmooth() → ImageData
     ↓
Web Worker (quantizeColors + findRegions + traceContours)
     ↓
WorkerOutput { palette, pixelMap, regions, contours? }
     ↓
Canvas renders (pixel grid or smooth viewport)
Sidebar updates legend
```

## Rendering Modes

### Pixel Mode
- Downscales image by `pixelSize` (nearest-neighbor)
- Canvas sized to `grid × cellSize`, positioned with CSS offset
- Renders colored cells + grid lines + numbers per cell or per region

### Smooth Mode
- Downscales with bilinear interpolation (detail level 1-4)
- **Viewport rendering**: canvas always equals container size
- Maps screen pixels → source pixels using offset/scale
- Draws contour lines between color boundaries
- Numbers drawn at region centroids in screen-space coordinates

## Zoom & Pan

- Wheel: zoom centered on cursor position
- Mouse drag: pan with offset tracking
- Elastic snap-back: when image is smaller than container or offset beyond edges, animates back to fit (280ms ease-out cubic)
- Works for both position and scale simultaneously

## Persistence

IndexedDB store `pix2paint.projects`:
- Stores full image Blob + thumbnail Blob + settings
- Auto-save debounced at 1500ms after any settings change
- Settings merged with `DEFAULT_SETTINGS` on load for backwards compatibility

## Web Worker

Runs off main thread:
- **Color quantization**: Euclidean RGB distance, max 20 colors, running average merge
- **Region detection**: BFS flood fill, produces connected components with centroids
- **Contour tracing** (smooth mode only): checks right/bottom neighbors for color boundaries
- Transferable ArrayBuffers for zero-copy messaging

## Export

- Pixel mode: offscreen canvas at 40px/cell, PNG
- Smooth mode: OffscreenCanvas at 3000px max side, with contours and filtered numbers
