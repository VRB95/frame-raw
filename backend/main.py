import argparse
import json
import logging
import sys

from export import export_image
from models import ExportRequest
from raw_preview import generate_preview

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
    stream=sys.stderr,
)
logger = logging.getLogger("frameraw")


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser(prog="frameraw-backend")
    subcommands = result.add_subparsers(dest="command", required=True)
    preview = subcommands.add_parser("preview")
    preview.add_argument("--input", required=True)
    preview.add_argument("--output", required=True)
    export = subcommands.add_parser("export")
    export.add_argument("--request", required=True, help="JSON export request")
    return result


def main() -> int:
    args = parser().parse_args()
    logger.info("Backend command started command=%s", args.command)
    try:
        if args.command == "preview":
            result = generate_preview(args.input, args.output)
        else:
            result = export_image(ExportRequest.from_dict(json.loads(args.request)))
        print(json.dumps({"ok": True, "result": result}, ensure_ascii=False))
        logger.info("Backend command completed command=%s", args.command)
        return 0
    except Exception as exc:
        logger.exception("Backend command failed command=%s", args.command)
        print(json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False))
        return 1


if __name__ == "__main__":
    sys.exit(main())
