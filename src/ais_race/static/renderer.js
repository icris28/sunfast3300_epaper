/* 800 x 480 retained scene; no TRMNL/E1001 driver calls in the renderer. */
(function (root) {
  'use strict';
  const {RAD, offset, wrap} = root.AIS;
  const INK = '#151b1c', PAPER = '#fafbf4';
  const pages = ['CARTE', 'TABLEAU', 'GRAPHIQUES', 'DÉTAIL'];
  function text(c, x, y, value, size = 14, bold = false, align = 'left', color = INK) {
    c.font = `${bold ? '600 ' : ''}${size}px Consolas, monospace`;
    c.textAlign = align; c.textBaseline = 'top'; c.fillStyle = color; c.fillText(String(value), x, y);
  }
  function line(c, x, y, xx, yy, color = INK, dash = []) {
    c.beginPath(); c.strokeStyle = color; c.lineWidth = 1; c.setLineDash(dash);
    c.moveTo(x, y); c.lineTo(xx, yy); c.stroke(); c.setLineDash([]);
  }
  const metric = (v, threshold, circular = false) => [v, threshold, circular];
  const number = (v, digits = 1) => Number.isFinite(v) ? v.toFixed(digits) : '—';
  const angle = v => Number.isFinite(v) ? `${Math.round(wrap(v)) % 360}°` : '—';
  const gain = (t, h) => t.gain_ready?.[h] === false ? '—' : `${t.gain_m[h] >= 0 ? '+' : ''}${number(t.gain_m[h], 0)}`;
  function boat(c, x, y, cog, selected, label, labelX, labelY) {
    c.save(); c.translate(x, y); c.rotate(cog * RAD);
    c.beginPath(); c.moveTo(0, -9); c.lineTo(-5, 7); c.lineTo(0, 4); c.lineTo(5, 7); c.closePath();
    c.fillStyle = selected ? INK : PAPER; c.fill(); c.strokeStyle = INK; c.lineWidth = 1.5; c.stroke();
    line(c, 0, -10, 0, -27); c.restore();
    text(c, labelX, labelY, label, 11, selected);
  }
  function createScene(data, view, config) {
    const targets = [...data.targets].sort((a, b) => a.mmsi - b.mmsi);
    const selected = targets.find(t => t.mmsi === view.selected) || targets[0];
    const items = [], statics = [];
    const add = (id, rect, metrics, paint, kind = 'value', key = '') => items.push({id, rect, metrics, paint, kind, key});
    const label = (x, y, s, size = 11) => statics.push(c => text(c, x, y, s, size));
    const value = (id, x, y, w, s, metrics, size = 23, key = '') =>
      add(id, {x, y, w, h: size + 7}, metrics, c => text(c, x, y, s, size, true), 'value', key);
    const own = data.own;
    const ownSog = own.sog_avg?.[120] ?? own.sog, ownCog = own.cog_avg?.[120] ?? own.cog;
    value('own', 23, 407, 525, `NOUS MOY.2′  ${number(ownSog, 2)} kn   ${angle(ownCog)}   AIS FICTIF`,
      [metric(ownSog, .05), metric(ownCog, 2, true)], 12);
    if (view.page === 0) {
      const cx = 281, cy = 245, scale = 145 / view.range;
      statics.push(c => {
        line(c, 568, 71, 568, 394, '#727972');
        c.save(); c.beginPath(); c.rect(20, 90, 532, 309); c.clip();
        for (const f of [.25, .5, 1]) {
          c.beginPath(); c.arc(cx, cy, 145 * f, 0, 2 * Math.PI); c.setLineDash([2, 5]);
          c.strokeStyle = '#969e94'; c.stroke(); c.setLineDash([]);
        }
        line(c, 36, cy, 540, cy, '#abb1a8', [2, 6]); line(c, cx, 99, cx, 392, '#abb1a8', [2, 6]);
        c.restore(); text(c, 30, 69, `N ↑   PORTÉE ${view.range} NM`, 12, true);
        text(c, 544, 69, 'VECTEURS COG', 11, false, 'right');
        text(c, 25, 388, `CERCLES ${[.25, .5, 1].map(f => number(view.range * f, 2)).join(' / ')} NM`, 10);
      });
      const points = [{...own, x: cx, y: cy, name: 'NOUS', isOwn: true}, ...targets.map(t => {
        const [east, north] = offset(own, t); let x = east * scale, y = -north * scale;
        const factor = Math.max(1, Math.abs(x) / 220, Math.abs(y) / 118);
        return {...t, x: cx + x / factor, y: cy + y / factor, outside: factor > 1};
      })];
      for (const t of points) {
        const x = t.x, y = t.y, name = t.outside ? `${t.name} ↗` : t.name;
        const lx = Math.max(23, Math.min(540 - name.length * 7, x + 9)), ly = Math.min(379, y + 10);
        const minX = Math.min(x - 31, lx - 2), minY = y - 31;
        add(`boat-${t.mmsi}`, {x: minX, y: minY, w: Math.max(x + 32, lx + name.length * 7) - minX, h: Math.max(y + 32, ly + 15) - minY},
          [metric(x, config.movement), metric(y, config.movement), metric(t.cog, 2, true)],
          c => boat(c, x, y, t.cog, t.isOwn || t.mmsi === view.selected, name, lx, ly), 'boat', `${name}:${t.mmsi === view.selected}`);
      }
      if (selected) {
        label(590, 70, 'CONCURRENT SÉLECTIONNÉ');
        statics.push(c => text(c, 590, 92, selected.name, 17, true));
        label(590, 129, 'DISTANCE / RELÈVEMENT');
        value('dist', 590, 148, 201, `${number(selected.distance_nm, 2)} NM`, [metric(selected.distance_nm, .01)], 29);
        value('bearing', 590, 181, 180, angle(selected.bearing_deg), [metric(selected.bearing_deg, 2, true)], 16);
        label(590, 215, 'SOG / COG MOY. 2 MIN');
        value('avg', 590, 237, 201, `${number(selected.sog_avg[120], 2)} / ${angle(selected.cog_avg[120])}`,
          [metric(selected.sog_avg[120], .05), metric(selected.cog_avg[120], 2, true)], 20);
        label(590, 281, 'GAIN SUR 5 MIN');
        value('gain', 590, 300, 200, `${gain(selected, 300)} m`, [metric(selected.gain_m[300], 5)], 27, String(selected.gain_ready?.[300]));
        label(590, 347, 'CPA / TCPA');
        value('cpa', 590, 366, 201, `${number(selected.cpa_nm, 2)} NM / ${number(selected.tcpa_min, 0)}′`,
          [metric(selected.cpa_nm, .01), metric(selected.tcpa_min, .5)], 15);
      }
    } else if (view.page === 1) {
      statics.push(c => {
        [['CONCURRENT', 28], ['NM', 272], ["SOG 2′", 352], ["COG 2′", 450], ["GAIN 5′", 548], ['CPA', 680]]
          .forEach(([s, x]) => text(c, x, 76, s, 13, true));
        for (let i = 0; i <= targets.length; i++) line(c, 23, 101 + i * 46, 777, 101 + i * 46, '#a8afa5');
      });
      targets.forEach((t, i) => {
        const y = 115 + i * 46;
        statics.push(c => text(c, 28, y, (t.mmsi === view.selected ? '› ' : '  ') + t.name, 15, t.mmsi === view.selected));
        const fields = [[272, number(t.distance_nm, 2), t.distance_nm, .01, false], [352, number(t.sog_avg[120], 2), t.sog_avg[120], .05, false],
          [450, angle(t.cog_avg[120]), t.cog_avg[120], 2, true], [548, gain(t, 300) + ' m', t.gain_m[300], 5, false], [680, number(t.cpa_nm, 2), t.cpa_nm, .01, false]];
        fields.forEach(([x, s, v, threshold, circular], j) => value(`row-${t.mmsi}-${j}`, x, y, j === 3 ? 124 : 88, s,
          [metric(v, threshold, circular)], 16, j === 3 ? String(t.gain_ready?.[300]) : ''));
      });
      label(25, 389, 'GAIN + : écart réduit · — : horizon encore incomplet');
    } else if (view.page === 2 && selected) {
      statics.push(c => text(c, 24, 71, selected.name, 19, true));
      label(475, 75, 'HISTORIQUE 30 MIN · POINTS 10 s');
      const end = data.timestamp, start = end - 1800;
      const samples = selected.history.filter((s, i, a) => s[0] >= start && (i === 0 || Math.floor(s[0] / 10) !== Math.floor(a[i - 1][0] / 10)));
      const motion = (selected.motion_history || []).filter(s => s[0] >= start);
      let prev = motion[0]?.[2] || 0, unwrapped = prev;
      const headings = motion.map(s => { unwrapped += (s[2] - prev + 540) % 360 - 180; prev = s[2]; return [s[0], unwrapped]; });
      const plots = [
        {label: 'ÉCART NM', pts: samples, pad: .02, digits: 2},
        {label: 'SOG kn', pts: motion.map(s => [s[0], s[1]]), pad: .15, digits: 1},
        {label: 'COG °', pts: headings, pad: 2, digits: 0}
      ];
      add('charts', {x: 23, y: 96, w: 754, h: 299}, [metric(Math.floor(end / 10), 1)], c => {
        plots.forEach((p, i) => {
          const x = 111, y = 106 + i * 94, w = 658, h = 66;
          text(c, 25, y, p.label, 12, true);
          if (!p.pts.length) { text(c, x, y + 22, 'Historique en cours…', 13); return; }
          const vals = p.pts.map(s => s[1]), low = Math.min(...vals) - p.pad, high = Math.max(...vals) + p.pad;
          for (const f of [0, .5, 1]) {
            const yy = y + h * (1 - f); line(c, x, yy, x + w, yy, '#adb4a9', [2, 4]);
            text(c, 104, yy - 7, number(low + f * (high - low), p.digits), 10, false, 'right');
          }
          c.beginPath(); c.strokeStyle = INK; c.lineWidth = 1.5;
          p.pts.forEach(([t, v], j) => { const xx = x + w * (t - start) / 1800, yy = y + h * (high - v) / (high - low);
            if (j) c.lineTo(xx, yy); else c.moveTo(xx, yy); }); c.stroke();
          const last = p.pts.at(-1); c.fillStyle = INK;
          c.fillRect(x + w * (last[0] - start) / 1800 - 2, y + h * (high - last[1]) / (high - low) - 2, 4, 4);
          text(c, x, y + h + 6, '−30 min', 10); text(c, x + w, y + h + 6, 'maintenant', 10, false, 'right');
        });
      }, 'graph');
    } else if (view.page === 3 && selected) {
      statics.push(c => { text(c, 25, 72, selected.name, 24, true); line(c, 378, 121, 378, 389, '#899184'); });
      label(25, 105, `MMSI ${selected.mmsi} · route vraie`);
      const fields = [
        ['DISTANCE / RELÈVEMENT', `${number(selected.distance_nm, 2)} NM / ${angle(selected.bearing_deg)}`, [metric(selected.distance_nm, .01), metric(selected.bearing_deg, 2, true)]],
        ['SOG / COG INSTANTANÉS', `${number(selected.sog, 2)} kn / ${angle(selected.cog)}`, [metric(selected.sog, .05), metric(selected.cog, 2, true)]],
        ['CPA / TCPA', `${number(selected.cpa_nm, 2)} NM / ${number(selected.tcpa_min, 1)} min`, [metric(selected.cpa_nm, .01), metric(selected.tcpa_min, .5)]]
      ];
      fields.forEach(([s, v, metrics], i) => { label(25, 147 + i * 78, s); value(`detail-${i}`, 25, 169 + i * 78, 344, v, metrics, 22); });
      label(405, 138, 'HORIZON'); label(552, 138, '30 s'); label(636, 138, '2 min'); label(717, 138, '5 min');
      [['SOG kn', 'sog_avg', .05], ['COG °', 'cog_avg', 2], ['GAIN m', 'gain_m', 5]].forEach(([s, field, threshold], i) => {
        label(405, 179 + i * 66, s, 14);
        [30, 120, 300].forEach((h, j) => value(`h-${field}-${h}`, 542 + j * 82, 178 + i * 66, 80,
          field === 'gain_m' ? gain(selected, h) : field === 'cog_avg' ? angle(selected[field][h]) : number(selected[field][h], 2),
          [metric(selected[field][h], threshold, field === 'cog_avg')], 16, field === 'gain_m' ? String(selected.gain_ready?.[h]) : ''));
      });
      label(405, 365, 'Gain + : rapprochement, pas classement.');
      label(405, 383, 'CPA : projection à vitesse constante.');
    }
    return {
      context: `${view.page}:${view.range}:${selected?.mmsi}:${view.profile}:${targets.map(t => t.mmsi).join(',')}`,
      items, reason: view.reason,
      background(c) {
        c.fillStyle = PAPER; c.fillRect(0, 0, 800, 480);
        text(c, 23, 18, 'SF3300 / AIS RACE', 20, true); text(c, 776, 22, pages[view.page], 16, true, 'right');
        line(c, 23, 53, 777, 53); line(c, 23, 437, 777, 437);
        text(c, 25, 454, '← PAGE', 12, true); text(c, 400, 454, '● CIBLE', 12, true, 'center');
        text(c, 775, 454, 'PAGE →', 12, true, 'right');
        for (const draw of statics) draw(c);
      }
    };
  }
  function render(scene, items, canvas) {
    const c = canvas.getContext('2d'); scene.background(c);
    for (const item of items.values()) { c.save(); c.beginPath(); c.rect(item.rect.x, item.rect.y, item.rect.w, item.rect.h); c.clip(); item.paint(c); c.restore(); }
  }
  class CanvasBackend {
    constructor(screen, overlay) {
      this.screen = screen; this.overlay = overlay; this.frame = document.createElement('canvas');
      this.frame.width = 800; this.frame.height = 480;
      this.previous = document.createElement('canvas'); this.previous.width = 800; this.previous.height = 480;
    }
    begin(plan) { render(plan.scene, plan.next, this.frame); }
    finish(plan, ghosting) {
      const c = this.screen.getContext('2d'), p = this.previous.getContext('2d');
      p.clearRect(0, 0, 800, 480); p.drawImage(this.screen, 0, 0);
      for (const r of plan.rects) {
        c.save(); c.beginPath(); c.rect(r.x, r.y, r.w, r.h); c.clip();
        c.drawImage(this.frame, 0, 0);
        if (!plan.full && ghosting) {
          // Old pigment remains faintly on newly white pixels; successive partials retain faint traces.
          c.globalCompositeOperation = 'multiply'; c.globalAlpha = .16; c.drawImage(this.previous, 0, 0);
        }
        c.restore();
      }
    }
    diagnostic(rects, score, enabled) {
      const c = this.overlay.getContext('2d'); c.clearRect(0, 0, 800, 480);
      if (!enabled) return;
      c.fillStyle = `rgba(215, 116, 35, ${Math.min(.15, score / 300)})`;
      c.strokeStyle = '#dd6927'; c.lineWidth = 1;
      for (const r of rects) { c.fillRect(r.x, r.y, r.w, r.h); c.strokeRect(r.x + .5, r.y + .5, r.w - 1, r.h - 1); }
    }
  }
  root.RaceRenderer = {pages, createScene, CanvasBackend};
})(window);
