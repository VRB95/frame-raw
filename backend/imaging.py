from pathlib import Path
from typing import Any
import logging

import numpy as np
from PIL import Image, ImageCms, ImageOps

RAW_EXTENSIONS = {".arw", ".dng", ".nef", ".cr2", ".cr3", ".raf", ".orf", ".rw2"}
logger = logging.getLogger("frameraw.imaging")


def _rawpy() -> Any:
    try:
        import rawpy
        return rawpy
    except ImportError as exc:
        raise RuntimeError("RAW support is missing. Install backend/requirements.txt or rebuild the sidecar.") from exc


def read_source(path: str, *, preview: bool) -> Image.Image:
    source = Path(path)
    logger.info("Opening source path=%s preview=%s", source, preview)
    if not source.exists():
        raise FileNotFoundError(f"File does not exist: {path}")
    if source.suffix.lower() in RAW_EXTENSIONS:
        rawpy = _rawpy()
        logger.info("Decoding RAW with LibRaw output_bps=%d", 8 if preview else 16)
        with rawpy.imread(str(source)) as raw:
            rgb = raw.postprocess(
                use_camera_wb=True,
                output_color=rawpy.ColorSpace.sRGB,
                output_bps=8 if preview else 16,
                no_auto_bright=False,
                half_size=preview,
            )
        if rgb.dtype == np.uint16:
            # Keep the RAW decode at 16-bit; quantize only at the JPEG rendering boundary.
            rgb = ((rgb.astype(np.uint32) + 128) // 257).astype(np.uint8)
        image = Image.fromarray(rgb, "RGB")
        logger.info("RAW decoded dimensions=%dx%d", image.width, image.height)
        return image

    image = ImageOps.exif_transpose(Image.open(source))
    if image.mode not in ("RGB", "RGBA"):
        image = image.convert("RGB")
    logger.info("Raster image loaded dimensions=%dx%d mode=%s", image.width, image.height, image.mode)
    return image


def convert_to_srgb(image: Image.Image) -> Image.Image:
    icc = image.info.get("icc_profile")
    if not icc:
        return image.convert("RGB")
    try:
        import io
        source_profile = ImageCms.ImageCmsProfile(io.BytesIO(icc))
        target_profile = ImageCms.createProfile("sRGB")
        return ImageCms.profileToProfile(image, source_profile, target_profile, outputMode="RGB")
    except Exception:
        return image.convert("RGB")
