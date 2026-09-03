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
class Photo:
    source_path: str
    placement: Placement


@dataclass(frozen=True)
class ExportRequest:
    source_path: str
    output_path: str
    format: Format
    placement: Placement
    border_mm: float
    dpi: int
    layout_mode: str = "single"
    gap_mm: float = 0
    photos: tuple[Photo, ...] = ()

    @classmethod
    def from_dict(cls, value: dict[str, Any]) -> "ExportRequest":
        fmt = value["format"]
        placement = value["placement"]
        def parse_placement(item: dict[str, Any]) -> Placement:
            return Placement(
                item["mode"],
                float(item["scale"]),
                float(item["offsetX"]),
                float(item["offsetY"]),
                float(item["rotationDeg"]),
            )

        parsed_placement = parse_placement(placement)
        photos = tuple(
            Photo(photo["sourcePath"], parse_placement(photo["placement"]))
            for photo in value.get("photos", [])
        )
        return cls(
            source_path=value["sourcePath"],
            output_path=value["outputPath"],
            format=Format(float(fmt["widthMm"]), float(fmt["heightMm"]), fmt["orientation"]),
            placement=parsed_placement,
            border_mm=float(value["borderMm"]),
            dpi=int(value["dpi"]),
            layout_mode=value.get("layoutMode", "single"),
            gap_mm=float(value.get("gapMm", 0)),
            photos=photos,
        )
