import type { PaletteColor } from '../lib/types';

interface SidebarCallbacks {
  onHighlight: (colorIdx: number) => void;
}

const chevronLeft = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>`;
const chevronRight = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 6 15 12 9 18"/></svg>`;

export function createSidebar(
  container: HTMLElement,
  callbacks: SidebarCallbacks,
  initialOpen: boolean,
): {
  update: (palette: PaletteColor[], width: number, height: number) => void;
  toggle: () => void;
  isOpen: () => boolean;
  destroy: () => void;
} {
  let open = initialOpen;

  // Toggle button
  const toggleBtn = document.createElement('button');
  toggleBtn.className = 'sidebar-toggle';
  toggleBtn.setAttribute('aria-label', 'Toggle color legend');
  toggleBtn.innerHTML = open ? chevronRight : chevronLeft;
  container.appendChild(toggleBtn);

  // Inner content
  const inner = document.createElement('div');
  inner.className = 'sidebar-inner';
  inner.innerHTML = `
    <h3 class="sidebar-title"><span class="sidebar-title-dot"></span> Color Legend</h3>
    <div class="sidebar-legend"></div>
    <div class="sidebar-info"></div>
  `;
  container.appendChild(inner);

  if (!open) {
    container.classList.add('collapsed');
  }

  const legendEl = inner.querySelector('.sidebar-legend') as HTMLDivElement;
  const infoEl = inner.querySelector('.sidebar-info') as HTMLDivElement;

  toggleBtn.addEventListener('click', () => {
    toggle();
  });

  function toggle() {
    open = !open;
    container.classList.toggle('collapsed', !open);
    toggleBtn.innerHTML = open ? chevronRight : chevronLeft;
  }

  let lockedColor = -1;

  function update(palette: PaletteColor[], width: number, height: number) {
    legendEl.innerHTML = '';
    lockedColor = -1;
    palette.forEach((c, i) => {
      const item = document.createElement('div');
      item.className = 'legend-item';
      item.tabIndex = 0;
      item.setAttribute('role', 'button');
      item.setAttribute('aria-label', `Color ${i + 1}: ${c.hex}`);
      item.innerHTML = `
        <span class="legend-swatch" style="background:${c.hex}"></span>
        <span class="legend-number">${i + 1}</span>
        <span>
          <span class="legend-hex">${c.hex}</span><br>
          <span class="legend-count">${c.count.toLocaleString()} px</span>
        </span>
      `;
      item.addEventListener('mouseenter', () => {
        if (lockedColor < 0) callbacks.onHighlight(i);
      });
      item.addEventListener('mouseleave', () => {
        if (lockedColor < 0) callbacks.onHighlight(-1);
      });
      // Click to lock/unlock highlight
      item.addEventListener('click', () => {
        if (lockedColor === i) {
          lockedColor = -1;
          item.classList.remove('locked');
          callbacks.onHighlight(-1);
        } else {
          // Remove locked from previous
          legendEl.querySelectorAll('.legend-item.locked').forEach(el => el.classList.remove('locked'));
          lockedColor = i;
          item.classList.add('locked');
          callbacks.onHighlight(i);
        }
      });
      // Keyboard: Enter/Space to toggle
      item.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          item.click();
        }
      });
      legendEl.appendChild(item);
    });

    infoEl.innerHTML =
      `Image: ${width} × ${height} px<br>` +
      `Colors: ${palette.length}<br>` +
      `<br>Scroll to zoom, drag to pan`;
  }

  function isOpen() {
    return open;
  }

  function destroy() {
    // Nothing specific to clean up
  }

  return { update, toggle, isOpen, destroy };
}
