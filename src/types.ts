export type PlacementMode = "fill" | "fit" | "center" | "manual";
export type Orientation = "portrait" | "landscape";
export type LayoutMode = "single" | "grid4";

export interface Placement {
  mode: PlacementMode;
  scale: number;
  offsetX: number;
  offsetY: number;
  rotationDeg: number;
}

export interface PhotoEdit {
  sourcePath: string;
  placement: Placement;
}

export interface EditState {
  sourcePath: string;
  format: { widthMm: number; heightMm: number; orientation: Orientation };
  placement: Placement;
  borderMm: number;
  dpi: number;
}

export interface PreviewResult {
  path: string;
  width: number;
  height: number;
}
