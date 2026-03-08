export interface PaletteColor {
  r: number;
  g: number;
  b: number;
  hex: string;
  count: number;
}

export interface Region {
  colorIdx: number;
  cx: number;
  cy: number;
}

export interface ProjectSettings {
  pixelSize: number;
  tolerance: number;
  showColored: boolean;
  showNumbers: boolean;
  showGrouped: boolean;
  sidebarOpen: boolean;
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
}

export interface WorkerOutput {
  palette: PaletteColor[];
  pixelMap: Uint8Array;
  regions: Region[];
}

export const DEFAULT_SETTINGS: ProjectSettings = {
  pixelSize: 1,
  tolerance: 30,
  showColored: true,
  showNumbers: true,
  showGrouped: false,
  sidebarOpen: true,
};
