#!/usr/bin/env node
/* Render art for review.
 *   node tools/shoot.mjs bg kitchen:morning,evening larch_ext:all
 *   node tools/shoot.mjs cg cg_wall
 *   node tools/shoot.mjs char gus:all mom:smile,sad
 *   node tools/shoot.mjs scene kitchen:evening mom:smile:left teddy:grin:right
 * Options: --out <dir> (default: $SHOTS or ./.shots), --full (1600x900 instead of 800x450)
 */
import { chromium } from 'playwright-core';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const full = args.includes('--full');
let out = process.env.SHOTS || path.join(root, '.shots');
const oi = args.indexOf('--out');
if (oi >= 0) { out = args[oi + 1]; args.splice(oi, 2); }
const rest = args.filter((a) => !a.startsWith('--'));
const mode = rest.shift();
fs.mkdirSync(out, { recursive: true });

const artFiles = fs.readdirSync(path.join(root, 'js/art')).filter((f) => f.endsWith('.js') && f !== 'kit.js' && f !== 'portraits.js').sort();
const scripts = ['js/art/kit.js', 'js/art/portraits.js', ...artFiles.map((f) => 'js/art/' + f)].map((f) => `<script src="file://${path.join(root, f)}"></script>`).join('\n');
const grain = (() => {
  // tiny deterministic noise tile as data URI (generated in page)
  return '';
})();
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
body{margin:0;background:#000}
.stage{position:relative;width:1600px;height:900px;overflow:hidden;transform-origin:0 0}
.stage>svg,.layer>svg{position:absolute;inset:0;width:100%;height:100%}
.layer{position:absolute;inset:0}
.vig{position:absolute;inset:0;background:radial-gradient(ellipse at 50% 45%,rgba(0,0,0,0) 55%,rgba(5,7,12,.5) 100%);pointer-events:none}
.grain{position:absolute;inset:0;opacity:.10;mix-blend-mode:overlay;pointer-events:none}
.sprite{position:absolute;bottom:-40px;width:560px;height:840px;transform:translateX(-50%)}
.sprite svg{width:100%;height:100%}
.sheet{display:flex;flex-wrap:wrap;width:1600px;background:#2a2f3a;gap:0}
.cell{width:228px;height:342px;position:relative;background:linear-gradient(#58627a,#2a2f3a)}
.cell svg{width:100%;height:100%}
.eyes-closed{opacity:0}
.big{width:600px;height:900px;position:relative;background:linear-gradient(#58627a,#2a2f3a)}.big svg{width:100%;height:100%}
.cell b{position:absolute;left:6px;top:4px;font:13px sans-serif;color:#fff;opacity:.8}
</style>${scripts}</head><body><div id="root"></div>
<script>
function grainURL(){const c=document.createElement('canvas');c.width=c.height=256;const x=c.getContext('2d');const d=x.createImageData(256,256);for(let i=0;i<d.data.length;i+=4){const v=Math.random()*255;d.data[i]=d.data[i+1]=d.data[i+2]=v;d.data[i+3]=255;}x.putImageData(d,0,0);return c.toDataURL();}
window.renderScene=function(bg,time,variant,sprites,scale){
  const r=KIT.renderBg(bg,time,variant);
  const L=r?r.light:{r:1,g:1,b:1,s:1};
  let h='<div class="stage" style="transform:scale('+scale+')">'+(r?r.svg:'<b style="color:red">missing '+bg+'</b>');
  for(const s of sprites){const x={left:400,center:800,right:1200,farleft:250,farright:1350}[s.pos||'center'];
    const svg=KIT.renderChar(s.id,s.expr)||'';
    h+='<div class="sprite" style="left:'+x+'px;filter:'+spriteFilter(L)+'">'+svg+'</div>';}
  h+='<div class="vig"></div><div class="grain" style="background-image:url('+grainURL()+')"></div></div>';
  document.getElementById('root').innerHTML=h;
};
function spriteFilter(L){const avg=(L.r+L.g+L.b)/3;return 'brightness('+avg.toFixed(3)+') saturate('+(L.s||1)+') sepia('+Math.max(0,(L.r-L.b)*0.6).toFixed(3)+')'+(L.b>L.r+0.1?' hue-rotate(-8deg)':'');}
window.renderBig=function(id,expr){document.getElementById('root').innerHTML='<div class="big">'+(KIT.renderChar(id,expr)||'')+'</div>';};
window.renderSheet=function(id,exprs){
  let h='<div class="sheet">';
  for(const e of exprs){h+='<div class="cell"><b>'+id+':'+e+'</b>'+(KIT.renderChar(id,e)||'')+'</div>';}
  document.getElementById('root').innerHTML=h+'</div>';
};
</script></body></html>`;
const tmp = path.join(out, '_gallery.html');
fs.writeFileSync(tmp, html);

const EXPRS = ['neutral', 'smile', 'grin', 'laugh', 'sad', 'angry', 'surprised', 'afraid', 'worried', 'thinking', 'smirk', 'flat', 'blush', 'cry'];
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell', args: ['--allow-file-access-from-files'] });
const scale = full ? 1 : 0.5;
const page = await browser.newPage({ viewport: { width: Math.round(1600 * scale), height: Math.round(900 * scale) } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto('file://' + tmp);
const written = [];

async function shotScene(bg, time, variant, sprites, name) {
  await page.setViewportSize({ width: Math.round(1600 * scale), height: Math.round(900 * scale) });
  await page.evaluate(([bg, time, variant, sprites, scale]) => window.renderScene(bg, time, variant, sprites, scale), [bg, time, variant, sprites, scale]);
  const file = path.join(out, name + '.png');
  await page.screenshot({ path: file });
  written.push(file);
}

if (mode === 'bg' || mode === 'cg') {
  for (const spec of rest) {
    const [id, timesStr, variant] = spec.split(':');
    const def = await page.evaluate(([id]) => { const d = ART.bgs[id] || ART.cgs[id]; return d ? { times: d.times || [null] } : null; }, [id]);
    if (!def) { console.log('missing', id); continue; }
    const times = !timesStr || timesStr === 'all' ? def.times : timesStr.split(',');
    for (const t of times) await shotScene(id, t, variant, [], `${id}${t ? '_' + t : ''}${variant ? '_' + variant : ''}`);
  }
} else if (mode === 'char') {
  for (const spec of rest) {
    const [id, ex] = spec.split(':');
    const exprs = !ex || ex === 'all' ? EXPRS : ex.split(',');
    const rows = Math.ceil(exprs.length / 7);
    await page.setViewportSize({ width: 1600, height: 342 * rows });
    await page.evaluate(([id, exprs]) => window.renderSheet(id, exprs), [id, exprs]);
    const file = path.join(out, `char_${id}${ex && ex !== 'all' ? '_' + ex.replace(/,/g, '-') : ''}.png`);
    await page.screenshot({ path: file, fullPage: true });
    written.push(file);
  }
} else if (mode === 'big') {
  for (const spec of rest) {
    const [id, ex] = spec.split(':');
    await page.setViewportSize({ width: 600, height: 900 });
    await page.evaluate(([id, ex]) => window.renderBig(id, ex), [id, ex || 'neutral']);
    const file = path.join(out, `big_${id}_${ex || 'neutral'}.png`);
    await page.screenshot({ path: file });
    written.push(file);
  }
} else if (mode === 'scene') {
  const [bgSpec, ...spr] = rest;
  const [bg, time, variant] = bgSpec.split(':');
  const sprites = spr.map((s) => { const [id, expr, pos] = s.split(':'); return { id, expr, pos }; });
  await shotScene(bg, time, variant, sprites, `scene_${bg}_${time || ''}_${sprites.map((s) => s.id).join('-')}`);
} else {
  console.log('usage: shoot.mjs bg|cg|char|scene specs...');
}
await browser.close();
if (errors.length) console.log('PAGE ERRORS:\n' + [...new Set(errors)].join('\n'));
console.log(written.join('\n'));
