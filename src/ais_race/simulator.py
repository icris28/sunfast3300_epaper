"""Deterministic AIS fleet generator for development without radio or display."""

from __future__ import annotations

from dataclasses import dataclass
from math import sin

from .core import Observation, destination, velocity


@dataclass
class Boat:
    mmsi: int
    name: str
    lat: float
    lon: float
    sog: float
    cog: float

    def observation(self, timestamp: float) -> Observation:
        return Observation(self.mmsi, self.name, self.lat, self.lon, self.sog, self.cog, timestamp)

    def move(self, seconds: float) -> None:
        east, north = velocity(self.sog, self.cog)
        self.lat, self.lon = destination(self.lat, self.lon, east * seconds / 3600, north * seconds / 3600)


class FleetSimulator:
    def __init__(self) -> None:
        lat, lon = -9.43, 159.95
        self.elapsed = 0.0
        self.own = Boat(227000001, "SUN FAST 3300", lat, lon, 8.1, 218)
        specs = [
            (227000101, "RAGING BEE", .26, .32, 8.5, 216),
            (227000102, "JPK 1030", -.65, .12, 8.2, 220),
            (227000103, "BLACK PEARL", .82, -.44, 7.8, 210),
            (227000104, "WINDWARD", -.98, -.68, 8.7, 224),
            (227000105, "FAST LANE", 1.32, .26, 8.0, 202),
            (227000106, "BLUE FIN", .42, -1.20, 7.6, 236),
        ]
        self.targets = [Boat(mmsi, name, *destination(lat, lon, east, north), sog, cog)
                        for mmsi, name, east, north, sog, cog in specs]

    def observations(self) -> tuple[Observation, list[Observation]]:
        return self.own.observation(self.elapsed), [b.observation(self.elapsed) for b in self.targets]

    def step(self, seconds: float = 1.0) -> tuple[Observation, list[Observation]]:
        if seconds <= 0:
            raise ValueError("Step must be positive")
        self.elapsed += seconds
        t = self.elapsed
        self.own.sog = 8.1 + .25 * sin(t / 55)
        self.own.cog = (218 + 3 * sin(t / 140)) % 360
        for i, boat in enumerate(self.targets):
            boat.sog = 7.7 + i * .12 + .45 * sin(t / (45 + 9 * i) + i)
            boat.cog = (boat.cog + .025 * sin(t / (38 + i * 11))) % 360
            if i == 0 and 180 < t < 260:
                boat.cog = (boat.cog + .13 * seconds) % 360  # visible maneuver
            boat.move(seconds)
        self.own.move(seconds)
        return self.observations()
