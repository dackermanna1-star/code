#!/usr/bin/env node
/* Render pixel art (js/px) to PNG for review.
 *   node tools/pxshoot.mjs char gus:all            expression sheet (+ blink row)
 *   node tools/pxshoot.mjs char gus:smile,sad
 *   node tools/pxshoot.mjs bg larch_ext:all kitchen:evening
 *   node tools/pxshoot.mjs cg cg_tape:side_a
 *   node tools/pxshoot.mjs scene larch_ext:day gus:smile:left mom:neutral:right
 *   node tools/pxshoot.mjs palette
 * Options: --out <dir> (default .shots/px), --scale N (default 4 chars / 3 bg),
 *          --native (also write 1x PNGs)
 */
import { chromium } from 'playwright-core';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); if (i < 0) return def; const v = args[i + 1]; args.splice(i, 2); return v; };
const flag = (name) => { const i = args.indexOf(name); if (i < 0) return false; args.splice(i, 1); return true; };
let out = opt('--out', process.env.SHOTS ? path.join(process.env.SHOTS) : path.join(root, '.shots', 'px'));
const scaleArg = opt('--scale', null);
const native = flag('--native');
const mode = args.shift();
fs.mkdirSync(out, { recursive: true });

const pxDir = path.join(root, 'js/px');
const files = ['px.js', 'pxchar.js', ...fs.readdirSync(pxDir).filter((f) => f.endsWith('.js') && f !== 'px.js' && f !== 'pxchar.js').sort()];
const html = `<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0;background:#222">${files.map((f) => `<script src="file://${path.join(pxDir, f)}"></script>`).join('')}</body></html>`;
const tmp = path.join(out, '_px.html');
fs.writeFileSync(tmp, html);

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell', args: ['--allow-file-access-from-files'] });
const page = await browser.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
await page.goto('file://' + tmp);
await page.waitForFunction(() => window.PX && window.PX.ART);

const save = async (name, dataUrl) => { const f = path.join(out, name + '.png'); fs.writeFileSync(f, Buffer.from(dataUrl.split(',')[1], 'base64')); console.log(f); };

if (mode === 'char') {
  const scale = +(scaleArg || 4);
  for (const spec of args) {
    const [id, list] = spec.split(':');
    const res = await page.evaluate(({ id, list, scale }) => {
      if (!PX.ART.chars[id]) return { err: 'no character ' + id };
      const exprs = !list || list === 'all' ? PX.RIG.EXPRS : list.split(',');
      const cols = Math.min(7, exprs.length), rows = Math.ceil(exprs.length / cols);
      const cw = PX.SW * scale, ch = PX.SH * scale, lab = 14 * Math.max(1, scale / 3);
      const blinkRow = !list || list === 'all';
      const sheet = document.createElement('canvas');
      sheet.width = cols * cw; sheet.height = (rows + (blinkRow ? 1 : 0)) * (ch + lab);
      const g = sheet.getContext('2d');
      g.fillStyle = '#3b4560'; g.fillRect(0, 0, sheet.width, sheet.height);
      g.imageSmoothingEnabled = false;
      const draw = (cv, i, label, rowOff = 0) => {
        const x = (i % cols) * cw, y = (Math.floor(i / cols) + rowOff) * (ch + lab);
        g.fillStyle = (i + Math.floor(i / cols)) % 2 ? '#46506c' : '#3b4560'; g.fillRect(x, y, cw, ch + lab);
        g.drawImage(cv, x, y + lab, cw, ch);
        g.fillStyle = '#e9e1cf'; g.font = `${Math.round(lab * 0.8)}px monospace`; g.fillText(label, x + 4, y + lab * 0.85);
      };
      exprs.forEach((e, i) => draw(PX.drawChar(id, e, {}), i, e));
      if (blinkRow) ['neutral', 'smile', 'sad', 'angry', 'flat', 'worried', 'afraid'].forEach((e, i) => draw(PX.drawChar(id, e, { blink: true }), i, e + ' (blink)', rows));
      return { sheet: sheet.toDataURL(), single: exprs.length === 1 ? PX.upscale(PX.drawChar(id, exprs[0], {}), scale).toDataURL() : null };
    }, { id, list, scale });
    if (res.err) { console.error(res.err); continue; }
    await save(`char_${id}${list && list !== 'all' ? '_' + list.replace(/,/g, '-') : ''}`, res.sheet);
  }
} else if (mode === 'bg' || mode === 'cg') {
  const scale = +(scaleArg || 3);
  for (const spec of args) {
    const [id, list, variant] = spec.split(':');
    const res = await page.evaluate(({ id, list, variant, scale, native }) => {
      const def = PX.ART.bgs[id] || PX.ART.cgs[id];
      if (!def) return { err: 'no background ' + id };
      const times = !list || list === 'all' ? (def.times || [null]) : list.split(',');
      const variants = variant ? [variant] : (def.variants && (!list || list === 'all') ? [null, ...def.variants] : [null]);
      const outs = [];
      for (const t of times) for (const v of variants) {
        const t0 = performance.now();
        const r = PX.drawBg(id, t, v);
        const ms = performance.now() - t0;
        outs.push({ name: `${id}_${r.time || 'x'}${v ? '_' + v : ''}`, url: PX.upscale(r.canvas, scale).toDataURL(), raw: native ? r.canvas.toDataURL() : null, ms: Math.round(ms) });
      }
      return { outs };
    }, { id, list, variant, scale, native });
    if (res.err) { console.error(res.err); continue; }
    for (const o of res.outs) { await save(o.name, o.url); if (o.raw) await save(o.name + '_1x', o.raw); console.log(`  (${o.ms} ms)`); }
  }
} else if (mode === 'scene') {
  const scale = +(scaleArg || 4);
  const [bgSpec, ...chars] = args;
  const res = await page.evaluate(({ bgSpec, chars, scale }) => {
    const [id, time, variant] = bgSpec.split(':');
    const r = PX.drawBg(id, time, variant);
    if (!r) return { err: 'no background ' + id };
    const c = document.createElement('canvas'); c.width = PX.W * scale; c.height = PX.H * scale;
    const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
    g.drawImage(r.canvas, 0, 0, c.width, c.height);
    const POS = { left: 0.27, center: 0.5, right: 0.73, farleft: 0.13, farright: 0.87 };
    const L = PX.SPRITE_LIGHT[r.lightName] || PX.SPRITE_LIGHT.day;
    for (const cs of chars) {
      const [cid, expr, pos] = cs.split(':');
      const flip = (pos || 'center').includes('left');
      const cv = PX.drawChar(cid, expr || 'neutral', { flip });
      if (!cv) continue;
      // tint like the engine's sprite filter (gain only; saturation ignored here)
      const t = document.createElement('canvas'); t.width = cv.width; t.height = cv.height;
      const tg = t.getContext('2d'); tg.drawImage(cv, 0, 0);
      const d = tg.getImageData(0, 0, t.width, t.height);
      for (let i = 0; i < d.data.length; i += 4) { d.data[i] *= L.r; d.data[i + 1] *= L.g; d.data[i + 2] *= L.b; }
      tg.putImageData(d, 0, 0);
      const h = PX.H * 0.98 * scale, w = h * PX.SW / PX.SH;
      const x = PX.W * scale * (POS[pos] || 0.5) - w / 2, y = PX.H * scale * (0.11);
      g.drawImage(t, Math.round(x), Math.round(y), Math.round(w), Math.round(h));
    }
    // dialogue box guide (bottom 28%)
    g.fillStyle = 'rgba(13,15,22,0.55)'; g.fillRect(PX.W * scale * 0.03, PX.H * scale * 0.73, PX.W * scale * 0.94, PX.H * scale * 0.24);
    return { url: c.toDataURL(), name: 'scene_' + [bgSpec, ...chars].join('_').replace(/[:]/g, '-') };
  }, { bgSpec, chars, scale });
  if (res.err) console.error(res.err); else await save(res.name, res.url);
} else if (mode === 'palette') {
  const res = await page.evaluate(() => {
    const names = Object.keys(PX.P);
    const sw = 22, c = document.createElement('canvas');
    c.width = 150 + 8 * sw; c.height = names.length * sw;
    const g = c.getContext('2d'); g.fillStyle = '#222'; g.fillRect(0, 0, c.width, c.height);
    g.font = '12px monospace';
    names.forEach((n, i) => {
      g.fillStyle = '#ddd'; g.fillText(n, 4, i * sw + 15);
      PX.P[n].forEach((code, k) => { g.fillStyle = PX.rgbHex(PX.rgbOf(code)); g.fillRect(150 + k * sw, i * sw + 1, sw - 2, sw - 2); });
    });
    return c.toDataURL();
  });
  await save('palette', res);
} else {
  console.log('usage: pxshoot.mjs char|bg|cg|scene|palette ...');
}
if (errors.length) console.log('ERRORS:\n' + [...new Set(errors)].join('\n'));
await browser.close();
fs.unlinkSync(tmp);
