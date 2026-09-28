(function () {
  'use strict';
  const $ = id => document.getElementById(id), serverMode = document.body.dataset.source === 'server';
  const planner = new EPaper.RefreshPlanner(), backend = new RaceRenderer.CanvasBackend($('screen'), $('overlay'));
  const view = {page: 0, range: 2, selected: 227000101, profile: 'trmnl', reason: 'démarrage'};
  let sim, engine, data, paused = false, speed = 1, accumulator = 0, lastFrame = performance.now(), lastUI = 0, lastPlan = 0;
  let lastReceived = 0, connectionError = '', targetIds = '';
  const instant = () => $('mode').value === 'instant';
  function newFleet() {
    sim = new AIS.FleetSimulator(); engine = new AIS.RaceEngine(); engine.ingest(...sim.observations());
    // Useful values on first visit, generated locally and deterministically at 1 Hz.
    for (let i = 0; i < 300; i++) engine.ingest(...sim.step(1));
    data = engine.snapshot(); accumulator = 0;
  }
  function full(reason) { view.reason = reason; planner.requestFull(reason); }
  function choosePage(page) { view.page = (page + 4) % 4; full('changement de page'); syncControls(); }
  function nextTarget() {
    if (!data?.targets.length) return;
    const ids = data.targets.map(t => t.mmsi).sort((a, b) => a - b);
    view.selected = ids[(ids.indexOf(view.selected) + 1) % ids.length]; full('changement de cible'); syncControls();
  }
  function syncControls() {
    document.querySelectorAll('[data-page]').forEach(b => b.setAttribute('aria-pressed', String(Number(b.dataset.page) === view.page)));
    $('target').value = String(view.selected);
    $('screen').setAttribute('aria-label', `Afficheur AIS, vue ${RaceRenderer.pages[view.page]}. Flèches : pages ; Entrée : concurrent suivant.`);
  }
  function syncTargets() {
    const sorted = [...data.targets].sort((a, b) => a.mmsi - b.mmsi);
    const key = sorted.map(t => `${t.mmsi}:${t.name}`).join('|');
    if (key === targetIds) return;
    targetIds = key; $('target').replaceChildren();
    for (const t of sorted) { const o = document.createElement('option'); o.value = t.mmsi; o.textContent = t.name; $('target').append(o); }
    if (!sorted.some(t => t.mmsi === view.selected)) view.selected = sorted[0]?.mmsi;
    syncControls();
  }
  function updateUI(now) {
    const t = data?.timestamp || 0;
    $('sim-time').textContent = `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
    $('counts').textContent = `${planner.partials} / ${planner.fulls}`;
    $('partial-run').textContent = `${planner.sinceFull} partial depuis nettoyage`;
    $('ghost-score').textContent = `${planner.ghost.toFixed(1)} / ${planner.config.ghostLimit}`;
    $('ghost-meter').max = planner.config.ghostLimit; $('ghost-meter').value = planner.ghost;
    $('full-age').textContent = planner.fulls ? `${Math.floor(now - planner.lastFull)} s` : '—';
    $('area').textContent = `Surface mise à jour : ${(planner.lastArea * 100).toFixed(1)} %`;
    $('refresh-state').textContent = planner.pending ? `${planner.pending.full ? 'Full' : 'Partial'} en cours` : instant() ? 'Instantané' : 'Écran stable';
    $('refresh-reason').textContent = planner.pending?.reason || planner.reason;
    $('refresh-flash').classList.toggle('active', Boolean(planner.pending?.full && !instant()));
    const stale = serverMode && (!lastReceived || now - lastReceived > 3);
    $('connection').classList.toggle('error', stale || Boolean(connectionError));
    $('connection').textContent = serverMode ? (stale || connectionError ? `Connexion Python perdue · données figées. ${connectionError}` : 'Moteur Python connecté · données AIS fictives · réception 1 Hz.') :
      paused ? 'Simulation en pause · le nettoyage e-paper reste actif.' : `Flotte fictive active · 6 concurrents · vitesse ×${speed}.`;
    if (data) {
      const target = data.targets.find(t => t.mmsi === view.selected);
      $('accessible-summary').textContent = `${data.targets.length} concurrents. Notre bateau : ${data.own.sog.toFixed(1)} nœuds.` +
        (target ? ` ${target.name}, distance ${target.distance_nm.toFixed(2)} NM, SOG moyenne 2 minutes ${target.sog_avg[120].toFixed(2)} nœuds.` : '');
    }
    backend.diagnostic(now - planner.lastEvent < 2 ? planner.lastRects : [], planner.ghost, $('diagnostic').checked);
  }
  function animate(stamp) {
    const now = stamp / 1000, dt = Math.min(1, (stamp - lastFrame) / 1000); lastFrame = stamp;
    if (!serverMode && !paused && !document.hidden) {
      accumulator += dt * speed;
      let advanced = false;
      while (accumulator >= 1) { engine.ingest(...sim.step(1)); accumulator -= 1; advanced = true; }
      if (advanced) data = engine.snapshot();
    }
    const completed = planner.complete(now);
    if (completed) backend.finish(completed, $('ghosting').checked && !instant());
    if (data && !planner.pending && now - lastPlan >= .1) {
      syncTargets();
      const scene = RaceRenderer.createScene(data, {...view}, planner.config);
      const plan = planner.plan(now, scene, instant());
      if (plan) backend.begin(plan);
      lastPlan = now;
    }
    if (now - lastUI >= .1) { updateUI(now); lastUI = now; }
    requestAnimationFrame(animate);
  }
  async function poll() {
    try {
      const response = await fetch('./snapshot', {cache: 'no-store', signal: AbortSignal.timeout(5000)});
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const next = await response.json();
      if (next.schema !== 1 || !next.own || !Array.isArray(next.targets)) throw new Error('État AIS invalide');
      if (data && next.timestamp < data.timestamp) full('redémarrage du moteur');
      data = next; lastReceived = performance.now() / 1000; connectionError = '';
    } catch (e) { connectionError = e.name === 'TimeoutError' ? 'Délai de réponse dépassé.' : e.message; }
    setTimeout(poll, 1000);
  }
  document.querySelectorAll('[data-page]').forEach(b => b.addEventListener('click', () => choosePage(Number(b.dataset.page))));
  $('previous').addEventListener('click', () => choosePage(view.page - 1));
  $('next').addEventListener('click', () => choosePage(view.page + 1));
  $('next-target').addEventListener('click', nextTarget);
  $('target').addEventListener('change', e => { view.selected = Number(e.target.value); full('changement de cible'); });
  $('range').addEventListener('change', e => { view.range = Number(e.target.value); full('changement de portée'); });
  $('pause').addEventListener('click', () => { paused = !paused; $('pause').textContent = paused ? 'Reprendre' : 'Pause'; });
  $('reset').addEventListener('click', () => { newFleet(); paused = false; $('pause').textContent = 'Pause'; full('nouvelle simulation'); });
  $('speed').addEventListener('change', e => { speed = Number(e.target.value); });
  $('cleanup').addEventListener('click', () => full('nettoyage manuel'));
  $('mode').addEventListener('change', () => full('changement de rendu'));
  $('ghosting').addEventListener('change', () => full('changement de rémanence'));
  $('profile').addEventListener('change', e => {
    view.profile = e.target.value;
    const profile = EPaper.PROFILES[view.profile];
    planner.configure({partialDuration: profile.partialDuration, fullDuration: profile.fullDuration});
    $('device-name').textContent = profile.name;
    $('timings').textContent = `Durées simulées : partial ${profile.partialDuration} s · full ${profile.fullDuration} s.`;
    full('changement de profil');
  });
  $('settings').addEventListener('submit', e => {
    e.preventDefault();
    const settings = Object.fromEntries(new FormData(e.target).entries());
    for (const k of Object.keys(settings)) settings[k] = Number(settings[k]);
    if (settings.fullMin > settings.fullMax) { $('settings-message').textContent = 'Le délai minimum doit être inférieur ou égal au maximum.'; return; }
    try { planner.configure(settings); $('settings-message').textContent = 'Paramètres appliqués.'; }
    catch { $('settings-message').textContent = 'Vérifiez les valeurs saisies.'; }
  });
  document.addEventListener('keydown', e => {
    // Do not steal arrow keys / Enter from controls or form submission.
    if (e.target.closest('input, select, button, summary, textarea')) return;
    if (e.key === 'ArrowLeft') choosePage(view.page - 1);
    else if (e.key === 'ArrowRight') choosePage(view.page + 1);
    else if (e.key === 'Enter' || e.key === ' ') nextTarget();
    else return;
    e.preventDefault();
  });
  $('screen').addEventListener('click', e => {
    const r = e.target.getBoundingClientRect(), x = (e.clientX - r.left) * 800 / r.width, y = (e.clientY - r.top) * 480 / r.height;
    if (y < 437) return;
    if (x < 265) choosePage(view.page - 1); else if (x > 535) choosePage(view.page + 1); else nextTarget();
  });
  document.addEventListener('visibilitychange', () => { lastFrame = performance.now(); });
  if (serverMode) {
    $('source').textContent = 'Moteur Python · réception 1 Hz';
    for (const id of ['pause', 'reset', 'speed']) { $(id).disabled = true; $(id).title = 'Piloté par le moteur Python'; }
    poll();
  } else newFleet();
  syncControls(); requestAnimationFrame(animate);
})();
