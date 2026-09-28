import json
import unittest
from urllib.error import HTTPError
from urllib.request import urlopen

from ais_race.server import SnapshotServer
from ais_race.core import RaceEngine
from ais_race.simulator import FleetSimulator


class WebServerTests(unittest.TestCase):
    def setUp(self):
        self.server = SnapshotServer(port=0)
        engine, sim = RaceEngine(), FleetSimulator()
        engine.ingest(*sim.observations())
        self.server.update(engine.snapshot())
        self.server.start()
        self.url = f"http://127.0.0.1:{self.server.httpd.server_port}"

    def tearDown(self):
        self.server.close()

    def test_common_renderer_and_server_source(self):
        with urlopen(self.url + "/?test=1") as r:
            self.assertIn(b'data-source="server"', r.read())
        for name, mime in (("core.js", "text/javascript"), ("epaper.js", "text/javascript"),
                           ("renderer.js", "text/javascript"), ("app.js", "text/javascript"), ("style.css", "text/css")):
            with urlopen(self.url + "/" + name) as r:
                self.assertIn(mime, r.headers["Content-Type"])
                self.assertGreater(len(r.read()), 100)

    def test_snapshot_and_asset_allowlist(self):
        with urlopen(self.url + "/snapshot") as r:
            self.assertEqual(len(json.load(r)["targets"]), 6)
        for path in ("/../core.py", "/core.py", "/unknown", "/static/../core.py"):
            with self.assertRaises(HTTPError) as error:
                urlopen(self.url + path)
            self.assertEqual(error.exception.code, 404)
