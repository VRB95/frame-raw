from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class Format:
    width_mm: float
    height_mm: float
    orientation: str


@dataclass(frozen=True)
class Placement:
    mode: str
    scale: float
    offset_x: float
    offset_y: float
    rotation_deg: float


@dataclass(frozen=True)
class ExportRequest:
    source_path: str
    output_path: str
    format: Format
    placement: Placement
    border_mm: float
    dpi: int

    @classmethod
    def from_dict(cls, value: dict[str, Any]) -> "ExportRequest":
        fmt = value["format"]
        placement = value["placement"]
        return cls(
            source_path=value["sourcePath"],
            output_path=value["outputPath"],
            format=Format(float(fmt["widthMm"]), float(fmt["heightMm"]), fmt["orientation"]),
            placement=Placement(
                placement["mode"],
                float(placement["scale"]),
                float(placement["offsetX"]),
                float(placement["offsetY"]),
                float(placement["rotationDeg"]),
            ),
            border_mm=float(value["borderMm"]),
            dpi=int(value["dpi"]),
        )
