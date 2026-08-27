import unittest
import tempfile
from pathlib import Path

from PIL import Image

from export import export_image
from geometry import calculate_geometry, mm_to_pixels
from models import ExportRequest, Format, Placement
from raw_preview import generate_preview


class GeometryTests(unittest.TestCase):
    def test_print_size(self):
        self.assertEqual(mm_to_pixels(150, 300), 1772)
        self.assertEqual(mm_to_pixels(210, 300), 2480)

    def test_fill_geometry(self):
        request = ExportRequest("in.jpg", "out.jpg", Format(150, 210, "portrait"), Placement("fill", 1, 0, 0, 0), 10, 300)
        result = calculate_geometry(request, 6000, 4000)
        self.assertEqual((result.output_width, result.output_height), (1772, 2480))
        self.assertGreaterEqual(result.scaled_height, result.content_height)

    def test_preview_and_export_pipeline(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "source.jpg"
            preview = Path(directory) / "preview.jpg"
            output = Path(directory) / "output.jpg"
            Image.new("RGB", (800, 400), "#c45136").save(source, quality=95)

            preview_result = generate_preview(str(source), str(preview), max_edge=300)
            self.assertEqual((preview_result["width"], preview_result["height"]), (300, 150))

            request = ExportRequest(
                str(source), str(output), Format(25.4, 50.8, "portrait"),
                Placement("fit", 1, 0, 0, 0), 2.54, 100,
            )
            export_result = export_image(request)
            self.assertEqual((export_result["width"], export_result["height"]), (100, 200))
            with Image.open(output) as rendered:
                self.assertEqual(rendered.size, (100, 200))
                self.assertGreater(sum(rendered.getpixel((0, 0))), 720)
                self.assertGreater(rendered.getpixel((50, 100))[0], rendered.getpixel((50, 100))[1])

    def test_png_export(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "source.jpg"
            output = Path(directory) / "output.png"
            Image.new("RGB", (200, 100), "#456b8a").save(source)
            request = ExportRequest(
                str(source), str(output), Format(25.4, 25.4, "portrait"),
                Placement("fill", 1, 0, 0, 0), 0, 100,
            )
            export_image(request)
            with Image.open(output) as rendered:
                self.assertEqual(rendered.format, "PNG")
                self.assertEqual(rendered.size, (100, 100))


if __name__ == "__main__":
    unittest.main()
