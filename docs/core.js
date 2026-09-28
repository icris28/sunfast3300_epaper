/* Pure calculations and deterministic fleet. Also loadable with Node for tests. */
(function (root) {
  'use strict';
  const EARTH = 3440.065, RAD = Math.PI / 180, HORIZONS = [30, 120, 300];
  const wrap = a => (a % 360 + 360) % 360;
  function circularMean(values) {
    if (!values.length) return 0;
    const x = values.reduce((s, v) => s + Math.sin(v * RAD), 0);
    const y = values.reduce((s, v) => s + Math.cos(v * RAD), 0);
    return Math.hypot(x, y) < 1e-9 ? wrap(values.at(-1)) : wrap(Math.atan2(x, y) / RAD);
  }
  function offset(a, b) {
    return [wrap(b.lon - a.lon + 180) - 180, b.lat - a.lat].map((v, i) =>
      v * RAD * EARTH * (i === 0 ? Math.cos((a.lat + b.lat) * RAD / 2) : 1));
  }
  function destination(lat, lon, east, north) {
    return {lat: lat + north / EARTH / RAD, lon: lon + east / (EARTH * Math.cos(lat * RAD)) / RAD};
  }
  function distanceBearing(a, b) {
    const p1 = a.lat * RAD, p2 = b.lat * RAD, dl = (b.lon - a.lon) * RAD;
    const h = Math.sin((p2 - p1) / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
    return [2 * EARTH * Math.asin(Math.min(1, Math.sqrt(h))),
      wrap(Math.atan2(Math.sin(dl) * Math.cos(p2), Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl)) / RAD)];
  }
  const velocity = b => [b.sog * Math.sin(b.cog * RAD), b.sog * Math.cos(b.cog * RAD)];
  function cpaTcpa(own, target) {
    const [x, y] = offset(own, target), ov = velocity(own), tv = velocity(target);
    const vx = tv[0] - ov[0], vy = tv[1] - ov[1], v2 = vx * vx + vy * vy;
    const hours = v2 < 1e-9 ? 0 : Math.max(0, -(x * vx + y * vy) / v2);
    return [Math.hypot(x + vx * hours, y + vy * hours), hours * 60];
  }
  class RaceEngine {
    constructor(retention = 1800) { this.retention = retention; this.history = new Map(); this.gaps = new Map(); }
    ingest(own, targets) {
      // Validate the batch before mutating the engine.
      for (const b of [own, ...targets]) {
        const last = this.history.get(b.mmsi)?.at(-1);
        if (last && b.timestamp <= last.timestamp) throw new Error('Observation times must increase');
      }
      this.ownMmsi = own.mmsi;
      for (const b of [own, ...targets]) {
        const samples = this.history.get(b.mmsi) || [];
        samples.push({...b});
        while (samples[0].timestamp < b.timestamp - this.retention) samples.shift();
        this.history.set(b.mmsi, samples);
      }
      for (const b of targets) {
        const gaps = this.gaps.get(b.mmsi) || [];
        gaps.push([b.timestamp, distanceBearing(own, b)[0]]);
        while (gaps[0][0] < b.timestamp - this.retention) gaps.shift();
        this.gaps.set(b.mmsi, gaps);
      }
    }
    snapshot() {
      if (!this.history.has(this.ownMmsi)) throw new Error('No observations yet');
      const own = {...this.history.get(this.ownMmsi).at(-1)}, targets = [];
      own.sog_avg = {}; own.cog_avg = {};
      for (const h of HORIZONS) {
        const recent = this.history.get(this.ownMmsi).filter(s => s.timestamp >= own.timestamp - h);
        own.sog_avg[h] = recent.reduce((s, b) => s + b.sog, 0) / recent.length;
        own.cog_avg[h] = circularMean(recent.map(b => b.cog));
      }
      for (const [mmsi, samples] of this.history) {
        const b = samples.at(-1);
        if (mmsi === this.ownMmsi || own.timestamp - b.timestamp > 180) continue;
        const [distance_nm, bearing_deg] = distanceBearing(own, b), [cpa_nm, tcpa_min] = cpaTcpa(own, b);
        const sog_avg = {}, cog_avg = {}, gain_m = {}, gain_ready = {};
        const gaps = this.gaps.get(mmsi) || [];
        for (const h of HORIZONS) {
          const recent = samples.filter(s => s.timestamp >= b.timestamp - h);
          sog_avg[h] = recent.reduce((s, b) => s + b.sog, 0) / recent.length;
          cog_avg[h] = circularMean(recent.map(b => b.cog));
          const previous = gaps.findLast(g => g[0] <= b.timestamp - h);
          gain_ready[h] = Boolean(previous);
          gain_m[h] = previous ? (previous[1] - distance_nm) * 1852 : 0;
        }
        targets.push({...b, distance_nm, bearing_deg, cpa_nm, tcpa_min, sog_avg, cog_avg, gain_m, gain_ready,
          history: gaps.map(g => [...g]),
          motion_history: samples.filter((s, i) => i === 0 || Math.floor(s.timestamp / 10) !== Math.floor(samples[i - 1].timestamp / 10))
            .map(s => [s.timestamp, s.sog, s.cog])});
      }
      targets.sort((a, b) => a.distance_nm - b.distance_nm);
      return {schema: 1, timestamp: own.timestamp, own, targets,
        units: {distance: 'NM', speed: 'kn', angle: 'degrees true', gain: 'm', tcpa: 'min'}};
    }
  }
  class FleetSimulator {
    constructor() {
      this.elapsed = 0;
      this.own = {mmsi: 227000001, name: 'SUN FAST 3300', lat: -9.43, lon: 159.95, sog: 8.1, cog: 218};
      const specs = [
        [101, 'RAGING BEE', .26, .32, 8.5, 216], [102, 'JPK 1030', -.65, .12, 8.2, 220],
        [103, 'BLACK PEARL', .82, -.44, 7.8, 210], [104, 'WINDWARD', -.98, -.68, 8.7, 224],
        [105, 'FAST LANE', 1.32, .26, 8, 202], [106, 'BLUE FIN', .42, -1.20, 7.6, 236]];
      this.targets = specs.map(([id, name, east, north, sog, cog]) => ({mmsi: 227000000 + id, name,
        ...destination(this.own.lat, this.own.lon, east, north), sog, cog}));
    }
    observations() { return [{...this.own, timestamp: this.elapsed}, this.targets.map(b => ({...b, timestamp: this.elapsed}))]; }
    step(seconds = 1) {
      if (!(seconds > 0)) throw new Error('Step must be positive');
      const t = this.elapsed += seconds;
      this.own.sog = 8.1 + .25 * Math.sin(t / 55); this.own.cog = wrap(218 + 3 * Math.sin(t / 140));
      this.targets.forEach((b, i) => {
        b.sog = 7.7 + i * .12 + .45 * Math.sin(t / (45 + 9 * i) + i);
        b.cog = wrap(b.cog + .025 * Math.sin(t / (38 + i * 11)));
        if (i === 0 && t > 180 && t < 260) b.cog = wrap(b.cog + .13 * seconds);
      });
      for (const b of [this.own, ...this.targets]) {
        const [e, n] = velocity(b); Object.assign(b, destination(b.lat, b.lon, e * seconds / 3600, n * seconds / 3600));
      }
      return this.observations();
    }
  }
  const api = {EARTH, RAD, HORIZONS, wrap, circularMean, offset, destination, distanceBearing, velocity, cpaTcpa, RaceEngine, FleetSimulator};
  if (typeof module !== 'undefined') module.exports = api;
  else root.AIS = api;
})(typeof window !== 'undefined' ? window : this);
