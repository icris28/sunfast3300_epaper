"""Entry point for the desktop simulation."""

from __future__ import annotations

import argparse
import json
import time
import webbrowser

from .core import RaceEngine
from .server import SnapshotServer
from .simulator import FleetSimulator


def main() -> None:
    parser = argparse.ArgumentParser(description="Sun Fast 3300 AIS / virtual E1001")
    parser.add_argument("--speed", type=float, default=1, help="Simulation seconds per real second (default: 1)")
    parser.add_argument("--port", type=int, default=8765, help="Local JSON HTTP port (default: 8765)")
    parser.add_argument("--no-server", action="store_true", help="Disable local JSON endpoint")
    parser.add_argument("--tk", action="store_true", help="Use optional Tkinter window instead of browser")
    parser.add_argument("--headless", type=int, metavar="SECONDS", help="Run without window and print final JSON")
    args = parser.parse_args()
    if args.speed <= 0:
        parser.error("--speed must be positive")
    sim, engine = FleetSimulator(), RaceEngine()
    own, targets = sim.observations()
    engine.ingest(own, targets)
    if args.headless is not None:
        if args.headless < 0:
            parser.error("--headless must be nonnegative")
        for _ in range(args.headless):
            own, targets = sim.step(args.speed)
            engine.ingest(own, targets)
        print(json.dumps(engine.snapshot(), indent=2))
        return

    if args.tk:
        import tkinter as tk
        from .ui import Display

        root = tk.Tk()
        display = Display(root, None)
        server = None if args.no_server else SnapshotServer(port=args.port)
        if server:
            server.start()

        def tick():
            own, targets = sim.step(args.speed)
            engine.ingest(own, targets)
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
    print(f"Afficheur E1001 virtuel : {url}  (Ctrl+C pour arrêter)", flush=True)
    webbrowser.open(url)
    try:
        while True:
            time.sleep(1)
            own, targets = sim.step(args.speed)
            engine.ingest(own, targets)
            server.update(engine.snapshot())
    except KeyboardInterrupt:
        pass
    finally:
        server.close()


if __name__ == "__main__":
    main()
