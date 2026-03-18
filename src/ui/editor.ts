import { getProject, saveProject } from '../lib/db';
import { pixelise, downscaleSmooth, createWorker, processImage, exportCanvas, exportCanvasSmooth } from '../lib/engine';
import { createToolbar } from './toolbar';
import { createCanvas } from './canvas';
import { createSidebar } from './sidebar';
import type { ProjectSettings } from '../lib/types';
import { DEFAULT_SETTINGS } from '../lib/types';

export async function renderEditor(
  app: HTMLElement,
  projectId: string,
  onBack: () => void,
) {
  const maybeProject = await getProject(projectId);
  if (!maybeProject) {
    onBack();
    return;
  }
  const project = maybeProject;

  // Load image from blob
  const img = new Image();
  const imgUrl = URL.createObjectURL(project.imageBlob);
  img.src = imgUrl;
  await new Promise<void>((resolve) => {
    img.onload = () => resolve();
  });
  URL.revokeObjectURL(imgUrl);

  const settings: ProjectSettings = { ...DEFAULT_SETTINGS, ...project.settings };
  const worker = createWorker();

  // Keep latest result for export
  let latestResult: { pixelMap: Uint8Array; palette: import('../lib/types').PaletteColor[]; regions: import('../lib/types').Region[]; contours?: Uint32Array } | null = null;
  let latestImgData: ImageData | null = null;
  let firstRender = true;

  // Toast helper
  function showToast(message: string, type: 'error' | 'info' = 'info') {
    const existing = document.querySelector('.editor-toast');
    if (existing) existing.remove();
    const toast = document.createElement('div');
    toast.className = `editor-toast editor-toast-${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('visible'));
    setTimeout(() => {
      toast.classList.remove('visible');
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }

  // Build layout
  app.innerHTML = `
    <div class="editor">
      <div class="editor-toolbar" id="editor-toolbar"></div>
      <div class="editor-body">
        <div class="editor-canvas" id="editor-canvas"></div>
        <div class="editor-sidebar" id="editor-sidebar"></div>
      </div>
    </div>
  `;

  // Init components
  const canvas = createCanvas(document.getElementById('editor-canvas')!);
  // Collapse sidebar by default on mobile
  const isMobile = window.innerWidth < 768;
  const sidebarInitialOpen = isMobile ? false : settings.sidebarOpen;

  const sidebar = createSidebar(
    document.getElementById('editor-sidebar')!,
    { onHighlight: (idx) => canvas.setHighlight(idx) },
    sidebarInitialOpen,
  );

  // Debounced auto-save (1500ms)
  let saveTimeout: number;
  function autoSave() {
    clearTimeout(saveTimeout);
    saveTimeout = window.setTimeout(async () => {
      project.settings = { ...settings };
      project.settings.sidebarOpen = sidebar.isOpen();
      project.updatedAt = Date.now();
      await saveProject(project);
    }, 1500);
  }

  // Process pipeline
  async function process() {
    canvas.showLoading(true);

    let imgData: ImageData;
    if (settings.mode === 'smooth') {
      imgData = downscaleSmooth(img, settings.detailLevel);
    } else {
      imgData = pixelise(img, settings.pixelSize);
    }
    latestImgData = imgData;

    try {
      const result = await processImage(worker, imgData, settings.tolerance, settings.mode);
      latestResult = result;
      sidebar.update(result.palette, imgData.width, imgData.height);

      setTimeout(() => {
        canvas.setState({
          pixelMap: result.pixelMap,
          palette: result.palette,
          regions: result.regions,
          width: imgData.width,
          height: imgData.height,
          showColored: settings.showColored,
          showNumbers: settings.showNumbers,
          showGrouped: settings.mode === 'smooth' ? true : settings.showGrouped,
          mode: settings.mode,
          contours: result.contours ?? new Uint32Array(0),
          contourThickness: settings.contourThickness,
        });
        canvas.fitToView();
        canvas.showLoading(false);
        firstRender = false;
      }, firstRender ? 300 : 0);
    } catch (e) {
      canvas.showLoading(false);
      const msg = (e as Error).message;
      if (msg === 'cancelled') return;
      if (msg === 'worker_timeout') {
        showToast('Processing timed out — try reducing detail or image size', 'error');
      } else if (msg === 'worker_error') {
        showToast('Processing failed — image may be too large', 'error');
      } else {
        showToast('An unexpected error occurred', 'error');
      }
    }
  }

  // Compute pixel size bounds
  const maxGridSize = 150;
  const minGridSize = 5;
  const minPixelSize = Math.max(1, Math.ceil(Math.max(img.width, img.height) / maxGridSize));
  const maxPixelSize = Math.max(minPixelSize + 1, Math.floor(Math.min(img.width, img.height) / minGridSize));

  // Auto-set pixelSize for large images
  if (settings.pixelSize < minPixelSize) {
    settings.pixelSize = minPixelSize;
  }

  const toolbar = createToolbar(
    document.getElementById('editor-toolbar')!,
    settings,
    {
      onSettingsChange: async (partial) => {
        const needsReprocess =
          'pixelSize' in partial ||
          'tolerance' in partial ||
          'mode' in partial ||
          'detailLevel' in partial;

        Object.assign(settings, partial);
        toolbar.updateSettings(settings);

        if ('sidebarOpen' in partial) {
          sidebar.toggle();
          setTimeout(() => canvas.fitToView(), 300);
        }

        if (needsReprocess) {
          await process();
        } else if ('contourThickness' in partial) {
          canvas.setState({ contourThickness: settings.contourThickness });
        } else {
          canvas.setState({
            showColored: settings.showColored,
            showNumbers: settings.showNumbers,
            showGrouped: settings.mode === 'smooth' ? true : settings.showGrouped,
          });
        }
        autoSave();
      },
      onExport: async (mode) => {
        // Reset highlight so export is clean
        canvas.setHighlight(-1);

        let result = latestResult;
        let imgData = latestImgData;
        if (!result || !imgData) {
          imgData = settings.mode === 'smooth'
            ? downscaleSmooth(img, settings.detailLevel)
            : pixelise(img, settings.pixelSize);
          result = await processImage(worker, imgData, settings.tolerance, settings.mode);
        }

        let blob: Blob;
        if (settings.mode === 'smooth' && result.contours) {
          blob = await exportCanvasSmooth({
            pixelMap: result.pixelMap,
            palette: result.palette,
            regions: result.regions,
            contours: result.contours,
            width: imgData.width,
            height: imgData.height,
            showColored: settings.showColored,
            contourThickness: settings.contourThickness,
          });
        } else {
          blob = await exportCanvas({
            pixelMap: result.pixelMap,
            palette: result.palette,
            regions: result.regions,
            width: imgData.width,
            height: imgData.height,
            showNumbers: mode !== 'none',
            showGrouped: mode === 'grouped',
            showColored: settings.showColored,
          });
        }

        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${project.name}.png`;
        a.click();
        URL.revokeObjectURL(url);
      },
      onBack: () => {
        worker.terminate();
        canvas.destroy();
        sidebar.destroy();
        window.removeEventListener('keydown', onKeyDown);
        onBack();
      },
      onZoomFit: () => canvas.fitToView(),
      onZoom1to1: () => canvas.zoom1to1(),
    },
    { minPixelSize, maxPixelSize, imageWidth: img.width, imageHeight: img.height },
  );

  // Update toolbar with auto-computed pixelSize
  toolbar.updateSettings(settings);

  // Keyboard shortcuts
  function onKeyDown(e: KeyboardEvent) {
    // Ignore if typing in an input
    if ((e.target as HTMLElement).tagName === 'INPUT') return;

    switch (e.key) {
      case '1':
        if (settings.mode !== 'pixel') {
          toolbar.updateSettings({ ...settings, mode: 'pixel' });
          callbacks_ref.onSettingsChange({ mode: 'pixel' as import('../lib/types').EditorMode });
        }
        break;
      case '2':
        if (settings.mode !== 'smooth') {
          toolbar.updateSettings({ ...settings, mode: 'smooth' });
          callbacks_ref.onSettingsChange({ mode: 'smooth' as import('../lib/types').EditorMode });
        }
        break;
      case 'r':
      case 'R':
        canvas.fitToView();
        break;
      case 'n':
      case 'N':
        callbacks_ref.onSettingsChange({ showNumbers: !settings.showNumbers });
        break;
      case 'g':
      case 'G':
        callbacks_ref.onSettingsChange({ showGrouped: !settings.showGrouped });
        break;
      case 'c':
      case 'C':
        callbacks_ref.onSettingsChange({ showColored: !settings.showColored });
        break;
      case 'Escape':
        worker.terminate();
        canvas.destroy();
        sidebar.destroy();
        window.removeEventListener('keydown', onKeyDown);
        onBack();
        break;
    }
  }

  // Wrap settings change to keep ref accessible for keyboard shortcuts
  const callbacks_ref = {
    onSettingsChange: async (partial: Partial<ProjectSettings>) => {
      const needsReprocess =
        'pixelSize' in partial ||
        'tolerance' in partial ||
        'mode' in partial ||
        'detailLevel' in partial;

      Object.assign(settings, partial);
      toolbar.updateSettings(settings);

      if (needsReprocess) {
        await process();
      } else if ('contourThickness' in partial) {
        canvas.setState({ contourThickness: settings.contourThickness });
      } else {
        canvas.setState({
          showColored: settings.showColored,
          showNumbers: settings.showNumbers,
          showGrouped: settings.mode === 'smooth' ? true : settings.showGrouped,
        });
      }
      autoSave();
    },
  };

  window.addEventListener('keydown', onKeyDown);

  await process();
}
