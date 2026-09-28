"""Entry point for the desktop simulation."""

from __future__ import annotations

import argparse
import json
import math
import time
import webbrowser

from .core import RaceEngine
from .server import SnapshotServer
from .simulator import FleetSimulator


def main() -> None:
    parser = argparse.ArgumentParser(description="Sun Fast 3300 AIS / virtual TRMNL and E1001")
    parser.add_argument("--speed", type=float, default=1, help="Simulation seconds per real second (default: 1)")
    parser.add_argument("--port", type=int, default=8765, help="Local JSON HTTP port (default: 8765)")
    parser.add_argument("--no-server", action="store_true", help="Disable local JSON endpoint")
    parser.add_argument("--tk", action="store_true", help="Use optional Tkinter window instead of browser")
    parser.add_argument("--no-browser", action="store_true", help="Do not automatically open the browser")
    parser.add_argument("--headless", type=int, metavar="SECONDS", help="Run without window and print final JSON")
    args = parser.parse_args()
    if not math.isfinite(args.speed) or not 0 < args.speed <= 100:
        parser.error("--speed must be finite and between 0 and 100")
    sim, engine = FleetSimulator(), RaceEngine()
    own, targets = sim.observations()
    engine.ingest(own, targets)
    if args.headless is not None:
        if args.headless < 0:
            parser.error("--headless must be nonnegative")
        for _ in range(args.headless):
            own, targets = sim.step(1)
            engine.ingest(own, targets)
        print(json.dumps(engine.snapshot(), indent=2))
        return

    last_tick, accumulator = time.monotonic(), 0.0

    def advance():
        nonlocal last_tick, accumulator
        now = time.monotonic()
        accumulator += (now - last_tick) * args.speed
        last_tick = now
        # Speed changes sample cadence in real time, never the one-second AIS step.
        while accumulator >= 1:
            engine.ingest(*sim.step(1))
            accumulator -= 1

    if args.tk:
        import tkinter as tk
        from .ui import Display

        root = tk.Tk()
        display = Display(root, None)
        server = None if args.no_server else SnapshotServer(port=args.port)
        if server:
            server.update(engine.snapshot())
            server.start()

        def tick():
            advance()
            snapshot = engine.snapshot()
            display.update(snapshot)
            if server:
                server.update(snapshot)
            root.after(1000, tick)

        def close():
            if server:
                server.close()
            root.destroy()

        root.protocol("WM_DELETE_WINDOW", close)
        display.update(engine.snapshot())
        tick()
        root.mainloop()
        return

    if args.no_server:
        parser.error("--no-server requires --tk")
    server = SnapshotServer(port=args.port)
    server.update(engine.snapshot())
    server.start()
    url = f"http://127.0.0.1:{args.port}/"
    print(f"Afficheur TRMNL / E1001 virtuel : {url}  (Ctrl+C pour arrêter)", flush=True)
    if not args.no_browser:
        webbrowser.open(url)
    try:
        while True:
            time.sleep(1)
            advance()
            server.update(engine.snapshot())
    except KeyboardInterrupt:
        pass
    finally:
        server.close()


if __name__ == "__main__":
    main()
