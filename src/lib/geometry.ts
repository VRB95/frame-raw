import type { EditState, PlacementMode } from "../types";

export const mmToPixels = (mm: number, dpi: number) => Math.round((mm / 25.4) * dpi);

export function orientedSize(format: EditState["format"]) {
  const portrait = format.orientation === "portrait";
  const short = Math.min(format.widthMm, format.heightMm);
  const long = Math.max(format.widthMm, format.heightMm);
  return portrait ? { widthMm: short, heightMm: long } : { widthMm: long, heightMm: short };
}

export function baseScale(
  mode: PlacementMode,
  sourceWidth: number,
  sourceHeight: number,
  frameWidth: number,
  frameHeight: number,
) {
  if (mode === "center") return 1;
  const sx = frameWidth / sourceWidth;
  const sy = frameHeight / sourceHeight;
  return mode === "fit" ? Math.min(sx, sy) : Math.max(sx, sy);
}

export function outputSize(state: EditState) {
  const size = orientedSize(state.format);
  return { width: mmToPixels(size.widthMm, state.dpi), height: mmToPixels(size.heightMm, state.dpi) };
}
