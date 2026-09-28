/* Hardware-independent refresh planner. Time is monotonic wall-clock seconds. */
(function (root) {
  'use strict';
  const DEFAULTS = {partial: 2, graph: 10, fullMin: 30, fullMax: 60, ghostLimit: 30,
    movement: 3, partialDuration: .34, fullDuration: 3.5};
  const PROFILES = {
    trmnl: {name: 'TRMNL 7.5 OG', width: 800, height: 480, alignment: 8, partialDuration: .34, fullDuration: 3.5},
    e1001: {name: 'reTerminal E1001', width: 800, height: 480, alignment: 8, partialDuration: .5, fullDuration: 4}
  };
  function union(a, b) {
    const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
    return {x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y};
  }
  function mergeRects(rects, alignment = 8) {
    const result = [];
    for (const input of rects) {
      const x = Math.max(0, Math.floor(input.x / alignment) * alignment), y = Math.max(0, Math.floor(input.y));
      let r = {x, y, w: Math.min(800, Math.ceil((input.x + input.w) / alignment) * alignment) - x,
        h: Math.min(480, Math.ceil(input.y + input.h)) - y};
      if (r.w <= 0 || r.h <= 0) continue;
      for (let i = 0; i < result.length;) {
        const a = result[i];
        if (r.x <= a.x + a.w && a.x <= r.x + r.w && r.y <= a.y + a.h && a.y <= r.y + r.h) {
          r = union(r, a); result.splice(i, 1); i = 0;
        } else i++;
      }
      result.push(r);
    }
    return result;
  }
  function changed(old, next) {
    if (!old || old.key !== next.key || old.metrics.length !== next.metrics.length) return true;
    return next.metrics.some(([value, threshold, circular], i) => {
      let delta = Math.abs(value - old.metrics[i][0]);
      if (circular) delta = Math.abs((delta + 180) % 360 - 180);
      return delta >= threshold;
    });
  }
  class RefreshPlanner {
    constructor(config = {}) {
      this.config = {...DEFAULTS}; this.configure(config);
      this.items = new Map(); this.context = null; this.pending = null;
      this.lastFull = 0; this.lastPartial = -Infinity; this.lastGraph = -Infinity;
      this.ghost = 0; this.partials = 0; this.fulls = 0; this.sinceFull = 0; this.lastArea = 0;
      this.reason = 'démarrage'; this.lastRects = []; this.lastEvent = -Infinity;
    }
    configure(values) {
      const c = {...this.config, ...values};
      for (const [k, v] of Object.entries(c)) if (!Number.isFinite(v) || v <= 0) throw new Error('Invalid setting: ' + k);
      if (c.fullMin > c.fullMax) throw new Error('Full minimum exceeds maximum');
      this.config = c;
    }
    requestFull(reason = 'nettoyage manuel') { this.forceReason = reason; }
    plan(now, scene, instant = false) {
      if (this.pending) return null;
      const c = this.config, age = now - this.lastFull;
      const reason = this.forceReason || (this.context !== scene.context ? scene.reason || 'page / portée / cible' :
        age >= c.fullMax ? 'délai maximum' : this.ghost >= c.ghostLimit ? 'seuil de ghosting' :
        age >= c.fullMin && this.ghost >= c.ghostLimit / 2 ? 'nettoyage adaptatif' : null);
      const full = Boolean(reason), next = new Map(this.items), rects = [], changes = [];
      const graphDue = now - this.lastGraph >= c.graph;
      const valuesDue = now - this.lastPartial >= c.partial;
      if (full) {
        next.clear(); for (const item of scene.items) next.set(item.id, item);
        rects.push({x: 0, y: 0, w: 800, h: 480});
      } else {
        for (const item of scene.items) {
          if (!(instant || (item.kind === 'graph' ? graphDue : valuesDue))) continue;
          const old = this.items.get(item.id);
          if (changed(old, item)) {
            next.set(item.id, item); changes.push(item);
            rects.push(old ? union(old.rect, item.rect) : item.rect);
          }
        }
        if (valuesDue || instant) for (const [id, old] of this.items) {
          if (!scene.items.some(item => item.id === id)) { next.delete(id); rects.push(old.rect); changes.push(old); }
        }
        if (!rects.length) return null;
      }
      const merged = mergeRects(rects), area = merged.reduce((s, r) => s + r.w * r.h, 0) / (800 * 480);
      const cost = changes.reduce((s, item) => s + (item.kind === 'boat' ? 2 : item.kind === 'graph' ? 5 : 1), 0) + area * 5;
      this.pending = {full, reason: reason || 'zones modifiées', rects: merged, area, cost, next, context: scene.context,
        scene, graph: full || changes.some(i => i.kind === 'graph'), values: full || changes.some(i => i.kind !== 'graph'),
        end: now + (instant ? 0 : full ? c.fullDuration : c.partialDuration), started: now};
      this.forceReason = null;
      return this.pending;
    }
    complete(now) {
      const p = this.pending;
      if (!p || now < p.end) return null;
      this.items = p.next; this.context = p.context; this.reason = p.reason; this.lastArea = p.area;
      this.lastRects = p.rects; this.lastEvent = now;
      if (p.graph) this.lastGraph = p.started;
      if (p.values) this.lastPartial = p.started;
      if (p.full) { this.lastFull = now; this.ghost = 0; this.fulls++; this.sinceFull = 0; }
      else { this.ghost += p.cost; this.partials++; this.sinceFull++; }
      this.pending = null;
      return p;
    }
  }
  const api = {DEFAULTS, PROFILES, mergeRects, changed, RefreshPlanner};
  if (typeof module !== 'undefined') module.exports = api;
  else root.EPaper = api;
})(typeof window !== 'undefined' ? window : this);
