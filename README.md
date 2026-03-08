# Pix2Paint

Turn any image into a paint by numbers grid. Free, no sign-up, 100% in your browser.

Drop your image, adjust settings, and get a numbered grid ready to paint in real life.

## Features

- **Two rendering modes**
  - **Pixel** — classic pixel grid with adjustable cell size
  - **Smooth** — organic contour lines like real paint-by-numbers kits
- **Color quantization** — up to 20 colors, tolerance slider to control palette size
- **Numbered regions** — each color gets a number, toggle per-cell or grouped by region
- **Collapsible sidebar** — color legend with hex codes, pixel counts, hover highlight
- **PNG export** — with numbers, grouped numbers, or no numbers
- **Project persistence** — auto-save to IndexedDB, resume where you left off
- **Zoom & pan** — scroll to zoom (centered on cursor), drag to pan, elastic snap-back
- **Web Worker** — processing runs off the main thread
- **Mobile-friendly** — sidebar auto-collapses on small screens

## Tech Stack

- **Vite** + **TypeScript** — no framework, vanilla DOM
- **Web Worker** — offloads CPU-heavy processing
- **IndexedDB** — project persistence (raw API, no lib)
- **Canvas 2D** — viewport-based rendering and export
- **Google Fonts** — Archivo (headings) + Space Grotesk (UI)

## Getting Started

```bash
pnpm install
pnpm dev
```

Build for production:

```bash
pnpm build
pnpm preview
```

## How It Works

1. Upload an image (drag & drop or file picker)
2. Choose a mode:
   - **Pixel** — image is downscaled by block size, colors quantized, grid rendered
   - **Smooth** — image is downscaled with interpolation, colors quantized, contour lines traced between color regions
3. A Web Worker quantizes colors (max 20) using Euclidean RGB distance
4. Connected regions are detected via BFS flood fill
5. The canvas renders the result with optional numbers and color overlay
6. Export as PNG (pixel: 40px/cell, smooth: 3000px max side)

## Documentation

Detailed docs in `docs/`:
- [Architecture](docs/architecture.md) — module structure, data flow, routing
- [Rendering](docs/rendering.md) — pixel and smooth pipelines, zoom/pan, snap-back
- [Image Processing](docs/image-processing.md) — quantization, BFS, contour tracing
- [UI Components](docs/ui-components.md) — component APIs, design system
- [Persistence](docs/persistence.md) — IndexedDB storage, auto-save

## License

GPL-3.0 — See [LICENSE](./LICENSE)
