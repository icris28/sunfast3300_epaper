const {test} = require('node:test');
const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const path = require('node:path');
const AIS = require('../src/ais_race/static/core.js');
const {RefreshPlanner, changed, mergeRects} = require('../src/ais_race/static/epaper.js');
const close = (a, b, tol = 1e-7) => assert.ok(Math.abs(a - b) < tol, `${a} != ${b}`);
const own = {mmsi: 1, name: 'own', lat: 0, lon: 0, sog: 6, cog: 0, timestamp: 0};
const boat = (e, n, sog = 0, cog = 0) => ({mmsi: 2, name: 'target', ...AIS.destination(0, 0, e, n), sog, cog, timestamp: 0});
const item = (v, kind = 'value', rect = {x: 10, y: 20, w: 20, h: 20}) => ({id: kind, key: '', rect, kind, metrics: [[v, 3]], paint() {}});
const scene = (items, context = 'map') => ({items, context});
function ready(config = {}, items = [item(0)]) {
  const p = new RefreshPlanner(config); p.plan(0, scene(items)); p.complete(3.5); return p;
}

test('circular average wraps north, opposed routes use latest bearing', () => {
  close(AIS.circularMean([359, 1]), 0); close(AIS.circularMean([90, 270]), 270);
  assert.equal(changed(item(359), {...item(1), metrics: [[1, 3, true]]}), false);
});
test('distance, bearing, dateline and CPA/TCPA edge cases', () => {
  const [d, b] = AIS.distanceBearing(own, boat(1, 0)); close(d, 1); close(b, 90);
  const [cpa, time] = AIS.cpaTcpa(own, boat(0, 1)); close(cpa, 0); close(time, 10);
  close(AIS.cpaTcpa(own, boat(0, -1))[1], 0);
  close(AIS.cpaTcpa(own, boat(1, 0, 6, 0))[0], 1);
  assert.ok(Math.abs(AIS.offset({lat: 0, lon: 179.99}, {lat: 0, lon: -179.99})[0]) < 2);
});
test('six unique competitors, readiness, retention and stale observations', () => {
  const sim = new AIS.FleetSimulator(), e = new AIS.RaceEngine();
  e.ingest(...sim.observations()); assert.equal(e.snapshot().targets.length, 6);
  assert.equal(new Set([sim.own, ...sim.targets].map(b => b.mmsi)).size, 7);
  assert.equal(e.snapshot().targets[0].gain_ready[300], false);
  for (let i = 0; i < 1900; i++) e.ingest(...sim.step());
  const s = e.snapshot(); assert.ok(s.targets.every(t => t.gain_ready[300]));
  assert.equal(s.targets[0].history.length, 1801);
  assert.ok(s.targets[0].motion_history.length <= 182);
  const before = e.snapshot(); assert.throws(() => e.ingest(...sim.observations()));
  assert.deepEqual(e.snapshot(), before);
  e.ingest({...s.own, timestamp: s.timestamp + 181}, []); assert.equal(e.snapshot().targets.length, 0);
});
test('Python and web engines agree on the identical 1 Hz fleet after 300 seconds', () => {
  const root = path.resolve(__dirname, '..');
  const raw = execFileSync(process.env.PYTHON || 'python', ['-m', 'ais_race.app', '--headless', '300'],
    {cwd: root, env: {...process.env, PYTHONPATH: path.join(root, 'src')}, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024});
  const py = JSON.parse(raw), sim = new AIS.FleetSimulator(), engine = new AIS.RaceEngine();
  engine.ingest(...sim.observations()); for (let i = 0; i < 300; i++) engine.ingest(...sim.step());
  const js = engine.snapshot(); close(py.timestamp, js.timestamp);
  for (const h of [30, 120, 300]) for (const k of ['sog_avg', 'cog_avg']) close(py.own[k][h], js.own[k][h], 1e-5);
  for (const a of py.targets) {
    const b = js.targets.find(b => b.mmsi === a.mmsi);
    for (const k of ['lat', 'lon', 'sog', 'cog', 'distance_nm', 'bearing_deg', 'cpa_nm', 'tcpa_min']) close(a[k], b[k], 1e-5);
    for (const h of [30, 120, 300]) for (const k of ['sog_avg', 'cog_avg', 'gain_m']) close(a[k][h], b[k][h], 1e-5);
    assert.deepEqual(a.gain_ready, b.gain_ready);
    assert.equal(a.motion_history.length, b.motion_history.length);
  }
});
test('small movements accumulate against displayed state; no-op stays idle', () => {
  const p = ready(); assert.equal(p.plan(4, scene([item(1)])), null); assert.equal(p.plan(5, scene([item(2)])), null);
  assert.equal(p.items.get('value').metrics[0][0], 0);
  const plan = p.plan(6, scene([item(3)])); assert.equal(plan.full, false);
  assert.equal(p.complete(6.2), null); assert.equal(p.items.get('value').metrics[0][0], 0);
  p.complete(6.34); assert.equal(p.items.get('value').metrics[0][0], 3);
  assert.equal(p.plan(7, scene([item(10)])), null); assert.ok(p.plan(8, scene([item(10)])));
});
test('dirty rectangle includes old and new positions, clipped and byte-aligned', () => {
  const p = ready(); const q = p.plan(4, scene([item(4, 'value', {x: 44, y: 27, w: 30, h: 22})]));
  assert.deepEqual(q.rects, [{x: 8, y: 20, w: 72, h: 29}]);
  assert.deepEqual(mergeRects([{x: -5, y: -5, w: 15, h: 15}, {x: 790, y: 470, w: 50, h: 50}]),
    [{x: 0, y: 0, w: 16, h: 10}, {x: 784, y: 470, w: 16, h: 10}]);
});
test('busy display coalesces page changes; full clears ghost only on completion', () => {
  const p = ready(); p.plan(4, scene([item(4)])); assert.equal(p.plan(4.1, scene([item(8)], 'table')), null);
  p.requestFull('page'); p.complete(4.34); assert.ok(p.ghost > 0);
  const f = p.plan(5, scene([item(8)], 'table')); assert.equal(f.full, true); assert.ok(p.ghost > 0);
  assert.equal(p.complete(8), null); p.complete(8.5); assert.equal(p.ghost, 0); assert.equal(p.context, 'table');
});
test('graphs have independent ten-second cadence and values remain at two seconds', () => {
  const p = ready({}, [item(0), item(0, 'graph')]);
  const q = p.plan(4, scene([item(4), item(4, 'graph')])); assert.equal(q.graph, false); p.complete(4.34);
  assert.equal(p.items.get('graph').metrics[0][0], 0);
  const g = p.plan(10, scene([item(4), item(4, 'graph')])); assert.equal(g.graph, true); assert.equal(g.values, false);
});
test('adaptive cleanup at 30 s, hard deadline 60 s and urgent ghost threshold', () => {
  let p = ready(); p.ghost = 16; assert.equal(p.plan(33, scene([item(0)])), null);
  assert.equal(p.plan(33.5, scene([item(0)])).reason, 'nettoyage adaptatif');
  p = ready(); assert.equal(p.plan(63.49, scene([item(0)])), null); assert.equal(p.plan(63.5, scene([item(0)])).full, true);
  p = ready(); p.ghost = 31; assert.equal(p.plan(4, scene([item(0)])).reason, 'seuil de ghosting');
});
test('page/range contexts force full, bad parameters rejected, instant has no busy delay', () => {
  const p = ready(); assert.equal(p.plan(4, scene([item(0)], 'range5')).full, true);
  assert.throws(() => p.configure({fullMin: 90, fullMax: 30})); assert.throws(() => p.configure({partial: NaN}));
  const fast = new RefreshPlanner(); const q = fast.plan(0, scene([item(0)]), true); assert.equal(q.end, 0); assert.ok(fast.complete(0));
});
