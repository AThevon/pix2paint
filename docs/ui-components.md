# UI Components

All UI components follow the same pattern: a factory function that receives a container element, returns an API object, and manages its own DOM and event listeners.

## Home (`src/ui/home.ts`)

Landing page with image upload and project list.

**Elements:**
- Hero section with branding, tagline, 3-step explanation
- Dropzone (drag & drop + file picker)
- Project grid (cards with thumbnails, relative dates, delete buttons)

**Animations:**
- Staggered fade-up on load (CSS `anim-fade-up` with delay classes)
- Dropzone uses special `anim-fade-up-dropzone` class; sets inline opacity after `animationend` to prevent hover conflict

**Project creation:**
1. File → Blob + thumbnail generation
2. Save to IndexedDB with default settings
3. Navigate to editor via `onOpenEditor(id)`

## Editor (`src/ui/editor.ts`)

Orchestrates toolbar, canvas, and sidebar. Manages the processing pipeline.

**Processing flow:**
1. Load image blob from IndexedDB → `HTMLImageElement`
2. Downscale based on mode (pixel: `pixelise`, smooth: `downscaleSmooth`)
3. Send to Web Worker → receive `WorkerOutput`
4. Update canvas state + sidebar legend
5. First render delayed 300ms (behind loader) to avoid snap effect

**Settings management:**
- `onSettingsChange` determines if reprocess is needed (pixelSize, tolerance, mode, detailLevel) vs display-only change
- Auto-save debounced at 1500ms
- Settings merged with `DEFAULT_SETTINGS` on load for backwards compatibility

## Toolbar (`src/ui/toolbar.ts`)

Top bar with all editor controls.

**Controls:**
- Mode toggle: Pixel / Smooth (shows/hides mode-specific controls)
- Color toggle: Colored / White background
- Pixel size slider (pixel mode only, debounced 300ms) — shows grid dimensions
- Detail slider (smooth mode only, 1-4, debounced 300ms)
- Contour thickness slider (smooth mode only, 0.5-3, immediate)
- Tolerance slider (0-80, debounced 300ms)
- Numbers toggle, Group toggle
- Zoom: Fit / 1:1
- Export dropdown: with numbers / grouped / none

## Canvas (`src/ui/canvas.ts`)

Renders the paint-by-numbers result with zoom and pan.

**API:**
- `setState(partial)` — update state and re-render
- `fitToView()` — scale to fit container with 5% padding
- `zoom1to1()` — set scale to 20 (one source pixel = 20 screen pixels)
- `setHighlight(colorIdx)` — dim all other colors
- `showLoading(visible)` — toggle loading overlay
- `destroy()` — remove event listeners

**See [rendering.md](./rendering.md) for rendering details.**

## Sidebar (`src/ui/sidebar.ts`)

Collapsible color legend panel.

**Features:**
- Toggle button positioned at `left: -32px` (always visible via `overflow: visible`)
- Color swatches with hex codes and pixel counts
- Hover on legend item → highlight that color on canvas
- Auto-collapses on mobile (< 768px)
- Collapsed state uses `display: none` on inner content (not `overflow: hidden`) so toggle button stays accessible

## Design System

**Colors:**
- Primary: Indigo `#6366F1`
- Accent: Rose `#F43F5E`
- Background: `#0F0F13`
- Surface: `rgba(255, 255, 255, 0.04-0.08)`

**Fonts:**
- Headings: Archivo (700)
- UI: Space Grotesk (400, 500, 600)

**Radius:** 6px (controls) to 16px (cards)

**Loader:** Pixel grid animation (3×3 grid of squares pulsing with staggered delays)
