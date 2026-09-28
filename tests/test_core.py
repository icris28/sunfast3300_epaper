import math
import unittest

from ais_race.core import Observation, RaceEngine, circular_mean, cpa_tcpa, destination, distance_bearing
from ais_race.simulator import FleetSimulator


class CoreTests(unittest.TestCase):
    def test_north_and_east_bearings(self):
        origin = Observation(1, "own", 0, 0, 0, 0, 0)
        for east, north, expected in ((0, 1, 0), (1, 0, 90)):
            lat, lon = destination(0, 0, east, north)
            distance, bearing = distance_bearing(origin, Observation(2, "target", lat, lon, 0, 0, 0))
            self.assertAlmostEqual(distance, 1, places=3)
            self.assertAlmostEqual(bearing, expected, places=3)

    def test_circular_mean_wraps_north(self):
        heading = circular_mean([359, 1])
        self.assertTrue(heading < 2 or heading > 358)

    def test_cpa_approaching_target(self):
        lat, lon = destination(0, 0, 0, 1)
        own = Observation(1, "own", 0, 0, 6, 0, 0)
        target = Observation(2, "target", lat, lon, 0, 0, 0)
        cpa, tcpa = cpa_tcpa(own, target)
        self.assertLess(cpa, .001)
        self.assertAlmostEqual(tcpa, 10, places=2)

    def test_history_gain_and_averages(self):
        engine = RaceEngine()
        lat, lon = destination(0, 0, 0, 1)
        for t, gap in ((0, 1), (30, .9), (120, .7), (300, .5)):
            own = Observation(1, "own", 0, 0, 0, 0, t)
            y, x = destination(0, 0, 0, gap)
            target = Observation(2, "target", y, x, 8, 359 if t == 0 else 1, t)
            engine.ingest(own, [target])
        metric = engine.snapshot()["targets"][0]
        self.assertAlmostEqual(metric["gain_m"][300], 926, delta=2)
        self.assertAlmostEqual(metric["sog_avg"][120], 8)
        self.assertEqual(len(metric["history"]), 4)

    def test_fleet_has_six_targets(self):
        sim = FleetSimulator()
        own, targets = sim.step()
        self.assertEqual(len(targets), 6)
        self.assertEqual(len({b.mmsi for b in [own, *targets]}), 7)

    def test_readiness_and_motion_history(self):
        sim, engine = FleetSimulator(), RaceEngine()
        engine.ingest(*sim.observations())
        self.assertFalse(engine.snapshot()["targets"][0]["gain_ready"][300])
        for _ in range(300):
            engine.ingest(*sim.step(1))
        target = engine.snapshot()["targets"][0]
        self.assertTrue(target["gain_ready"][300])
        self.assertEqual(len(target["motion_history"]), 31)

    def test_invalid_batch_does_not_partially_append(self):
        sim, engine = FleetSimulator(), RaceEngine()
        engine.ingest(*sim.observations())
        own, targets = sim.step()
        targets[-1] = Observation(**{**targets[-1].__dict__, "timestamp": 0})
        with self.assertRaises(ValueError):
            engine.ingest(own, targets)
        self.assertEqual(engine.snapshot()["timestamp"], 0)


if __name__ == "__main__":
    unittest.main()
