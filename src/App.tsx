import { useEffect, useMemo, useRef, useState } from "react";
import { convertFileSrc, invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { open, save } from "@tauri-apps/plugin-dialog";
import { Download, ImagePlus, LoaderCircle, RotateCcw, RotateCw } from "lucide-react";
import { baseScale, orientedSize, outputSize } from "./lib/geometry";
import type { EditState, PlacementMode, PreviewResult } from "./types";

const initialState: EditState = {
  sourcePath: "",
  format: { widthMm: 150, heightMm: 210, orientation: "portrait" },
  placement: { mode: "fill", scale: 1, offsetX: 0, offsetY: 0, rotationDeg: 0 },
  borderMm: 0,
  dpi: 300,
};

const presets = [
  { label: "10 × 15", widthMm: 100, heightMm: 150 },
  { label: "13 × 18", widthMm: 130, heightMm: 180 },
  { label: "15 × 21", widthMm: 150, heightMm: 210 },
];

export default function App() {
  const [edit, setEdit] = useState(initialState);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [exportType, setExportType] = useState<"jpeg" | "png">("jpeg");
  const [message, setMessage] = useState("Drop a RAW file here or choose one");
  const [frameSize, setFrameSize] = useState({ width: 0, height: 0 });
  const frameRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const resize = useRef<{ centerX: number; centerY: number; distance: number; scale: number } | null>(null);

  const loadRaw = async (path: string) => {
    setBusy("Decoding preview…");
    setMessage("");
    try {
      const result = await invoke<PreviewResult>("generate_preview", { sourcePath: path });
      setEdit((old) => ({ ...old, sourcePath: path, placement: { ...initialState.placement } }));
      setPreview(result);
    } catch (error) {
      setMessage(String(error));
    } finally {
      setBusy(null);
    }
  };

  useEffect(() => {
    if (!isTauri()) return;
    let unlisten: (() => void) | undefined;
    getCurrentWebview()
      .onDragDropEvent((event) => {
        if (event.payload.type === "drop") {
          const path = event.payload.paths.find((candidate) => /\.(arw|dng|nef|cr2|cr3|raf|orf|rw2|jpg|jpeg|png|tif|tiff)$/i.test(candidate));
          if (path) void loadRaw(path);
        }
      })
      .then((fn) => {
        unlisten = fn;
      });
    return () => unlisten?.();
  }, []);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setFrameSize({ width, height });
    });
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!isTauri()) return;
    let unlisten: (() => void) | undefined;
    listen<string>("backend-log", (event) => console.info(event.payload)).then((fn) => {
      unlisten = fn;
    });
    return () => unlisten?.();
  }, []);

  const chooseFile = async () => {
    if (!isTauri()) {
      setMessage("RAW selection is available in the Tauri app (`npm run tauri dev`).");
      return;
    }
    const path = await open({
      multiple: false,
      filters: [{ name: "RAW photos", extensions: ["arw", "dng", "nef", "cr2", "cr3", "raf", "orf", "rw2", "jpg", "jpeg", "png", "tif", "tiff"] }],
    });
    if (typeof path === "string") await loadRaw(path);
  };

  const exportImage = async () => {
    if (!edit.sourcePath || !isTauri()) return;
    const extension = exportType === "png" ? "png" : "jpg";
    const suggested = edit.sourcePath.replace(/\.[^.]+$/, `-framed.${extension}`);
    const selectedPath = await save({
      defaultPath: suggested,
      filters: exportType === "png" ? [{ name: "PNG", extensions: ["png"] }] : [{ name: "JPEG", extensions: ["jpg", "jpeg"] }],
    });
    if (!selectedPath) return;
    const outputPath = selectedPath.toLowerCase().endsWith(`.${extension}`) ? selectedPath : `${selectedPath}.${extension}`;
    setBusy(`Exporting ${exportType.toUpperCase()}…`);
    console.info("[FrameRaw] Export request", { source: edit.sourcePath, output: outputPath, type: exportType, dpi: edit.dpi });
    try {
      await invoke("export_image", { request: { ...edit, outputPath } });
      setMessage(`Export complete: ${outputPath}`);
      console.info("[FrameRaw] Export complete", outputPath);
    } catch (error) {
      setMessage(String(error));
    } finally {
      setBusy(null);
    }
  };

  const size = orientedSize(edit.format);
  const frameRatio = size.widthMm / size.heightMm;
  const imageTransform = useMemo(() => {
    if (!preview || !frameSize.width) return undefined;
    const borderX = (edit.borderMm / size.widthMm) * frameSize.width;
    const borderY = (edit.borderMm / size.heightMm) * frameSize.height;
    const contentW = Math.max(1, frameSize.width - borderX * 2);
    const contentH = Math.max(1, frameSize.height - borderY * 2);
    const base = baseScale(edit.placement.mode, preview.width, preview.height, contentW, contentH);
    const scale = base * edit.placement.scale;
    return {
      style: {
        width: preview.width,
        height: preview.height,
        transform: `translate(-50%, -50%) translate(${edit.placement.offsetX * contentW}px, ${edit.placement.offsetY * contentH}px) rotate(${edit.placement.rotationDeg}deg) scale(${scale})`,
      },
      scale,
    };
  }, [preview, edit, size.widthMm, size.heightMm, frameSize]);

  const patchPlacement = (patch: Partial<EditState["placement"]>) => setEdit((old) => ({ ...old, placement: { ...old.placement, ...patch } }));

  const startDrag = (event: React.PointerEvent) => {
    if (!preview) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX, y: event.clientY, ox: edit.placement.offsetX, oy: edit.placement.offsetY };
  };

  const moveDrag = (event: React.PointerEvent) => {
    if (!drag.current || !frameRef.current) return;
    const box = frameRef.current.getBoundingClientRect();
    patchPlacement({
      mode: "manual",
      offsetX: drag.current.ox + (event.clientX - drag.current.x) / box.width,
      offsetY: drag.current.oy + (event.clientY - drag.current.y) / box.height,
    });
  };

  const startResize = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const bounds = event.currentTarget.parentElement!.getBoundingClientRect();
    const centerX = bounds.left + bounds.width / 2;
    const centerY = bounds.top + bounds.height / 2;
    resize.current = {
      centerX,
      centerY,
      distance: Math.max(1, Math.hypot(event.clientX - centerX, event.clientY - centerY)),
      scale: edit.placement.scale,
    };
  };

  const moveResize = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!resize.current) return;
    event.stopPropagation();
    const distance = Math.hypot(event.clientX - resize.current.centerX, event.clientY - resize.current.centerY);
    const scale = Math.min(4, Math.max(0.2, (resize.current.scale * distance) / resize.current.distance));
    patchPlacement({ mode: "manual", scale });
  };

  return (
    <main className="app-shell">
      <header>
        <div className="brand">
          <span>F</span> FrameRaw
        </div>
        <div className="status">{busy ?? message}</div>
        <button className="primary" disabled={!preview || !!busy} onClick={exportImage}>
          <Download size={17} /> Export {exportType.toUpperCase()}
        </button>
      </header>

      <aside>
        <section>
          <h2>Print format</h2>
          <div className="preset-grid">
            {presets.map((preset) => (
              <button
                key={preset.label}
                className={edit.format.widthMm === preset.widthMm && edit.format.heightMm === preset.heightMm ? "active" : ""}
                onClick={() => setEdit((old) => ({ ...old, format: { ...old.format, ...preset } }))}
              >
                {preset.label}
                <small>cm</small>
              </button>
            ))}
          </div>
          <div className="segmented">
            {(["portrait", "landscape"] as const).map((orientation) => (
              <button
                className={edit.format.orientation === orientation ? "active" : ""}
                key={orientation}
                onClick={() => setEdit((old) => ({ ...old, format: { ...old.format, orientation } }))}
              >
                {orientation === "portrait" ? "Portrait" : "Landscape"}
              </button>
            ))}
          </div>
        </section>

        <section>
          <h2>Framing</h2>
          <div className="segmented thirds">
            {(["fill", "fit", "center"] as PlacementMode[]).map((mode) => (
              <button
                className={edit.placement.mode === mode ? "active" : ""}
                key={mode}
                onClick={() => patchPlacement({ mode, scale: 1, offsetX: 0, offsetY: 0 })}
              >
                {mode[0].toUpperCase() + mode.slice(1)}
              </button>
            ))}
          </div>
          <label>
            Zoom <output>{Math.round(edit.placement.scale * 100)}%</output>
          </label>
          <input
            type="range"
            min="0.2"
            max="4"
            step="0.01"
            value={edit.placement.scale}
            onChange={(e) => patchPlacement({ mode: "manual", scale: Number(e.target.value) })}
          />
          <div className="rotate-row">
            <button onClick={() => patchPlacement({ rotationDeg: edit.placement.rotationDeg - 90 })}>
              <RotateCcw size={16} /> −90°
            </button>
            <button onClick={() => patchPlacement({ rotationDeg: edit.placement.rotationDeg + 90 })}>
              <RotateCw size={16} /> +90°
            </button>
          </div>
        </section>

        <section>
          <h2>Output</h2>
          <label>
            File type
            <select value={exportType} onChange={(e) => setExportType(e.target.value as "jpeg" | "png")}>
              <option value="jpeg">JPEG</option>
              <option value="png">PNG</option>
            </select>
          </label>
          <label>
            Border <output>{edit.borderMm} mm</output>
          </label>
          <input
            type="range"
            min="0"
            max="20"
            step="1"
            value={edit.borderMm}
            onChange={(e) => setEdit((old) => ({ ...old, borderMm: Number(e.target.value) }))}
          />
          <label>
            DPI{" "}
            <select value={edit.dpi} onChange={(e) => setEdit((old) => ({ ...old, dpi: Number(e.target.value) }))}>
              <option>240</option>
              <option>300</option>
              <option>360</option>
              <option>600</option>
            </select>
          </label>
          <p className="dimensions">
            {outputSize(edit).width} × {outputSize(edit).height} px
          </p>
        </section>
      </aside>

      <div className="workspace">
        <div
          className="print-frame"
          ref={frameRef}
          style={{ aspectRatio: frameRatio, padding: `${(edit.borderMm / size.widthMm) * 100}%` }}
          onPointerDown={startDrag}
          onPointerMove={moveDrag}
          onPointerUp={() => {
            drag.current = null;
          }}
        >
          <div className="content-mask">
            {preview && imageTransform ? (
              <>
                <img className="outside-photo" draggable={false} src={convertFileSrc(preview.path)} style={imageTransform.style} />
                <div className="inside-clip">
                  <img draggable={false} src={convertFileSrc(preview.path)} style={imageTransform.style} />
                </div>
                <div
                  className="selection-box"
                  style={{ ...imageTransform.style, outlineWidth: `${1 / imageTransform.scale}px` }}
                  onPointerDown={startDrag}
                  onPointerMove={moveDrag}
                  onPointerUp={() => {
                    drag.current = null;
                  }}
                >
                  {(["nw", "ne", "se", "sw"] as const).map((corner) => (
                    <button
                      key={corner}
                      className={`resize-handle ${corner}`}
                      aria-label={`Resize from ${corner} corner`}
                      style={{
                        width: `${12 / imageTransform.scale}px`,
                        height: `${12 / imageTransform.scale}px`,
                        borderWidth: `${2 / imageTransform.scale}px`,
                      }}
                      onPointerDown={startResize}
                      onPointerMove={moveResize}
                      onPointerUp={(event) => {
                        event.stopPropagation();
                        resize.current = null;
                      }}
                    />
                  ))}
                </div>
              </>
            ) : (
              <button className="empty-state" onClick={chooseFile}>
                <ImagePlus size={38} />
                <strong>Import a RAW photo</strong>
                <span>ARW, DNG, NEF, CR2 and more</span>
              </button>
            )}
          </div>
        </div>
        {busy && (
          <div className="busy">
            <LoaderCircle className="spinner" /> {busy}
          </div>
        )}
      </div>
    </main>
  );
}
