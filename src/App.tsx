import { useEffect, useMemo, useRef, useState } from "react";
import { convertFileSrc, invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { open, save } from "@tauri-apps/plugin-dialog";
import {
  Check,
  Download,
  FolderOpen,
  Grid2X2,
  ImagePlus,
  Images,
  LoaderCircle,
  Magnet,
  Maximize,
  RotateCcw,
  RotateCw,
  SlidersHorizontal,
  Square,
} from "lucide-react";
import { baseScale, orientedSize, outputSize, snapToCenter } from "./lib/geometry";
import type { EditState, LayoutMode, PhotoEdit, Placement, PlacementMode, PreviewResult } from "./types";

const newPlacement = (): Placement => ({ mode: "fill", scale: 1, offsetX: 0, offsetY: 0, rotationDeg: 0 });
const newSlot = (): PhotoEdit & { preview: PreviewResult | null } => ({ sourcePath: "", placement: newPlacement(), preview: null });

const initialState: EditState = {
  sourcePath: "",
  format: { widthMm: 150, heightMm: 210, orientation: "portrait" },
  placement: newPlacement(),
  borderMm: 0,
  dpi: 300,
};

const presets = [
  { label: "10 × 15", widthMm: 100, heightMm: 150 },
  { label: "13 × 18", widthMm: 130, heightMm: 180 },
  { label: "15 × 21", widthMm: 150, heightMm: 210 },
];

interface PhotoCellProps {
  index: number;
  preview: PreviewResult | null;
  placement: Placement;
  selected: boolean;
  snapEnabled: boolean;
  onSelect: () => void;
  onChoose: () => void;
  onPatch: (patch: Partial<Placement>) => void;
}

function PhotoCell({ index, preview, placement, selected, snapEnabled, onSelect, onChoose, onPatch }: PhotoCellProps) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const resize = useRef<{ centerX: number; centerY: number; distance: number; scale: number } | null>(null);
  const [cellSize, setCellSize] = useState({ width: 0, height: 0 });
  const [guides, setGuides] = useState({ x: false, y: false });

  useEffect(() => {
    if (!ref.current) return;
    const observer = new ResizeObserver(([entry]) => setCellSize({ width: entry.contentRect.width, height: entry.contentRect.height }));
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  const transform = useMemo(() => {
    if (!preview || !cellSize.width || !cellSize.height) return undefined;
    const base = baseScale(placement.mode, preview.width, preview.height, cellSize.width, cellSize.height);
    const scale = base * placement.scale;
    return {
      scale,
      style: {
        width: preview.width,
        height: preview.height,
        transform: `translate(-50%, -50%) translate(${placement.offsetX * cellSize.width}px, ${placement.offsetY * cellSize.height}px) rotate(${placement.rotationDeg}deg) scale(${scale})`,
      },
    };
  }, [preview, placement, cellSize]);

  const startDrag = (event: React.PointerEvent) => {
    if (!preview) return;
    event.stopPropagation();
    onSelect();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX, y: event.clientY, ox: placement.offsetX, oy: placement.offsetY };
  };

  const moveDrag = (event: React.PointerEvent) => {
    if (!drag.current || !ref.current) return;
    event.stopPropagation();
    const box = ref.current.getBoundingClientRect();
    const nextX = drag.current.ox + (event.clientX - drag.current.x) / box.width;
    const nextY = drag.current.oy + (event.clientY - drag.current.y) / box.height;
    const x = snapEnabled ? snapToCenter(nextX, box.width, 10) : { offset: nextX, snapped: false };
    const y = snapEnabled ? snapToCenter(nextY, box.height, 10) : { offset: nextY, snapped: false };
    setGuides({ x: x.snapped, y: y.snapped });
    onPatch({ mode: "manual", offsetX: x.offset, offsetY: y.offset });
  };

  const endDrag = (event: React.PointerEvent) => {
    event.stopPropagation();
    drag.current = null;
    setGuides({ x: false, y: false });
  };

  const startResize = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    onSelect();
    event.currentTarget.setPointerCapture(event.pointerId);
    const box = ref.current!.getBoundingClientRect();
    const centerX = box.left + box.width / 2;
    const centerY = box.top + box.height / 2;
    resize.current = {
      centerX,
      centerY,
      distance: Math.max(1, Math.hypot(event.clientX - centerX, event.clientY - centerY)),
      scale: placement.scale,
    };
  };

  const moveResize = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!resize.current) return;
    event.stopPropagation();
    const distance = Math.hypot(event.clientX - resize.current.centerX, event.clientY - resize.current.centerY);
    onPatch({ mode: "manual", scale: Math.min(4, Math.max(.2, resize.current.scale * distance / resize.current.distance)) });
  };

  return (
    <div
      ref={ref}
      className={`photo-cell${selected ? " selected" : ""}`}
      onPointerDown={() => onSelect()}
      onDoubleClick={() => preview && onPatch({ mode: "manual", offsetX: 0, offsetY: 0 })}
    >
      {preview && transform ? (
        <>
          <img draggable={false} src={convertFileSrc(preview.path)} style={transform.style} />
          {guides.x && <div className="snap-guide vertical" aria-hidden="true"><span>Center</span></div>}
          {guides.y && <div className="snap-guide horizontal" aria-hidden="true"><span>Center</span></div>}
          <div
            className="selection-box"
            style={{ ...transform.style, outlineWidth: `${1 / transform.scale}px` }}
            onPointerDown={startDrag}
            onPointerMove={moveDrag}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          >
            {(["nw", "ne", "se", "sw"] as const).map((corner) => (
              <button
                key={corner}
                className={`resize-handle ${corner}`}
                aria-label={`Resize from ${corner} corner`}
                style={{ width: `${11 / transform.scale}px`, height: `${11 / transform.scale}px`, borderWidth: `${2 / transform.scale}px` }}
                onPointerDown={startResize}
                onPointerMove={moveResize}
                onPointerUp={(event) => { event.stopPropagation(); resize.current = null; }}
                onPointerCancel={(event) => { event.stopPropagation(); resize.current = null; }}
              />
            ))}
          </div>
          <button className="replace-photo" onClick={(event) => { event.stopPropagation(); onChoose(); }}>Replace</button>
        </>
      ) : (
        <button className="empty-state" onClick={(event) => { event.stopPropagation(); onSelect(); onChoose(); }}>
          <ImagePlus size={index === 0 ? 34 : 25} />
          <strong>Add photo{index >= 0 ? ` ${index + 1}` : ""}</strong>
          <span>Click to browse</span>
        </button>
      )}
      {selected && index >= 0 && <span className="slot-number">{index + 1}</span>}
    </div>
  );
}

export default function App() {
  const [edit, setEdit] = useState(initialState);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [slots, setSlots] = useState(() => Array.from({ length: 4 }, newSlot));
  const [layoutMode, setLayoutMode] = useState<LayoutMode>("single");
  const [selectedSlot, setSelectedSlot] = useState(0);
  const [gapMm, setGapMm] = useState(4);
  const [busy, setBusy] = useState<string | null>(null);
  const [exportType, setExportType] = useState<"jpeg" | "png">("jpeg");
  const [message, setMessage] = useState("Drop a RAW file here or choose one");
  const [snapEnabled, setSnapEnabled] = useState(true);
  const layoutRef = useRef(layoutMode);
  const selectedSlotRef = useRef(selectedSlot);

  useEffect(() => { layoutRef.current = layoutMode; }, [layoutMode]);
  useEffect(() => { selectedSlotRef.current = selectedSlot; }, [selectedSlot]);

  const loadRaw = async (path: string, target: "single" | number) => {
    setBusy("Decoding preview…");
    setMessage("");
    try {
      const result = await invoke<PreviewResult>("generate_preview", { sourcePath: path });
      if (target === "single") {
        setEdit((old) => ({ ...old, sourcePath: path, placement: newPlacement() }));
        setPreview(result);
      } else {
        setSlots((old) => old.map((slot, index) => index === target ? { sourcePath: path, placement: newPlacement(), preview: result } : slot));
        setSelectedSlot(target);
      }
    } catch (error) {
      setMessage(String(error));
    } finally {
      setBusy(null);
    }
  };

  useEffect(() => {
    if (!isTauri()) return;
    let unlisten: (() => void) | undefined;
    getCurrentWebview().onDragDropEvent((event) => {
      if (event.payload.type !== "drop") return;
      const path = event.payload.paths.find((candidate) => /\.(arw|dng|nef|cr2|cr3|raf|orf|rw2|jpg|jpeg|png|tif|tiff)$/i.test(candidate));
      if (path) void loadRaw(path, layoutRef.current === "grid4" ? selectedSlotRef.current : "single");
    }).then((fn) => { unlisten = fn; });
    return () => unlisten?.();
  }, []);

  useEffect(() => {
    if (!isTauri()) return;
    let unlisten: (() => void) | undefined;
    listen<string>("backend-log", (event) => console.info(event.payload)).then((fn) => { unlisten = fn; });
    return () => unlisten?.();
  }, []);

  const chooseFile = async (target: "single" | number = layoutMode === "grid4" ? selectedSlot : "single") => {
    if (!isTauri()) {
      setMessage("RAW selection is available in the Tauri app (`npm run desktop`).");
      return;
    }
    const path = await open({
      multiple: false,
      filters: [{ name: "Photos", extensions: ["arw", "dng", "nef", "cr2", "cr3", "raf", "orf", "rw2", "jpg", "jpeg", "png", "tif", "tiff"] }],
    });
    if (typeof path === "string") await loadRaw(path, target);
  };

  const hasPhotos = layoutMode === "single" ? !!preview : slots.some((slot) => !!slot.preview);
  const currentPath = layoutMode === "single" ? edit.sourcePath : slots.find((slot) => slot.sourcePath)?.sourcePath ?? "";
  const activePlacement = layoutMode === "single" ? edit.placement : slots[selectedSlot].placement;
  const patchPlacement = (patch: Partial<Placement>) => {
    if (layoutMode === "single") {
      setEdit((old) => ({ ...old, placement: { ...old.placement, ...patch } }));
    } else {
      setSlots((old) => old.map((slot, index) => index === selectedSlot ? { ...slot, placement: { ...slot.placement, ...patch } } : slot));
    }
  };
  const patchSlot = (index: number, patch: Partial<Placement>) => {
    setSlots((old) => old.map((slot, slotIndex) => slotIndex === index ? { ...slot, placement: { ...slot.placement, ...patch } } : slot));
  };

  const exportImage = async () => {
    if (!hasPhotos || !isTauri()) return;
    const extension = exportType === "png" ? "png" : "jpg";
    const suggested = currentPath.replace(/\.[^.]+$/, `-framed.${extension}`);
    const selectedPath = await save({
      defaultPath: suggested,
      filters: exportType === "png" ? [{ name: "PNG", extensions: ["png"] }] : [{ name: "JPEG", extensions: ["jpg", "jpeg"] }],
    });
    if (!selectedPath) return;
    const outputPath = selectedPath.toLowerCase().endsWith(`.${extension}`) ? selectedPath : `${selectedPath}.${extension}`;
    setBusy(`Exporting ${exportType.toUpperCase()}…`);
    try {
      await invoke("export_image", {
        request: {
          ...edit,
          sourcePath: layoutMode === "single" ? edit.sourcePath : currentPath,
          outputPath,
          layoutMode,
          gapMm,
          photos: slots.map(({ sourcePath, placement }) => ({ sourcePath, placement })),
        },
      });
      setMessage(`Export complete: ${outputPath}`);
    } catch (error) {
      setMessage(String(error));
    } finally {
      setBusy(null);
    }
  };

  const size = orientedSize(edit.format);
  const frameRatio = size.widthMm / size.heightMm;
  const contentWidthMm = Math.max(1, size.widthMm - edit.borderMm * 2);

  return (
    <main className="app-shell">
      <header>
        <div className="brand"><span>Fr</span> FrameRaw</div>
        <nav className="top-nav" aria-label="Workspace"><button className="active">Edit</button></nav>
        <div className="header-actions">
          <div className="status">{busy ?? message}</div>
          <button className="import-button" onClick={() => void chooseFile()} disabled={!!busy}><FolderOpen size={16} /> Add photo</button>
          <button className="primary" disabled={!hasPhotos || !!busy} onClick={exportImage}><Download size={17} /> Export {exportType.toUpperCase()}</button>
        </div>
      </header>

      <div className="tool-rail" aria-label="Tools">
        <button className="active" aria-label="Adjust"><SlidersHorizontal size={19} /></button>
        <div className="rail-spacer" />
        <button className={snapEnabled ? "active snap-tool" : "snap-tool"} aria-label="Toggle center snapping" title="Snap to center" onClick={() => setSnapEnabled((enabled) => !enabled)}><Magnet size={18} /></button>
      </div>

      <aside>
        <div className="panel-heading"><div><span>Edit</span><small>Frame &amp; output</small></div><SlidersHorizontal size={18} /></div>
        <section>
          <h2>Layout <Images size={14} /></h2>
          <div className="layout-options">
            <button className={layoutMode === "single" ? "active" : ""} onClick={() => setLayoutMode("single")}><Square size={17} /><span>1 photo</span></button>
            <button className={layoutMode === "grid4" ? "active" : ""} onClick={() => setLayoutMode("grid4")}><Grid2X2 size={17} /><span>2 × 2</span></button>
          </div>
          {layoutMode === "grid4" && (
            <>
              <div className="slot-picker">
                {slots.map((slot, index) => <button key={index} className={selectedSlot === index ? "active" : ""} onClick={() => setSelectedSlot(index)}>{index + 1}<i className={slot.preview ? "filled" : ""} /></button>)}
              </div>
              <label>Inner spacing <output>{gapMm} mm</output></label>
              <input type="range" min="0" max="20" step="1" value={gapMm} onChange={(event) => setGapMm(Number(event.target.value))} />
            </>
          )}
        </section>

        <section>
          <h2>Print format <Check size={13} /></h2>
          <div className="preset-grid">
            {presets.map((preset) => <button key={preset.label} className={edit.format.widthMm === preset.widthMm && edit.format.heightMm === preset.heightMm ? "active" : ""} onClick={() => setEdit((old) => ({ ...old, format: { ...old.format, ...preset } }))}>{preset.label}<small>cm</small></button>)}
          </div>
          <div className="segmented">
            {(["portrait", "landscape"] as const).map((orientation) => <button className={edit.format.orientation === orientation ? "active" : ""} key={orientation} onClick={() => setEdit((old) => ({ ...old, format: { ...old.format, orientation } }))}>{orientation === "portrait" ? "Portrait" : "Landscape"}</button>)}
          </div>
        </section>

        <section>
          <h2>Photo framing {layoutMode === "grid4" && <small>Photo {selectedSlot + 1}</small>}</h2>
          <div className="segmented thirds">
            {(["fill", "fit", "center"] as PlacementMode[]).map((mode) => <button className={activePlacement.mode === mode ? "active" : ""} key={mode} onClick={() => patchPlacement({ mode, scale: 1, offsetX: 0, offsetY: 0 })}>{mode[0].toUpperCase() + mode.slice(1)}</button>)}
          </div>
          <button className="center-button" onClick={() => patchPlacement({ mode: "manual", offsetX: 0, offsetY: 0 })} disabled={!hasPhotos}><Maximize size={15} /> Center selected photo</button>
          <label>Zoom <output>{Math.round(activePlacement.scale * 100)}%</output></label>
          <input type="range" min="0.2" max="4" step="0.01" value={activePlacement.scale} onChange={(event) => patchPlacement({ mode: "manual", scale: Number(event.target.value) })} />
          <div className="rotate-row">
            <button onClick={() => patchPlacement({ rotationDeg: activePlacement.rotationDeg - 90 })}><RotateCcw size={16} /> −90°</button>
            <button onClick={() => patchPlacement({ rotationDeg: activePlacement.rotationDeg + 90 })}><RotateCw size={16} /> +90°</button>
          </div>
          <label className="switch-row"><span><Magnet size={14} /> Snap to cell center</span><input type="checkbox" checked={snapEnabled} onChange={(event) => setSnapEnabled(event.target.checked)} /></label>
        </section>

        <section>
          <h2>Output</h2>
          <label>File type<select value={exportType} onChange={(event) => setExportType(event.target.value as "jpeg" | "png")}><option value="jpeg">JPEG</option><option value="png">PNG</option></select></label>
          <label>Outer border <output>{edit.borderMm} mm</output></label>
          <input type="range" min="0" max="20" step="1" value={edit.borderMm} onChange={(event) => setEdit((old) => ({ ...old, borderMm: Number(event.target.value) }))} />
          <label>DPI <select value={edit.dpi} onChange={(event) => setEdit((old) => ({ ...old, dpi: Number(event.target.value) }))}><option>240</option><option>300</option><option>360</option><option>600</option></select></label>
          <p className="dimensions">{outputSize(edit).width} × {outputSize(edit).height} px</p>
        </section>
      </aside>

      <div className="workspace">
        <div className="canvas-label">{layoutMode === "grid4" ? `2 × 2 collage · ${slots.filter((slot) => slot.preview).length}/4 photos` : (edit.sourcePath.split(/[\\/]/).pop() || "Untitled")}<span>{Math.round(activePlacement.scale * 100)}%</span></div>
        <div className="print-frame" style={{ aspectRatio: frameRatio, padding: `${(edit.borderMm / size.widthMm) * 100}%` }}>
          <div className={`content-mask ${layoutMode === "grid4" ? "photo-grid" : "single-photo"}`} style={layoutMode === "grid4" ? { gap: `${gapMm / contentWidthMm * 100}%` } : undefined}>
            {layoutMode === "single" ? (
              <PhotoCell index={-1} preview={preview} placement={edit.placement} selected snapEnabled={snapEnabled} onSelect={() => {}} onChoose={() => void chooseFile("single")} onPatch={(patch) => setEdit((old) => ({ ...old, placement: { ...old.placement, ...patch } }))} />
            ) : slots.map((slot, index) => (
              <PhotoCell key={index} index={index} preview={slot.preview} placement={slot.placement} selected={selectedSlot === index} snapEnabled={snapEnabled} onSelect={() => setSelectedSlot(index)} onChoose={() => void chooseFile(index)} onPatch={(patch) => patchSlot(index, patch)} />
            ))}
          </div>
        </div>
        {busy && <div className="busy"><LoaderCircle className="spinner" /> {busy}</div>}
        <div className="canvas-hint"><Magnet size={13} /> Drag near the center of a cell to snap to either axis</div>
      </div>
    </main>
  );
}
