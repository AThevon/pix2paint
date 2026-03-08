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
  img.src = URL.createObjectURL(project.imageBlob);
  await new Promise<void>((resolve) => {
    img.onload = () => resolve();
  });

  const settings: ProjectSettings = { ...DEFAULT_SETTINGS, ...project.settings };
  const worker = createWorker();

  // Keep latest result for export
  let latestResult: { pixelMap: Uint8Array; palette: import('../lib/types').PaletteColor[]; regions: import('../lib/types').Region[]; contours?: Uint32Array } | null = null;
  let latestImgData: ImageData | null = null;
  let firstRender = true;

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
      if ((e as Error).message !== 'cancelled') throw e;
      canvas.showLoading(false);
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
        onBack();
      },
      onZoomFit: () => canvas.fitToView(),
      onZoom1to1: () => canvas.zoom1to1(),
    },
    { minPixelSize, maxPixelSize, imageWidth: img.width, imageHeight: img.height },
  );

  // Update toolbar with auto-computed pixelSize
  toolbar.updateSettings(settings);

  await process();
}
