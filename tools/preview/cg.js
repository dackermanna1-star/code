// CG + icon contact sheets.
//   ?sheet=<cg id>     a CG at several t / params (scale via &scale=, default 2; &t=0,1.3 &p=json)
//   ?sheet=all         every CG once at 1×, with build timings
//   ?sheet=icons       item icons + glyphs at 1×, 2×, 4× on the UI's dark slot colours
//   ?sheet=ui          title_bg with the title UI's logo/menu regions outlined; dialogue box mock on others
//   &crop=x,y,w,h      zoom into a region
//   &guides=1          outline the UI dialogue box + portrait zones
import { initCg, getCg, CG_IDS } from '../../src/art/cg.js';
import { CG_PRESETS } from './cg_presets.js';

const q = new URLSearchParams(location.search);
const sheet = q.get('sheet') || 'all';
const scale = Number(q.get('scale') || 2);
const root = document.getElementById('root');

function h2(t) { const d = document.createElement('h2'); d.textContent = t; root.appendChild(d); }
function row() { const d = document.createElement('div'); d.className = 'row'; root.appendChild(d); return d; }
function cell(parent, label, w, h) {
  const d = document.createElement('div'); d.className = 'cell';
  const s = document.createElement('span'); s.textContent = label; d.appendChild(s);
  const c = document.createElement('canvas'); c.width = w; c.height = h; d.appendChild(c);
  parent.appendChild(d);
  const x = c.getContext('2d'); x.imageSmoothingEnabled = false; return x;
}
const off = document.createElement('canvas'); off.width = 480; off.height = 270;
const ox = off.getContext('2d'); ox.imageSmoothingEnabled = false;

function render(id, t, params) {
  ox.setTransform(1, 0, 0, 1, 0, 0); ox.globalAlpha = 1; ox.globalCompositeOperation = 'source-over';
  ox.fillStyle = '#000'; ox.fillRect(0, 0, 480, 270);
  const t0 = performance.now();
  getCg(id).draw(ox, t, params);
  return performance.now() - t0;
}
function guides(x, s, id) {
  x.save(); x.scale(s, s); x.lineWidth = 1 / s;
  if (id === 'title_bg') {
    x.strokeStyle = 'rgba(255,220,120,0.7)'; x.strokeRect(120, 45, 240, 80);    // logo + subtitle
    x.strokeStyle = 'rgba(120,200,255,0.7)'; x.strokeRect(150, 160, 180, 80);   // menu
  } else {
    x.strokeStyle = 'rgba(255,220,120,0.6)'; x.strokeRect(10, 188, 460, 75);    // dialogue box
    x.strokeStyle = 'rgba(120,200,255,0.45)'; x.strokeRect(8, 70, 100, 120); x.strokeRect(372, 70, 100, 120); // portraits
  }
  x.restore();
}

async function main() {
  const t0 = performance.now();
  await initCg();
  const tInit = performance.now() - t0;
  if (sheet === 'icons') {
    const m = await import('./cg_icons_sheet.js');
    await m.iconSheet(root);
  } else if (sheet === 'all') {
    h2(`all CGs @1× — initCg ${tInit.toFixed(0)} ms`);
    const r = row();
    for (const id of CG_IDS) {
      const ms = render(id, 1.0, (CG_PRESETS[id] || [{}])[0].p || {});
      const x = cell(r, `${id} — first draw ${ms.toFixed(0)} ms`, 480, 270);
      x.drawImage(off, 0, 0);
    }
  } else {
    const id = sheet;
    const presets = q.get('t') || q.get('p')
      ? (q.get('t') || '0').split(',').map((t) => ({ t: Number(t), p: q.get('p') ? JSON.parse(q.get('p')) : {} }))
      : (CG_PRESETS[id] || [{ t: 0, p: {} }]);
    h2(`${id} @${scale}× — initCg ${tInit.toFixed(0)} ms`);
    const r = row();
    let first = true;
    for (const pr of presets) {
      const ms = render(id, pr.t, pr.p || {});
      const cr = q.get('crop') ? q.get('crop').split(',').map(Number) : [0, 0, 480, 270];
      const x = cell(r, `t=${pr.t} ${JSON.stringify(pr.p || {})}${first ? ` — first draw ${ms.toFixed(0)} ms` : ` — ${ms.toFixed(1)} ms`}`, cr[2] * scale, cr[3] * scale);
      first = false;
      x.drawImage(off, cr[0], cr[1], cr[2], cr[3], 0, 0, cr[2] * scale, cr[3] * scale);
      if (q.get('guides')) guides(x, scale, id);
    }
    // per-frame cost
    const N = 60; const tt = performance.now();
    for (let i = 0; i < N; i++) render(id, 3 + i / 60, presets[0].p || {});
    h2(`avg draw ${((performance.now() - tt) / N).toFixed(2)} ms/frame`);
  }
  window.__ready = true;
}
main().catch((e) => { console.error(e); window.__ready = true; });
