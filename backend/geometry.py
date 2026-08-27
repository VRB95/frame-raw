from dataclasses import dataclass
from models import ExportRequest


def mm_to_pixels(mm: float, dpi: int) -> int:
    return round(mm / 25.4 * dpi)


@dataclass(frozen=True)
class RenderGeometry:
    output_width: int
    output_height: int
    content_width: int
    content_height: int
    border_px: int
    scaled_width: int
    scaled_height: int
    center_x: float
    center_y: float


def calculate_geometry(request: ExportRequest, source_width: int, source_height: int) -> RenderGeometry:
    short = min(request.format.width_mm, request.format.height_mm)
    long = max(request.format.width_mm, request.format.height_mm)
    width_mm, height_mm = (short, long) if request.format.orientation == "portrait" else (long, short)
    output_width = mm_to_pixels(width_mm, request.dpi)
    output_height = mm_to_pixels(height_mm, request.dpi)
    border_px = max(0, mm_to_pixels(request.border_mm, request.dpi))
    border_px = min(border_px, (min(output_width, output_height) - 1) // 2)
    content_width = output_width - border_px * 2
    content_height = output_height - border_px * 2

    if request.placement.mode == "center":
        base = 1.0
    elif request.placement.mode == "fit":
        base = min(content_width / source_width, content_height / source_height)
    else:
        base = max(content_width / source_width, content_height / source_height)
    scale = max(0.001, base * request.placement.scale)
    scaled_width = max(1, round(source_width * scale))
    scaled_height = max(1, round(source_height * scale))
    center_x = border_px + content_width * (0.5 + request.placement.offset_x)
    center_y = border_px + content_height * (0.5 + request.placement.offset_y)
    return RenderGeometry(output_width, output_height, content_width, content_height, border_px, scaled_width, scaled_height, center_x, center_y)
