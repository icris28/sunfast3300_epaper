"""Tkinter preview of the 800 x 480 monochrome E1001 screen."""

from __future__ import annotations

import tkinter as tk
from math import cos, radians, sin

from .core import east_north_nm

WIDTH, HEIGHT = 800, 480
PAGES = ("CARTE", "TABLEAU", "GRAPHIQUES", "DETAIL")
INK, PAPER, MUTED = "#111111", "#f7f7f2", "#777777"


class Display:
    def __init__(self, root: tk.Tk, on_step) -> None:
        self.root = root
        self.on_step = on_step
        self.page = 0
        self.selected = 0
        self.snapshot: dict | None = None
        root.title("Sun Fast 3300 · E1001 virtuel 800×480")
        root.resizable(False, False)
        self.canvas = tk.Canvas(root, width=WIDTH, height=HEIGHT, bg=PAPER, highlightthickness=0)
        self.canvas.pack()
        root.bind("<Left>", lambda _: self.left())
        root.bind("<Right>", lambda _: self.right())
        root.bind("<Return>", lambda _: self.enter())
        root.bind("<space>", lambda _: self.enter())
        root.bind("a", lambda _: self.left())
        root.bind("d", lambda _: self.right())
        root.bind("s", lambda _: self.enter())
        self.canvas.bind("<Button-1>", self.click)

    def left(self):
        self.page = (self.page - 1) % len(PAGES)
        self.draw()

    def right(self):
        self.page = (self.page + 1) % len(PAGES)
        self.draw()

    def enter(self):
        targets = self.targets
        if targets:
            self.selected = (self.selected + 1) % len(targets)
        self.draw()

    def click(self, event):
        if event.y >= 438:
            if event.x < 265:
                self.left()
            elif event.x > 535:
                self.right()
            else:
                self.enter()

    @property
    def targets(self) -> list[dict]:
        return self.snapshot["targets"] if self.snapshot else []

    def update(self, snapshot: dict):
        selected_mmsi = self.targets[self.selected]["mmsi"] if self.targets and self.selected < len(self.targets) else None
        self.snapshot = snapshot
        self.selected = next((i for i, t in enumerate(self.targets) if t["mmsi"] == selected_mmsi), 0)
        self.draw()

    def text(self, x, y, value, size=15, bold=False, anchor="nw", fill=INK):
        self.canvas.create_text(x, y, text=value, font=("Consolas", size, "bold" if bold else "normal"),
                                anchor=anchor, fill=fill)

    def line(self, *xy, width=1, fill=INK, dash=None):
        self.canvas.create_line(*xy, width=width, fill=fill, dash=dash)

    def frame(self):
        c = self.canvas
        c.delete("all")
        c.create_rectangle(0, 0, WIDTH, HEIGHT, fill=PAPER, outline=PAPER)
        self.text(18, 13, "AIS RACE  /  SUN FAST 3300", 20, True)
        self.text(782, 18, PAGES[self.page], 17, True, "ne")
        self.line(18, 49, 782, 49, width=2)
        self.line(18, 430, 782, 430, width=2)
        self.text(52, 446, "◀  PAGE", 15, True)
        self.text(400, 446, "●  CIBLE", 15, True, "n")
        self.text(748, 446, "PAGE  ▶", 15, True, "ne")
        self.line(265, 438, 265, 471)
        self.line(535, 438, 535, 471)

    def draw(self):
        self.frame()
        if not self.snapshot:
            self.text(400, 225, "EN ATTENTE DES DONNEES AIS", 19, True, "center")
            return
        (self.map_view, self.table_view, self.graph_view, self.detail_view)[self.page]()

    def map_view(self):
        c = self.canvas
        cx, cy, scale = 335, 242, 125  # pixels per nautical mile
        for radius in (0.5, 1.0, 1.5):
            r = radius * scale
            c.create_oval(cx-r, cy-r, cx+r, cy+r, outline="#bbbbbb", dash=(3, 5))
            self.text(cx+r+3, cy, f"{radius:g}", 10, fill=MUTED)
        self.line(cx, 68, cx, 417, fill="#bbbbbb", dash=(2, 6))
        self.line(45, cy, 618, cy, fill="#bbbbbb", dash=(2, 6))
        c.create_polygon(cx, cy-12, cx-10, cy+10, cx+10, cy+10, fill=INK)
        self.text(cx+13, cy+10, "NOUS", 12, True)
        own = self.snapshot["own"]
        for i, t in enumerate(self.targets):
            east, north = east_north_nm(own["lat"], own["lon"], t["lat"], t["lon"])
            x, y = cx + east * scale, cy - north * scale
            x, y = max(55, min(605, x)), max(80, min(405, y))
            selected = i == self.selected
            c.create_oval(x-6, y-6, x+6, y+6, fill=INK if selected else PAPER, outline=INK, width=2)
            self.text(x+10, y-13, t["name"], 12, selected)
        self.line(635, 65, 635, 419)
        self.text(653, 75, "CIBLE", 13, True)
        if self.targets:
            t = self.targets[self.selected]
            self.text(653, 103, t["name"], 15, True)
            self.text(653, 145, f'{t["distance_nm"]:.2f} NM', 23, True)
            self.text(653, 185, f'{t["bearing_deg"]:.0f}° REL', 16)
            self.text(653, 225, f'{t["sog_avg"][120]:.1f} kn', 17)
            self.text(653, 257, "SOG MOY 2 MIN", 11)
            self.text(653, 301, f'{t["cog_avg"][120]:.0f}°', 20)
            self.text(653, 333, "COG MOY 2 MIN", 11)
            self.text(653, 380, f'CPA {t["cpa_nm"]:.2f} NM', 14, True)

    def table_view(self):
        self.text(27, 65, "CONCURRENT", 14, True)
        headers = [(318, "DIST NM"), (430, "SOG 2'"), (536, "COG 2'"), (646, "GAIN 5'")]
        for x, title in headers:
            self.text(x, 65, title, 14, True)
        self.line(20, 92, 780, 92)
        for i, t in enumerate(self.targets[:7]):
            y = 105 + i * 47
            if i == self.selected:
                self.canvas.create_rectangle(20, y-3, 780, y+37, outline=INK, width=2)
            self.text(30, y+5, t["name"][:19], 17, i == self.selected)
            self.text(318, y+5, f'{t["distance_nm"]:.2f}', 17)
            self.text(430, y+5, f'{t["sog_avg"][120]:.1f}', 17)
            self.text(536, y+5, f'{t["cog_avg"][120]:.0f}°', 17)
            self.text(646, y+5, f'{t["gain_m"][300]:+.0f} m', 17)
            self.line(20, y+42, 780, y+42, fill="#bbbbbb")
        self.text(26, 401, "Gain + : l'écart avec nous se réduit. Moyennes sur échantillons disponibles.", 11)

    def graph_view(self):
        if not self.targets:
            return
        t = self.targets[self.selected]
        self.text(27, 65, t["name"], 20, True)
        self.text(770, 69, f'ECART {t["distance_nm"]:.2f} NM', 16, True, "ne")
        x0, y0, w, h = 78, 130, 660, 230
        self.line(x0, y0, x0, y0+h, width=2)
        self.line(x0, y0+h, x0+w, y0+h, width=2)
        points = [(time, gap) for time, gap in t["history"] if time >= self.snapshot["timestamp"] - 300]
        if points:
            values = [gap for _, gap in points]
            low, high = min(values), max(values)
            pad = max(.05, (high-low)*.15)
            low, high = low-pad, high+pad
            for fraction in (0, .5, 1):
                y = y0+h - fraction*h
                self.line(x0, y, x0+w, y, fill="#bbbbbb", dash=(3, 5))
                self.text(70, y, f"{low + fraction*(high-low):.2f}", 11, anchor="e")
            end = self.snapshot["timestamp"]
            coords = []
            for time, gap in points:
                coords.extend((x0+w*(time-(end-300))/300, y0+h-(gap-low)/(high-low)*h))
            if len(coords) >= 4:
                self.line(*coords, width=3)
            elif len(coords) == 2:
                self.canvas.create_oval(coords[0]-3, coords[1]-3, coords[0]+3, coords[1]+3, fill=INK)
        self.text(x0, 374, "-5 MIN", 12)
        self.text(x0+w, 374, "MAINTENANT", 12, anchor="ne")
        self.text(78, 400, "Distance avec nous (NM) · courbe montante : le concurrent s'éloigne", 12)

    def detail_view(self):
        if not self.targets:
            return
        t = self.targets[self.selected]
        self.text(27, 67, t["name"], 25, True)
        self.text(28, 116, f'MMSI  {t["mmsi"]}', 13)
        left = [
            ("DISTANCE", f'{t["distance_nm"]:.2f} NM'),
            ("RELEVEMENT", f'{t["bearing_deg"]:.0f}°'),
            ("SOG / COG", f'{t["sog"]:.1f} kn  /  {t["cog"]:.0f}°'),
            ("CPA / TCPA", f'{t["cpa_nm"]:.2f} NM  /  {t["tcpa_min"]:.0f} min'),
        ]
        right = [
            ("SOG 30s / 2m / 5m", " / ".join(f'{t["sog_avg"][v]:.1f}' for v in (30, 120, 300))),
            ("COG 30s / 2m / 5m", " / ".join(f'{t["cog_avg"][v]:.0f}°' for v in (30, 120, 300))),
            ("GAIN 30s / 2m / 5m", " / ".join(f'{t["gain_m"][v]:+.0f}' for v in (30, 120, 300)) + " m"),
        ]
        self.line(390, 105, 390, 408)
        for i, (label, value) in enumerate(left):
            y = 160+i*62
            self.text(28, y, label, 12)
            self.text(28, y+18, value, 20, True)
        for i, (label, value) in enumerate(right):
            y = 160+i*82
            self.text(416, y, label, 12)
            self.text(416, y+22, value, 18, True)
        self.text(416, 399, "GAIN + : écart réduit", 12)
