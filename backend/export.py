from pathlib import Path
import logging

from PIL import Image

from geometry import calculate_geometry, mm_to_pixels
from imaging import convert_to_srgb, read_source
from models import ExportRequest

logger = logging.getLogger("frameraw.export")


def _transform_for_box(source: Image.Image, placement, width: int, height: int) -> Image.Image:
    if placement.mode == "center":
        base = 1.0
    elif placement.mode == "fit":
        base = min(width / source.width, height / source.height)
    else:
        base = max(width / source.width, height / source.height)
    scale = max(0.001, base * placement.scale)
    transformed = source.resize(
        (max(1, round(source.width * scale)), max(1, round(source.height * scale))),
        Image.Resampling.LANCZOS,
    )
    if placement.rotation_deg % 360:
        transformed = transformed.rotate(-placement.rotation_deg, Image.Resampling.BICUBIC, expand=True)
    return transformed


def _paint_photo(canvas: Image.Image, source: Image.Image, placement, box: tuple[int, int, int, int]) -> None:
    left, top, right, bottom = box
    width, height = max(1, right - left), max(1, bottom - top)
    transformed = _transform_for_box(source, placement, width, height)
    cell = Image.new("RGB", (width, height), "white")
    x = round(width * (0.5 + placement.offset_x) - transformed.width / 2)
    y = round(height * (0.5 + placement.offset_y) - transformed.height / 2)
    cell.paste(transformed, (x, y))
    canvas.paste(cell, (left, top))


def _output_geometry(request: ExportRequest) -> tuple[int, int, int]:
    short = min(request.format.width_mm, request.format.height_mm)
    long = max(request.format.width_mm, request.format.height_mm)
    width_mm, height_mm = (short, long) if request.format.orientation == "portrait" else (long, short)
    width, height = mm_to_pixels(width_mm, request.dpi), mm_to_pixels(height_mm, request.dpi)
    border = min(max(0, mm_to_pixels(request.border_mm, request.dpi)), (min(width, height) - 1) // 2)
    return width, height, border


def export_image(request: ExportRequest) -> dict[str, int | str]:
    logger.info("Starting export source=%s output=%s dpi=%d", request.source_path, request.output_path, request.dpi)
    if request.layout_mode == "grid4":
        output_width, output_height, border = _output_geometry(request)
        canvas = Image.new("RGB", (output_width, output_height), "white")
        content_width, content_height = output_width - border * 2, output_height - border * 2
        gap = min(
            max(0, mm_to_pixels(request.gap_mm, request.dpi)),
            max(0, min(content_width, content_height) - 2),
        )
        left_width = (content_width - gap) // 2
        top_height = (content_height - gap) // 2
        boxes = (
            (border, border, border + left_width, border + top_height),
            (border + left_width + gap, border, output_width - border, border + top_height),
            (border, border + top_height + gap, border + left_width, output_height - border),
            (border + left_width + gap, border + top_height + gap, output_width - border, output_height - border),
        )
        for photo, box in zip(request.photos[:4], boxes):
            if not photo.source_path:
                continue
            source = convert_to_srgb(read_source(photo.source_path, preview=False))
            _paint_photo(canvas, source, photo.placement, box)
        logger.info("Grid render output=%dx%d border=%d gap=%d photos=%d", output_width, output_height, border, gap, len(request.photos))
    else:
        source = convert_to_srgb(read_source(request.source_path, preview=False))
        geometry = calculate_geometry(request, source.width, source.height)
        canvas = Image.new("RGB", (geometry.output_width, geometry.output_height), "white")
        transformed = _transform_for_box(source, request.placement, geometry.content_width, geometry.content_height)
        x = round(geometry.center_x - transformed.width / 2)
        y = round(geometry.center_y - transformed.height / 2)
        layer = Image.new("RGB", canvas.size, "white")
        layer.paste(transformed, (x, y))
        crop_box = (geometry.border_px, geometry.border_px, geometry.output_width - geometry.border_px, geometry.output_height - geometry.border_px)
        canvas.paste(layer.crop(crop_box), crop_box[:2])

    destination = Path(request.output_path)
    destination.parent.mkdir(parents=True, exist_ok=True)
    if destination.suffix.lower() == ".png":
        canvas.save(destination, "PNG", compress_level=6, optimize=True, dpi=(request.dpi, request.dpi))
        file_type = "PNG"
    else:
        canvas.save(destination, "JPEG", quality=98, subsampling=0, optimize=True, dpi=(request.dpi, request.dpi))
        file_type = "JPEG"
    logger.info("%s export saved path=%s dimensions=%dx%d", file_type, destination, canvas.width, canvas.height)
    return {"path": str(destination.resolve()), "width": canvas.width, "height": canvas.height}
