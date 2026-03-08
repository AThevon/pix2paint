# Rendering

## Two Modes

Pix2Paint has two rendering pipelines, selectable via toolbar toggle.

### Pixel Mode (`renderPixel`)

Traditional pixel grid. The image is downscaled with nearest-neighbor interpolation.

- **Canvas size**: `gridWidth × cellSize` by `gridHeight × cellSize`
- **Cell size**: equals zoom `scale` (min 1px)
- **Grid lines**: drawn when cellSize ≥ 12px
- **Numbers**: per-cell when not grouped (cellSize ≥ 8px), per-region centroid when grouped (cellSize ≥ 4px)
- **Highlight**: dimmed alpha for non-highlighted colors

### Smooth Mode (`renderSmooth`)

Traditional paint-by-numbers with organic contour lines.

**Viewport rendering** (performance optimization):
- Canvas is always the size of the container (not image × scale)
- Each screen pixel maps to a source pixel via `srcX = floor((sx - offsetX) / scale)`
- Only visible pixels are computed — zoom to 200× costs the same as zoom to 2×

**Rendering layers:**
1. **Color fill**: ImageData pixel loop, full RGB values (alpha 255, dimmed 80)
2. **Contour lines**: line segments between pixels of different colors, culled if off-screen
3. **Numbers**: drawn at region centroids in screen-space, always readable size (11-32px)

**Region filtering**: regions smaller than `max(8, width × height × 0.0002)` pixels don't get numbers to avoid clutter.

## Zoom & Pan

Common to both modes:

- **Wheel zoom**: 1.15× factor per step, centered on cursor
- **Mouse drag**: offset tracking with start position
- **Scale limits**: 0.5× minScale to 200×

## Elastic Snap-Back

When the image doesn't fill the viewport (zoom out too much or pan too far):

1. `getSnapTarget()` computes ideal scale + position:
   - Scale below fit-to-view? → snap scale up to `minScale`
   - Image smaller than container on axis? → center it
   - Image larger but edge pulled away? → clamp to edge
2. `snapBack()` animates from current to target over 280ms (ease-out cubic)
3. Triggered after: wheel stop (150ms debounce), mouse up
4. Interruptible: new drag or wheel cancels the animation

## Export

### Pixel Export (`exportCanvas`)
- Offscreen canvas at 40px/cell
- Options: with numbers, grouped numbers, or no numbers
- Grid lines always visible

### Smooth Export (`exportCanvasSmooth`)
- OffscreenCanvas scaled to 3000px max side
- Contour lines scaled proportionally
- Region filter applied (same as viewport rendering)
- Numbers at centroids with pill backgrounds
