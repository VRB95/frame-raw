export type PlacementMode = "fill" | "fit" | "center" | "manual";
export type Orientation = "portrait" | "landscape";

export interface EditState {
  sourcePath: string;
  format: { widthMm: number; heightMm: number; orientation: Orientation };
  placement: {
    mode: PlacementMode;
    scale: number;
    offsetX: number;
    offsetY: number;
    rotationDeg: number;
  };
  borderMm: number;
  dpi: number;
}

export interface PreviewResult {
  path: string;
  width: number;
  height: number;
}
