# Pix2Paint

Turn any image into a paint by numbers grid. Free, no sign-up, 100% in your browser.

Drop your image, adjust pixelisation and color tolerance, and get a numbered grid ready to paint in real life.

## Features

- **Image pixelisation** — adjustable pixel size with real-time grid preview
- **Color quantization** — up to 20 colors, tolerance slider to control palette size
- **Numbered cells** — each color gets a number, toggle on/off
- **Grouped regions** — flood-fill connected components with single label per region
- **Collapsible sidebar** — color legend with hex codes, pixel counts, hover highlight
- **PNG export** — with numbers, grouped numbers, or no numbers
- **Project persistence** — IndexedDB auto-save with debounce, resume where you left off
- **Zoom & pan** — scroll to zoom (centered on cursor), drag to pan
- **Web Worker** — color quantization and region detection run off the main thread
- **Mobile-friendly** — sidebar auto-collapses on small screens

## Tech Stack

- **Vite** + **TypeScript** — no framework, vanilla DOM
- **Web Worker** — offloads CPU-heavy processing
- **IndexedDB** — project persistence (raw API, no lib)
- **Canvas 2D** — rendering and export
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
2. The image is downscaled based on the pixel size slider
3. A Web Worker quantizes colors (max 20) using Euclidean RGB distance
4. Connected regions are detected via BFS flood fill
5. The canvas renders the grid with optional numbers and color overlay
6. Export as PNG at a fixed 40px/cell resolution

## License

GPL-3.0 — See [LICENSE](./LICENSE)
