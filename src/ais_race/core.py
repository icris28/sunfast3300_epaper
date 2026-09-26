"""Pure AIS calculations. No UI, network or simulator dependencies."""

from __future__ import annotations

from collections import deque
from dataclasses import asdict, dataclass
from math import asin, atan2, cos, degrees, hypot, radians, sin, sqrt

EARTH_NM = 3440.065
HORIZONS = (30, 120, 300)


@dataclass(frozen=True)
class Observation:
    mmsi: int
    name: str
    lat: float
    lon: float
    sog: float  # knots
    cog: float  # degrees true, clockwise from north
    timestamp: float  # seconds on a consistent clock


@dataclass(frozen=True)
class TargetMetrics:
    mmsi: int
    name: str
    lat: float
    lon: float
    sog: float
    cog: float
    distance_nm: float
    bearing_deg: float
    sog_avg: dict[int, float]
    cog_avg: dict[int, float]
    gain_m: dict[int, float]  # positive means the gap closed
    cpa_nm: float
    tcpa_min: float
    history: list[tuple[float, float]]


def east_north_nm(lat0: float, lon0: float, lat1: float, lon1: float) -> tuple[float, float]:
    """Local tangent-plane offset, suitable for the nearby race fleet."""
    north = radians(lat1 - lat0) * EARTH_NM
    east = radians(lon1 - lon0) * EARTH_NM * cos(radians((lat0 + lat1) / 2))
    return east, north


def destination(lat: float, lon: float, east_nm: float, north_nm: float) -> tuple[float, float]:
    return lat + degrees(north_nm / EARTH_NM), lon + degrees(east_nm / (EARTH_NM * cos(radians(lat))))


def distance_bearing(a: Observation, b: Observation) -> tuple[float, float]:
    # Great-circle distance and initial bearing.
    p1, p2 = radians(a.lat), radians(b.lat)
    dp, dl = p2 - p1, radians(b.lon - a.lon)
    h = sin(dp / 2) ** 2 + cos(p1) * cos(p2) * sin(dl / 2) ** 2
    distance = 2 * EARTH_NM * asin(min(1.0, sqrt(h)))
    bearing = (degrees(atan2(sin(dl) * cos(p2), cos(p1) * sin(p2) - sin(p1) * cos(p2) * cos(dl))) + 360) % 360
    return distance, bearing


def velocity(sog: float, cog: float) -> tuple[float, float]:
    angle = radians(cog)
    return sog * sin(angle), sog * cos(angle)


def cpa_tcpa(own: Observation, target: Observation) -> tuple[float, float]:
    x, y = east_north_nm(own.lat, own.lon, target.lat, target.lon)
    ox, oy = velocity(own.sog, own.cog)
    tx, ty = velocity(target.sog, target.cog)
    vx, vy = tx - ox, ty - oy
    speed2 = vx * vx + vy * vy
    if speed2 < 1e-9:
        return hypot(x, y), 0.0
    hours = max(0.0, -(x * vx + y * vy) / speed2)
    return hypot(x + vx * hours, y + vy * hours), hours * 60


def circular_mean(values: list[float]) -> float:
    if not values:
        return 0.0
    x = sum(sin(radians(v)) for v in values)
    y = sum(cos(radians(v)) for v in values)
    if hypot(x, y) < 1e-9:
        return values[-1] % 360
    return degrees(atan2(x, y)) % 360


def _at_or_before(history: deque, time: float):
    for item in reversed(history):
        if item[0] <= time:
            return item
    return None


class RaceEngine:
    """Stores recent observations and produces an independent display snapshot."""

    def __init__(self, retention_s: float = 1800):
        self.retention_s = retention_s
        self.history: dict[int, deque[Observation]] = {}
        self.gaps: dict[int, deque[tuple[float, float]]] = {}
        self.own_mmsi: int | None = None

    def ingest(self, own: Observation, targets: list[Observation]) -> None:
        self.own_mmsi = own.mmsi
        current = [own, *targets]
        for boat in current:
            samples = self.history.setdefault(boat.mmsi, deque())
            if samples and boat.timestamp <= samples[-1].timestamp:
                raise ValueError("Observation times must increase for each boat")
            samples.append(boat)
            while samples and boat.timestamp - samples[0].timestamp > self.retention_s:
                samples.popleft()
        for boat in targets:
            gap, _ = distance_bearing(own, boat)
            samples = self.gaps.setdefault(boat.mmsi, deque())
            samples.append((boat.timestamp, gap))
            while samples and boat.timestamp - samples[0][0] > self.retention_s:
                samples.popleft()

    def snapshot(self) -> dict:
        if self.own_mmsi is None:
            raise ValueError("No observations yet")
        own = self.history[self.own_mmsi][-1]
        targets = []
        for mmsi, samples in self.history.items():
            if mmsi == self.own_mmsi:
                continue
            current = samples[-1]
            # Do not show stale AIS targets indefinitely.
            if own.timestamp - current.timestamp > 180:
                continue
            distance, bearing = distance_bearing(own, current)
            averages_sog = {}
            averages_cog = {}
            gains = {}
            gaps = self.gaps.get(mmsi, deque())
            for seconds in HORIZONS:
                recent = [s for s in samples if s.timestamp >= current.timestamp - seconds]
                averages_sog[seconds] = sum(s.sog for s in recent) / len(recent)
                averages_cog[seconds] = circular_mean([s.cog for s in recent])
                previous = _at_or_before(gaps, current.timestamp - seconds)
                gains[seconds] = (previous[1] - distance) * 1852 if previous else 0.0
            cpa, tcpa = cpa_tcpa(own, current)
            targets.append(asdict(TargetMetrics(
                mmsi=mmsi, name=current.name, lat=current.lat, lon=current.lon,
                sog=current.sog, cog=current.cog, distance_nm=distance,
                bearing_deg=bearing, sog_avg=averages_sog, cog_avg=averages_cog,
                gain_m=gains, cpa_nm=cpa, tcpa_min=tcpa,
                history=list(gaps),
            )))
        targets.sort(key=lambda row: row["distance_nm"])
        return {
            "schema": 1,
            "timestamp": own.timestamp,
            "own": asdict(own),
            "targets": targets,
            "units": {"distance": "NM", "speed": "kn", "angle": "degrees true", "gain": "m", "tcpa": "min"},
        }
