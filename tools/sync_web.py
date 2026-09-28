"""Copy the shared renderer to /docs; no bundler or third-party dependencies."""
from pathlib import Path
import argparse
import sys

ROOT = Path(__file__).resolve().parents[1]
NAMES = ("index.html", "style.css", "core.js", "epaper.js", "renderer.js", "app.js")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Fail if committed docs assets differ")
    args = parser.parse_args()
    source, target = ROOT / "src/ais_race/static", ROOT / "docs"
    bad = []
    for name in (*NAMES, ".nojekyll"):
        expected = (source / name).read_bytes() if name != ".nojekyll" else b""
        dest = target / name
        if args.check:
            if not dest.is_file() or dest.read_bytes() != expected:
                bad.append(name)
        else:
            target.mkdir(exist_ok=True)
            dest.write_bytes(expected)
    if bad:
        print("Out-of-date docs assets: " + ", ".join(bad), file=sys.stderr)
        return 1
    print("Web assets match /docs." if args.check else "Static GitHub Pages site ready in /docs.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
