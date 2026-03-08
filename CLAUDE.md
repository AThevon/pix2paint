# Pix2Paint

Free browser-based tool that turns images into paint-by-numbers grids.

## Tech Stack

- Vite + vanilla TypeScript (no framework)
- Canvas 2D rendering
- Web Worker for image processing
- IndexedDB for persistence
- No external dependencies beyond Vite

## Project Structure

```
src/
├── main.ts          # Router (query-string based)
├── style.css        # All styles
├── lib/
│   ├── types.ts     # Types, interfaces, DEFAULT_SETTINGS
│   ├── db.ts        # IndexedDB CRUD
│   ├── engine.ts    # Downscaling, worker management, export
│   └── worker.ts    # Web Worker (quantization, BFS, contours)
└── ui/
    ├── home.ts      # Homepage + dropzone
    ├── editor.ts    # Editor orchestrator
    ├── toolbar.ts   # Controls bar
    ├── canvas.ts    # Canvas renderer (pixel + smooth modes)
    └── sidebar.ts   # Color legend
```

## Key Patterns

- UI components are factory functions: `createX(container) → { api }`
- Web Worker uses Transferable ArrayBuffers for zero-copy messaging
- Settings auto-save debounced at 1500ms
- Old projects get new fields via `{ ...DEFAULT_SETTINGS, ...project.settings }`

## Two Rendering Modes

- **Pixel**: nearest-neighbor downscale, grid cells, positioned canvas
- **Smooth**: bilinear downscale, contour lines, viewport-based rendering (canvas = container size)

## Commands

```bash
pnpm dev       # Dev server
pnpm build     # Production build
pnpm preview   # Preview production build
```

## Important Notes

- Max 20 colors in palette
- Pixel grid capped at ~150×150 (dynamic min/max pixel size)
- Smooth mode capped at 1500px max side
- Export: pixel at 40px/cell, smooth at 3000px max side
- Canvas has elastic snap-back on zoom/pan (scale + position)

## Documentation

See `docs/` for detailed documentation:
- `docs/architecture.md` — Module structure, data flow
- `docs/rendering.md` — Pixel and smooth rendering pipelines
- `docs/image-processing.md` — Quantization, BFS, contours
- `docs/ui-components.md` — Component APIs and behavior
- `docs/persistence.md` — IndexedDB storage
