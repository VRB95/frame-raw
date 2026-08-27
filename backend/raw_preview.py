from pathlib import Path
import logging

from PIL import Image

from imaging import convert_to_srgb, read_source

logger = logging.getLogger("frameraw.preview")


def generate_preview(source_path: str, output_path: str, max_edge: int = 1800) -> dict[str, int | str]:
    logger.info("Generating preview source=%s output=%s max_edge=%d", source_path, output_path, max_edge)
    image = convert_to_srgb(read_source(source_path, preview=True))
    image.thumbnail((max_edge, max_edge), Image.Resampling.LANCZOS)
    destination = Path(output_path)
    destination.parent.mkdir(parents=True, exist_ok=True)
    image.save(destination, "JPEG", quality=90, optimize=True, icc_profile=None)
    logger.info("Preview saved dimensions=%dx%d", image.width, image.height)
    return {"path": str(destination.resolve()), "width": image.width, "height": image.height}
