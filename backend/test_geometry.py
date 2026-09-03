import unittest
import tempfile
from pathlib import Path

from PIL import Image

from export import export_image
from geometry import calculate_geometry, mm_to_pixels
from models import ExportRequest, Format, Photo, Placement
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

    def test_four_photo_grid_export_with_inner_gap(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            colors = ("#d92525", "#25a844", "#255bd9", "#e2b526")
            sources = []
            for index, color in enumerate(colors):
                source = root / f"source-{index}.jpg"
                Image.new("RGB", (80, 80), color).save(source, quality=100)
                sources.append(source)
            output = root / "grid.png"
            photos = tuple(
                Photo(str(source), Placement("fill", 1, 0, 0, 0))
                for source in sources
            )
            request = ExportRequest(
                str(sources[0]), str(output), Format(25.4, 25.4, "portrait"),
                Placement("fill", 1, 0, 0, 0), 2.54, 100, "grid4", 2.54, photos,
            )
            export_image(request)
            with Image.open(output) as rendered:
                self.assertEqual(rendered.size, (100, 100))
                red, green, blue, yellow = (
                    rendered.getpixel((25, 25)), rendered.getpixel((75, 25)),
                    rendered.getpixel((25, 75)), rendered.getpixel((75, 75)),
                )
                self.assertGreater(red[0], red[1] + 100)
                self.assertGreater(green[1], green[0] + 40)
                self.assertGreater(blue[2], blue[0] + 100)
                self.assertGreater(yellow[0] + yellow[1], yellow[2] + 200)
                self.assertGreater(sum(rendered.getpixel((50, 50))), 720)


if __name__ == "__main__":
    unittest.main()
