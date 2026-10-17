// Render a whole story map to a PNG overview (level-design review), with optional annotations.
// node tools/mapshot.mjs <mapId> <out.png> [--scale=1] [--annotate] [--lit] [--state=<json flags>] [--chapter=N]
//   --annotate  draws anchors (yellow), exits (cyan), triggers (magenta), rooms (white labels), patrol (red)
//   --lit       applies the real lighting pass over the overview (as in play, flashlight off)
//   --state     JSON object merged into HW.state.flags before load (to see chapter variants)
import fs from 'node:fs';
import { launch, openGame } from '../tests/lib.mjs';

const [mapId, out] = process.argv.slice(2);
const args = Object.fromEntries(process.argv.slice(4).map((a) => { const m = a.match(/^--([^=]+)=?(.*)$/); return m ? [m[1], m[2] === '' ? true : m[2]] : [a, true]; }));
if (!mapId || !out) { console.error('usage: node tools/mapshot.mjs <mapId> <out.png> [--scale=1] [--annotate] [--state={...}] [--chapter=N]'); process.exit(2); }

const browser = await launch();
const game = await openGame(browser);
const res = await game.hw(async (H, id, opts) => {
  H.autoAdvance(true);
  await H.newGame({ skipIntro: true });
  const HW = window.HW || window.__HWINTERNAL;
  if (opts.chapter !== undefined) H.setChapter(Number(opts.chapter));
  if (opts.state) { const f = JSON.parse(opts.state); for (const k of Object.keys(f)) H.setFlag(k, f[k]); }
  const data = HW.data.maps[id];
  if (!data) return { error: `unknown map ${id}` };
  const first = Object.keys(data.anchors || {})[0];
  await H.teleport(id, first);
  await H.idle();
  const map = HW.map;
  map.refresh?.();
  const pw = map.w * 16, ph = map.h * 16;
  const c = document.createElement('canvas'); c.width = pw; c.height = ph;
  const ctx = c.getContext('2d'); ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, pw, ph);
  const L = map.getLayers(false);
  const cam = { x: 0, y: 0, w: pw, h: ph };
  const R = HW.renderer;
  const props = map.props.filter((p) => p.present !== false && !p.hidden);
  const mount = (p) => p.def?.mount || 'floor';
  ctx.drawImage(L.floor, 0, 0);
  for (const p of props) if (mount(p) === 'decal') R._drawProp(ctx, p, cam, false);
  ctx.drawImage(L.faces, 0, 0);
  for (const p of props) if (mount(p) === 'wall') R._drawProp(ctx, p, cam, false);
  const ys = props.filter((p) => mount(p) === 'floor').sort((a, b) => (a.y + (a.def?.h || 1)) - (b.y + (b.def?.h || 1)));
  for (const p of ys) R._drawProp(ctx, p, cam, false);
  ctx.drawImage(L.tops, 0, 0);
  for (const p of props) if (mount(p) === 'over') R._drawProp(ctx, p, cam, false);
  if (opts.annotate) {
    const d = map.data;
    ctx.font = '8px monospace'; ctx.textBaseline = 'top';
    const label = (x, y, t, col) => { ctx.fillStyle = 'rgba(0,0,0,.7)'; ctx.fillRect(x, y, ctx.measureText(t).width + 2, 9); ctx.fillStyle = col; ctx.fillText(t, x + 1, y); };
    for (const r of d.rooms || []) { const [x, y, w, h] = r.rect; ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.strokeRect(x * 16 + .5, y * 16 + .5, w * 16 - 1, h * 16 - 1); label(x * 16 + 2, y * 16 + 2, r.name, '#fff'); }
    if (d.patrol) { ctx.strokeStyle = 'rgba(255,60,60,.7)'; const N = d.patrol.nodes || {}; for (const [a, b] of d.patrol.edges || []) { if (!N[a] || !N[b]) continue; ctx.beginPath(); ctx.moveTo(N[a][0] * 16 + 8, N[a][1] * 16 + 8); ctx.lineTo(N[b][0] * 16 + 8, N[b][1] * 16 + 8); ctx.stroke(); } for (const f of d.patrol.folds || []) { ctx.fillStyle = '#f33'; ctx.fillRect(f[0] * 16 + 4, f[1] * 16 + 4, 8, 8); } }
    for (const e of d.exits || []) { const [x, y, w, h] = e.rect; ctx.fillStyle = 'rgba(0,220,255,.25)'; ctx.fillRect(x * 16, y * 16, w * 16, h * 16); label(x * 16, y * 16 + h * 16 - 9, `→${e.to}:${e.anchor || ''}`, '#0df'); }
    for (const t of d.triggers || []) { const [x, y, w, h] = t.rect; ctx.strokeStyle = 'rgba(255,0,255,.8)'; ctx.strokeRect(x * 16 + .5, y * 16 + .5, w * 16 - 1, h * 16 - 1); label(x * 16 + 1, y * 16 + 1, `⚑${t.id}`, '#f6f'); }
    for (const [n, a] of Object.entries(d.anchors || {})) { ctx.fillStyle = '#ff0'; ctx.fillRect(a[0] * 16 + 6, a[1] * 16 + 6, 4, 4); label(a[0] * 16 + 10, a[1] * 16 + 4, n, '#ff0'); }
  }
  const s = Number(opts.scale || 1);
  let outC = c;
  if (s !== 1) { outC = document.createElement('canvas'); outC.width = pw * s; outC.height = ph * s; const o = outC.getContext('2d'); o.imageSmoothingEnabled = false; o.drawImage(c, 0, 0, pw * s, ph * s); }
  return { png: outC.toDataURL('image/png'), w: map.w, h: map.h, props: map.props.length, errors: H.errors.slice() };
}, mapId, args);
if (res.error) { console.error(res.error); process.exit(1); }
fs.writeFileSync(out, Buffer.from(res.png.split(',')[1], 'base64'));
console.log(`[mapshot] ${mapId} ${res.w}x${res.h} tiles, ${res.props} props → ${out}${res.errors.length ? `\nerrors:\n${res.errors.join('\n')}` : ''}`);
await game.close(); await browser.close();
