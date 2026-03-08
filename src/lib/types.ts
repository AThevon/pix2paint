export interface PaletteColor {
  r: number;
  g: number;
  b: number;
  hex: string;
  count: number;
}

export type EditorMode = 'pixel' | 'smooth';

export interface Region {
  colorIdx: number;
  cx: number;
  cy: number;
  pixelCount: number;
}

export interface ProjectSettings {
  pixelSize: number;
  tolerance: number;
  showColored: boolean;
  showNumbers: boolean;
  showGrouped: boolean;
  sidebarOpen: boolean;
  mode: EditorMode;
  detailLevel: number;
  contourThickness: number;
}

export interface Project {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  imageBlob: Blob;
  thumbnail: Blob;
  settings: ProjectSettings;
}

export interface WorkerInput {
  pixelData: Uint8ClampedArray;
  width: number;
  height: number;
  tolerance: number;
  mode: EditorMode;
}

export interface WorkerOutput {
  palette: PaletteColor[];
  pixelMap: Uint8Array;
  regions: Region[];
  contours?: Uint32Array;
}

export const DEFAULT_SETTINGS: ProjectSettings = {
  pixelSize: 1,
  tolerance: 30,
  showColored: true,
  showNumbers: true,
  showGrouped: false,
  sidebarOpen: true,
  mode: 'pixel',
  detailLevel: 2,
  contourThickness: 1,
};
