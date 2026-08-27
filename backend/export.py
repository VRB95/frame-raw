from pathlib import Path
import logging

from PIL import Image

from geometry import calculate_geometry
from imaging import convert_to_srgb, read_source
from models import ExportRequest

logger = logging.getLogger("frameraw.export")


def export_image(request: ExportRequest) -> dict[str, int | str]:
    logger.info("Starting export source=%s output=%s dpi=%d", request.source_path, request.output_path, request.dpi)
    source = convert_to_srgb(read_source(request.source_path, preview=False))
    geometry = calculate_geometry(request, source.width, source.height)
    logger.info(
        "Render geometry output=%dx%d content=%dx%d scaled=%dx%d border=%d",
        geometry.output_width, geometry.output_height, geometry.content_width, geometry.content_height,
        geometry.scaled_width, geometry.scaled_height, geometry.border_px,
    )

    # This is the only image resampling pass in the export pipeline.
    transformed = source.resize((geometry.scaled_width, geometry.scaled_height), Image.Resampling.LANCZOS)
    if request.placement.rotation_deg % 360:
        transformed = transformed.rotate(-request.placement.rotation_deg, Image.Resampling.BICUBIC, expand=True)

    canvas = Image.new("RGB", (geometry.output_width, geometry.output_height), "white")
    x = round(geometry.center_x - transformed.width / 2)
    y = round(geometry.center_y - transformed.height / 2)

    # Paste through a content-sized mask so Fit never paints into the requested border.
    layer = Image.new("RGB", canvas.size, "white")
    layer.paste(transformed, (x, y))
    crop_box = (
        geometry.border_px,
        geometry.border_px,
        geometry.output_width - geometry.border_px,
        geometry.output_height - geometry.border_px,
    )
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
