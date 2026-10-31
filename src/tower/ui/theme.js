// LAST LOOKOUT — UI theme: palette and the stylesheet injected by TowerHud (a weathered field radio
// / 90s military terminal: amber phosphor on olive-black, corner brackets, scanlines, grain).
// Font sizes are multiples of 4 px so the pixel font stays on the device grid at DPR 2.

import { FONT_STACK } from './pixelFont.js';

export const COLORS = {
  amber: '#ffb43a', amberHi: '#ffe08a', amberDim: '#9a6a1e', amberDeep: '#3d2a0c',
  bone: '#efe3c4', khaki: '#b8ac78', rust: '#e0502e', rustDim: '#6e2214', blood: '#8e1b14',
  green: '#a6d65e', greenDim: '#3e5a22', olive0: '#0c0d08', olive1: '#15170e', olive2: '#202317',
  olive3: '#373b24', olive4: '#5d6238', cyan: '#7fd8e0',
};

/** Corner brackets drawn with 8 background gradients (no extra elements). */
const brackets = (c, len = 10, t = 2) => [
  `linear-gradient(${c},${c}) left top/${len}px ${t}px`, `linear-gradient(${c},${c}) left top/${t}px ${len}px`,
  `linear-gradient(${c},${c}) right top/${len}px ${t}px`, `linear-gradient(${c},${c}) right top/${t}px ${len}px`,
  `linear-gradient(${c},${c}) left bottom/${len}px ${t}px`, `linear-gradient(${c},${c}) left bottom/${t}px ${len}px`,
  `linear-gradient(${c},${c}) right bottom/${len}px ${t}px`, `linear-gradient(${c},${c}) right bottom/${t}px ${len}px`,
].join(',');

export function themeCSS(noiseUrl, grungeUrl = noiseUrl) {
  const C = COLORS;
  return `
.ll { position: fixed; inset: 0; pointer-events: none; z-index: 40; overflow: hidden;
  font-family: ${FONT_STACK}; font-size: 16px; line-height: 1.25; color: ${C.bone};
  font-synthesis: none; font-kerning: none; font-variant-ligatures: none; -webkit-font-smoothing: none;
  text-rendering: optimizeSpeed; user-select: none; -webkit-user-select: none; letter-spacing: 0;
  --amber: ${C.amber}; --amber-hi: ${C.amberHi}; --amber-dim: ${C.amberDim}; --amber-deep: ${C.amberDeep};
  --bone: ${C.bone}; --khaki: ${C.khaki}; --rust: ${C.rust}; --rust-dim: ${C.rustDim}; --green: ${C.green};
  --o0: ${C.olive0}; --o1: ${C.olive1}; --o2: ${C.olive2}; --o3: ${C.olive3}; --o4: ${C.olive4};
  --noise: url(${noiseUrl}); --grunge: url(${grungeUrl}); }
.ll * { box-sizing: border-box; }
.ll canvas { image-rendering: pixelated; image-rendering: crisp-edges; }
.ll .pxc { image-rendering: pixelated; }
.ll .f12 { font-size: 12px; } .ll .f16 { font-size: 16px; } .ll .f24 { font-size: 24px; } .ll .f32 { font-size: 32px; }
.ll .f48 { font-size: 48px; } .ll .f64 { font-size: 64px; }
.ll .amb { color: var(--amber); } .ll .dim { color: var(--khaki); opacity: .8; } .ll .rust { color: var(--rust); }
.ll .grn { color: var(--green); }
.ll .glow { text-shadow: 2px 2px 0 rgba(0,0,0,.85), 0 0 8px rgba(255,170,50,.35); }
.ll .sh { text-shadow: 2px 2px 0 rgba(0,0,0,.85); }
.ll .sh1 { text-shadow: 1px 1px 0 rgba(0,0,0,.9); }
.ll .lbl { font-size: 12px; color: var(--khaki); letter-spacing: 1px; text-shadow: 1px 1px 0 rgba(0,0,0,.9); }
.ll .key { display: inline-block; min-width: 20px; padding: 1px 4px 0; margin: 0 2px; font-size: 12px; line-height: 15px;
  text-align: center; color: var(--o0); background: var(--khaki); border-bottom: 3px solid #6f6744; border-radius: 1px;
  text-shadow: none; vertical-align: 1px; }
.ll .hide { display: none !important; }

/* ---------- panels ---------- */
.ll .pn { position: absolute; padding: 8px 12px 8px; background: linear-gradient(180deg, rgba(23,25,15,.84), rgba(10,11,7,.88));
  border: 2px solid rgba(70,75,45,.9); box-shadow: 0 0 0 2px rgba(0,0,0,.55), inset 0 1px 0 rgba(255,225,160,.06); }
.ll .pn::before { content: ''; position: absolute; inset: -6px; pointer-events: none; background: ${brackets('rgba(255,180,58,.75)')};
  background-repeat: no-repeat; }
.ll .pn::after { content: ''; position: absolute; inset: 0; pointer-events: none;
  background: repeating-linear-gradient(180deg, rgba(255,255,255,.035) 0 1px, transparent 1px 3px), var(--noise); opacity: .9; }
.ll .pn > * { position: relative; z-index: 1; }
.ll .pn.alert { border-color: rgba(224,80,46,.9); }
.ll .pn.alert::before { background: ${brackets('rgba(224,80,46,.95)')}; background-repeat: no-repeat; }

/* ---------- hud layout ---------- */
.ll .hud { position: absolute; inset: 0; transition: opacity .25s; }
.ll.m-title .hud, .ll.m-shop .hud .play, .ll.m-over .hud { opacity: 0; }
.ll .tl { left: 24px; top: 22px; min-width: 196px; }
.ll .tl .row { display: flex; align-items: baseline; justify-content: space-between; gap: 16px; }
.ll .wave-n { font-size: 32px; color: var(--amber); }
.ll .tod { display: flex; align-items: center; gap: 6px; }
.ll .tod canvas { width: 24px; height: 24px; }
.ll .left { margin-top: 2px; }
.ll .left b { color: var(--bone); font-weight: normal; }
.ll .fps { position: absolute; left: 24px; top: 4px; font-size: 12px; color: var(--green); text-shadow: 1px 1px 0 #000; }
.ll .tr { right: 24px; top: 22px; text-align: right; min-width: 196px; }
.ll .cash { font-size: 32px; color: var(--amber-hi); white-space: nowrap; }
.ll .cash .cur { color: var(--amber); }
.ll .cashpop { position: absolute; right: 30px; top: 136px; width: 300px; height: 0; }
.ll .cashpop div { position: absolute; right: 0; top: 0; font-size: 24px; white-space: nowrap; color: var(--green);
  text-shadow: 2px 2px 0 rgba(0,0,0,.9), 0 0 10px rgba(160,230,90,.35); opacity: 0; }
.ll .cashpop div.neg { color: var(--rust); text-shadow: 2px 2px 0 rgba(0,0,0,.9); }
.ll .feed { position: absolute; right: 24px; top: 176px; display: flex; flex-direction: column; align-items: flex-end; gap: 4px; }
.ll .feed div { font-size: 12px; padding: 3px 8px 2px; background: rgba(10,11,7,.72); border-left: 2px solid var(--amber-dim);
  color: var(--bone); text-shadow: 1px 1px 0 #000; white-space: nowrap; display: flex; align-items: center; gap: 6px; }
.ll .feed div.hs { border-left-color: var(--rust); }
.ll .feed div.big { border-left-color: var(--amber); color: var(--amber-hi); }
.ll .feed canvas { width: 18px; height: 18px; }

.ll .bl { left: 24px; bottom: 22px; width: 300px; }
.ll .meter { display: grid; grid-template-columns: 24px 1fr auto; align-items: center; gap: 8px; }
.ll .meter + .meter { margin-top: 8px; }
.ll .meter canvas { width: 24px; height: 24px; }
.ll .meter .val { font-size: 16px; min-width: 52px; text-align: right; }
.ll .meter .cap { grid-column: 2 / 4; margin-bottom: -4px; display: flex; justify-content: space-between; }
.ll .seg { position: relative; height: 14px; background: rgba(0,0,0,.6); border: 2px solid var(--o3); }
.ll .seg .w { position: absolute; inset: 2px; -webkit-mask: repeating-linear-gradient(90deg,#000 0 7px,transparent 7px 9px);
  mask: repeating-linear-gradient(90deg,#000 0 7px,transparent 7px 9px); }
.ll .seg .trl, .ll .seg .fl { position: absolute; inset: 0; transform-origin: 0 50%; }
.ll .seg .trl { background: var(--bone); opacity: .55; }
.ll .seg .fl { background: linear-gradient(180deg, var(--amber-hi) 0 30%, var(--amber) 30% 80%, var(--amber-dim) 80%); }
.ll .seg.low .fl { background: linear-gradient(180deg, #ff9a7a 0 30%, var(--rust) 30% 80%, var(--rust-dim) 80%); }
.ll .seg.hp .fl { background: linear-gradient(180deg, #fff6dc 0 30%, var(--bone) 30% 80%, #a59a7a 80%); }
.ll .seg.hp.low .fl { background: linear-gradient(180deg, #ff9a7a 0 30%, var(--rust) 30% 80%, var(--rust-dim) 80%); }
.ll .seg.flash { border-color: var(--rust); }
.ll .shake { animation: ll-shake .32s steps(2) 1; }
@keyframes ll-shake { 0% { transform: translate(3px,0);} 25% { transform: translate(-3px,1px);} 50% { transform: translate(2px,-1px);}
  75% { transform: translate(-1px,0);} 100% { transform: none; } }

.ll .br { right: 24px; bottom: 22px; min-width: 260px; text-align: right; }
.ll .rifle { font-size: 16px; color: var(--bone); white-space: nowrap; }
.ll .rounds { display: flex; justify-content: flex-end; align-items: flex-end; gap: 3px; margin: 8px 0 6px; min-height: 36px; flex-wrap: nowrap; }
.ll .rounds canvas { flex: none; }
.ll .ammo-line { display: flex; justify-content: flex-end; align-items: baseline; gap: 10px; white-space: nowrap; }
.ll .ammo-type { color: var(--amber); }
.ll .reserve { font-size: 16px; color: var(--bone); }
.ll .wstate { position: absolute; left: 12px; top: 8px; font-size: 12px; color: var(--amber); letter-spacing: 1px; }
.ll .wstate.blink { animation: ll-blink .5s steps(1) infinite; }
@keyframes ll-blink { 50% { opacity: .25; } }

.ll .bc { position: absolute; left: 50%; bottom: 22px; transform: translateX(-50%); display: flex; gap: 22px; align-items: center; transition: opacity .2s; }
.ll .mini { display: flex; align-items: center; gap: 6px; transition: opacity .3s; }
.ll .mini canvas { width: 24px; height: 24px; }
.ll .mini .seg { width: 120px; height: 12px; }
.ll .mini .seg .w { -webkit-mask: repeating-linear-gradient(90deg,#000 0 5px,transparent 5px 7px); mask: repeating-linear-gradient(90deg,#000 0 5px,transparent 5px 7px); }
.ll .mini.focus .seg .fl { background: linear-gradient(180deg, #d8fbff 0 30%, ${C.cyan} 30% 80%, #2e7a84 80%); }
.ll .mini.focus.full .seg { border-color: ${C.cyan}; box-shadow: 0 0 8px rgba(127,216,224,.45); }
.ll .mini.focus.on .seg { animation: ll-blink .3s steps(1) infinite; }
.ll .mini.breath.hold .seg { border-color: var(--amber); }

.ll .boss { position: absolute; left: 50%; top: 22px; transform: translateX(-50%); width: min(560px, 60vw); padding: 8px 14px 10px; text-align: center; }
.ll .boss .name { font-size: 16px; color: var(--rust); letter-spacing: 2px; display: flex; justify-content: space-between; align-items: baseline; }
.ll .boss .seg { height: 16px; margin-top: 6px; border-color: var(--rust-dim); }
.ll .boss .seg .fl { background: linear-gradient(180deg, #ff9a7a 0 30%, var(--rust) 30% 80%, var(--rust-dim) 80%); }
.ll .boss .seg .w { -webkit-mask: repeating-linear-gradient(90deg,#000 0 10px,transparent 10px 12px); mask: repeating-linear-gradient(90deg,#000 0 10px,transparent 10px 12px); }

/* centre: hip reticle, hit markers, bonus popups */
.ll .hip { position: absolute; left: 50%; top: 50%; width: 30px; height: 30px; margin: -15px 0 0 -15px; transition: opacity .12s; }
.ll .hm { position: absolute; left: 50%; top: 50%; width: 42px; height: 42px; margin: -21px 0 0 -21px; opacity: 0; }
.ll .bonus { position: absolute; left: calc(50% + 70px); top: calc(50% - 30px); width: 0; height: 0; }
.ll .bonus div { position: absolute; left: 0; top: 0; white-space: nowrap; opacity: 0; transform-origin: 0 50%; }
.ll .bonus .t { font-size: 24px; color: var(--amber-hi); text-shadow: 2px 2px 0 rgba(0,0,0,.9), 0 0 12px rgba(255,170,50,.4); }
.ll .bonus .t.hs { color: #ff8a5c; }
.ll .bonus .c { font-size: 16px; color: var(--green); margin-left: 10px; text-shadow: 2px 2px 0 rgba(0,0,0,.9); }

/* wave banners */
.ll .banner { position: absolute; left: 0; right: 0; top: 26%; height: 0; display: flex; justify-content: center; }
.ll .band { position: absolute; top: -10px; left: 0; right: 0; padding: 18px 0 16px; text-align: center; opacity: 0;
  background: linear-gradient(90deg, transparent, rgba(10,11,7,.86) 18%, rgba(10,11,7,.9) 50%, rgba(10,11,7,.86) 82%, transparent); }
.ll .band::before, .ll .band::after { content: ''; position: absolute; left: 12%; right: 12%; height: 2px; background: var(--amber); opacity: .7; }
.ll .band::before { top: 0; } .ll .band::after { bottom: 0; }
.ll .band.b-boss::before, .ll .band.b-boss::after { height: 8px; opacity: .9;
  background: repeating-linear-gradient(135deg, var(--rust) 0 8px, rgba(0,0,0,.9) 8px 16px); }
.ll .band .ttl { font-size: 64px; color: var(--amber); text-shadow: 4px 4px 0 rgba(0,0,0,.9), 0 0 18px rgba(255,170,50,.4); letter-spacing: 8px; }
.ll .band.b-boss .ttl { color: var(--rust); text-shadow: 4px 4px 0 rgba(0,0,0,.9), 0 0 18px rgba(224,80,46,.45); }
.ll .band .sub { font-size: 24px; color: var(--bone); letter-spacing: 6px; margin-top: 6px; text-shadow: 2px 2px 0 #000; }
.ll .band.b-boss .sub { color: var(--amber-hi); }
.ll .band .sum { font-size: 16px; color: var(--khaki); margin-top: 12px; letter-spacing: 2px; text-shadow: 2px 2px 0 #000; }
.ll .band .sum b { color: var(--bone); font-weight: normal; }
.ll .band .sum .cashv { color: var(--green); }
.ll .band.b-clear .ttl { color: var(--green); text-shadow: 4px 4px 0 rgba(0,0,0,.9), 0 0 18px rgba(166,214,94,.35); }
.ll .count { position: absolute; left: 50%; top: calc(26% + 214px); transform: translateX(-50%); font-size: 16px; color: var(--khaki);
  letter-spacing: 2px; text-shadow: 2px 2px 0 #000; white-space: nowrap; padding: 6px 14px 4px; background: rgba(10,11,7,.82);
  box-shadow: 0 0 0 2px rgba(0,0,0,.5), inset 0 0 0 2px rgba(255,180,58,.25); }
.ll .count b { color: var(--amber); font-weight: normal; font-size: 24px; vertical-align: -2px; margin-left: 6px; }
.ll .alertbar { position: absolute; left: 50%; top: 92px; transform: translateX(-50%); padding: 4px 14px 3px; font-size: 16px;
  color: var(--o0); background: var(--rust); letter-spacing: 2px; white-space: nowrap; opacity: 0; box-shadow: 0 0 0 2px rgba(0,0,0,.6); }
.ll .alertbar.on { opacity: 1; animation: ll-blink .6s steps(1) infinite; }

/* placement prompt */
.ll .place { position: absolute; left: 50%; bottom: 92px; transform: translateX(-50%); text-align: center; padding: 10px 20px 10px; white-space: nowrap; }
.ll .place .what { font-size: 24px; color: var(--amber); letter-spacing: 2px; }
.ll .place .how { font-size: 12px; color: var(--khaki); margin-top: 6px; letter-spacing: 1px; }

/* damage / mood overlays */
.ll .vig { position: absolute; inset: 0; opacity: 0; pointer-events: none;
  background: radial-gradient(ellipse at center, rgba(0,0,0,0) 48%, rgba(150,10,0,.55) 82%, rgba(90,0,0,.9) 100%); }
.ll .lowhp { position: absolute; inset: 0; opacity: 0; pointer-events: none;
  background: radial-gradient(ellipse at center, rgba(0,0,0,0) 58%, rgba(120,0,0,.5) 100%); }
.ll .gatefx { position: absolute; left: 0; right: 0; bottom: 0; height: 34%; opacity: 0; pointer-events: none;
  background: linear-gradient(0deg, rgba(255,140,30,.38), rgba(255,140,30,0)); }
.ll .focusfx { position: absolute; inset: 0; opacity: 0; pointer-events: none; transition: opacity .25s;
  background: radial-gradient(ellipse at center, rgba(0,0,0,0) 55%, rgba(20,80,90,.42) 100%); }
.ll .lb { position: absolute; left: 0; right: 0; height: 7vh; background: #000; transition: transform .3s cubic-bezier(.2,.8,.2,1); }
.ll .lb.t { top: 0; transform: translateY(-100%); } .ll .lb.b { bottom: 0; transform: translateY(100%); }
.ll .focusfx.on ~ .lb { transform: none; }
.ll .focuslbl { position: absolute; left: 50%; top: calc(7vh + 10px); transform: translateX(-50%); font-size: 16px; color: ${C.cyan};
  letter-spacing: 6px; text-shadow: 2px 2px 0 #000, 0 0 10px rgba(127,216,224,.5); opacity: 0; transition: opacity .25s; }
.ll .focusfx.on ~ .focuslbl { opacity: 1; }

/* ---------- scope ---------- */
.ll .scope { position: absolute; inset: 0; opacity: 0; }
.ll .scope > canvas { position: absolute; left: 0; top: 0; }
.ll .scope .mask { transform-origin: 50% 50%; }
.ll .scope .ro { position: absolute; font-size: 16px; color: var(--amber); text-shadow: 0 0 8px rgba(255,170,50,.45); white-space: nowrap; }
.ll .scope .ro .lbl { display: block; margin-bottom: 4px; }
.ll .scope .rng { text-align: left; }
.ll .scope .rng .v { font-size: 24px; letter-spacing: 2px; }
.ll .scope .rng .ghost { position: absolute; left: 0; right: 0; color: rgba(255,180,58,.1); text-shadow: none; }
.ll .scope .zoom { text-align: left; }
.ll .scope .zoom .v { font-size: 24px; }
.ll .scope .wind { text-align: right; }
.ll .scope .wind .v { font-size: 24px; }
.ll .scope .wind canvas { width: 36px; height: 36px; display: inline-block; vertical-align: middle; margin-right: 8px; }
.ll .scope .brth { text-align: right; margin-top: 18px; }
.ll .scope .brth .brow { display: flex; align-items: center; gap: 8px; justify-content: flex-end; }
.ll .scope .brth canvas { width: 24px; height: 24px; }
.ll .scope .brth .seg { width: 120px; height: 12px; }
.ll .scope .brth.hold .lbl { color: var(--amber); }
.ll .scope .brth.low .seg { animation: ll-blink .35s steps(1) infinite; }
.ll .scope .tags { transform: translateX(-50%); display: flex; gap: 10px; }
.ll .scope .fgauge { display: flex; align-items: center; gap: 8px; margin-top: 18px; }
.ll .scope .fgauge canvas { width: 24px; height: 24px; }
.ll .scope .fgauge .seg { width: 120px; height: 12px; }
.ll .scope .fgauge .seg .fl { background: linear-gradient(180deg, #d8fbff 0 30%, ${C.cyan} 30% 80%, #2e7a84 80%); }
.ll .scope .fgauge.full .seg { border-color: ${C.cyan}; }
.ll .scope .tag { font-size: 12px; padding: 2px 6px 1px; border: 2px solid currentColor; letter-spacing: 1px; }
.ll .scope .tag.th { color: #f0f0f0; } .ll .scope .tag.fo { color: ${C.cyan}; }

/* ---------- screens ---------- */
.ll .scr { position: absolute; inset: 0; display: none; pointer-events: auto; cursor: default; }
.ll .scr.on { display: block; }
.ll .scr .dimbg { position: absolute; inset: 0; background: rgba(6,7,4,.78); }
.ll .scr .scan { position: absolute; inset: 0; pointer-events: none;
  background: repeating-linear-gradient(180deg, rgba(0,0,0,.18) 0 1px, transparent 1px 3px), var(--noise); }
.ll .scr .vign { position: absolute; inset: 0; pointer-events: none; background: radial-gradient(ellipse at center, rgba(0,0,0,0) 55%, rgba(0,0,0,.65) 100%); }
.ll .menu { display: flex; flex-direction: column; gap: 4px; }
.ll .mi { position: relative; display: block; padding: 6px 14px 4px 34px; font: inherit; font-size: 24px; letter-spacing: 2px;
  color: var(--khaki); background: none; border: 0; text-align: left; cursor: pointer; text-shadow: 2px 2px 0 rgba(0,0,0,.85); white-space: nowrap; }
.ll .mi::before { content: '▶'; position: absolute; left: 8px; top: 6px; color: var(--amber); opacity: 0; }
.ll .mi.sel { color: var(--amber-hi); background: linear-gradient(90deg, rgba(255,180,58,.16), rgba(255,180,58,0)); }
.ll .mi.sel::before { opacity: 1; animation: ll-blink 1s steps(1) infinite; }
.ll .mi .note { font-size: 12px; color: var(--khaki); margin-left: 10px; letter-spacing: 1px; vertical-align: 3px; }
.ll .mi[disabled] { opacity: .35; cursor: default; }
.ll .btn { font: inherit; font-size: 16px; letter-spacing: 2px; color: var(--o0); background: var(--amber); border: 0; cursor: pointer;
  padding: 8px 16px 6px; box-shadow: inset 0 -4px 0 var(--amber-dim), inset 0 2px 0 var(--amber-hi), 0 0 0 2px rgba(0,0,0,.7); white-space: nowrap; }
.ll .btn:hover, .ll .btn.sel { background: var(--amber-hi); }
.ll .btn:active { box-shadow: inset 0 4px 0 var(--amber-dim), 0 0 0 2px rgba(0,0,0,.7); }
.ll .btn.alt { color: var(--amber); background: rgba(0,0,0,.4); box-shadow: inset 0 0 0 2px var(--amber-dim), 0 0 0 2px rgba(0,0,0,.6); }
.ll .btn.alt:hover, .ll .btn.alt.sel { color: var(--amber-hi); box-shadow: inset 0 0 0 2px var(--amber), 0 0 0 2px rgba(0,0,0,.6); }
.ll .btn[disabled] { color: var(--khaki); background: rgba(55,59,36,.8); box-shadow: inset 0 0 0 2px var(--o4), 0 0 0 2px rgba(0,0,0,.6); cursor: default; }
.ll .btn.deny { animation: ll-shake .3s steps(2) 1; }

.ll .title-bg { position: absolute; left: 0; top: 0; }
.ll .title-shade { position: absolute; inset: 0; pointer-events: none; background: linear-gradient(90deg, rgba(8,6,12,.78) 0%, rgba(8,6,12,.55) 28%, rgba(8,6,12,0) 46%); }
.ll .title-col { position: absolute; left: 7vw; top: 12vh; bottom: 8vh; display: flex; flex-direction: column; }
.ll .logo { display: block; }
.ll .tagline { font-size: 16px; color: var(--khaki); letter-spacing: 4px; margin: 14px 0 0 6px; text-shadow: 2px 2px 0 #000; }
.ll .title-col .menu { margin-top: 7vh; }
.ll .best { margin-top: auto; font-size: 16px; color: var(--khaki); letter-spacing: 2px; text-shadow: 2px 2px 0 #000; }
.ll .best b { color: var(--amber); font-weight: normal; }
.ll .credits { position: absolute; right: 24px; bottom: 18px; text-align: right; font-size: 12px; line-height: 1.6; color: rgba(184,172,120,.8);
  text-shadow: 1px 1px 0 #000; letter-spacing: 1px; }
.ll .credits b { color: var(--amber); font-weight: normal; }
.ll .press { font-size: 12px; color: var(--amber); letter-spacing: 2px; margin: 18px 0 0 34px; animation: ll-blink 1.2s steps(1) infinite; text-shadow: 1px 1px 0 #000; }

.ll .win { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); width: min(720px, 92vw); max-height: 92vh; overflow: auto; padding: 22px 28px 22px; }
.ll .win h1 { margin: 0; font-weight: normal; font-size: 48px; color: var(--amber); letter-spacing: 6px; text-shadow: 4px 4px 0 rgba(0,0,0,.9), 0 0 14px rgba(255,170,50,.35); }
.ll .win h2 { margin: 4px 0 18px; font-weight: normal; font-size: 16px; color: var(--khaki); letter-spacing: 3px; }
.ll .win .cols { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
.ll .keys { display: grid; grid-template-columns: auto 1fr; gap: 6px 12px; font-size: 12px; color: var(--bone); align-items: center; }
.ll .keys .k { text-align: right; white-space: nowrap; }
.ll .over h1 { font-size: 40px; color: var(--rust); text-shadow: 4px 4px 0 rgba(0,0,0,.9), 0 0 16px rgba(224,80,46,.4); }
.ll .stats { display: grid; grid-template-columns: 1fr auto; gap: 8px 24px; font-size: 16px; margin: 6px 0 22px; }
.ll .stats .k { color: var(--khaki); letter-spacing: 1px; }
.ll .stats .v { color: var(--bone); text-align: right; }
.ll .stats .v.hi { color: var(--amber-hi); }
.ll .stamp { position: absolute; right: 26px; top: 26px; padding: 6px 10px 4px; font-size: 24px; color: var(--green); border: 4px solid var(--green);
  transform: rotate(-8deg); letter-spacing: 3px; opacity: .9; -webkit-mask: var(--grunge); mask: var(--grunge); }
.ll .row-btns { display: flex; gap: 14px; justify-content: flex-end; flex-wrap: wrap; }

.ll .set { display: grid; grid-template-columns: 1fr 260px 76px; gap: 6px 14px; align-items: center; margin: 4px 0 20px; }
.ll .set .sl { display: contents; }
.ll .set .k { font-size: 16px; color: var(--khaki); padding: 6px 0 4px 26px; position: relative; letter-spacing: 1px; cursor: pointer; }
.ll .set .sel .k { color: var(--amber-hi); }
.ll .set .sel .k::before { content: '▶'; position: absolute; left: 4px; top: 6px; color: var(--amber); }
.ll .set .ctl { position: relative; height: 22px; display: flex; align-items: center; gap: 6px; cursor: pointer; }
.ll .set .ctl .arr { font-size: 16px; color: var(--amber-dim); width: 16px; text-align: center; }
.ll .set .sel .ctl .arr { color: var(--amber); }
.ll .set .ctl .seg { flex: 1; height: 16px; }
.ll .set .ctl .opts { flex: 1; display: flex; gap: 6px; }
.ll .set .ctl .opt { flex: 1; text-align: center; font-size: 12px; padding: 3px 0 2px; color: var(--khaki); border: 2px solid var(--o3); }
.ll .set .ctl .opt.on { color: var(--o0); background: var(--amber); border-color: var(--amber); }
.ll .set .v { font-size: 16px; color: var(--bone); text-align: right; }

/* ---------- shop ---------- */
.ll .shop { background: radial-gradient(ellipse at 50% 30%, #1b1e12 0%, #0d0e09 70%); }
.ll .shop .grid-bg { position: absolute; inset: 0; opacity: .5; pointer-events: none;
  background: linear-gradient(rgba(255,180,58,.05) 1px, transparent 1px) 0 0/32px 32px, linear-gradient(90deg, rgba(255,180,58,.05) 1px, transparent 1px) 0 0/32px 32px; }
.ll .shop .frame { position: absolute; inset: 18px 22px; display: flex; flex-direction: column; }
.ll .shop .hdr { display: flex; align-items: flex-end; justify-content: space-between; gap: 20px; padding-bottom: 12px; border-bottom: 2px solid var(--o3); }
.ll .shop .brand { font-size: 32px; color: var(--amber); letter-spacing: 4px; text-shadow: 4px 4px 0 rgba(0,0,0,.9), 0 0 14px rgba(255,170,50,.3); }
.ll .shop .brand small { display: block; font-size: 12px; color: var(--khaki); letter-spacing: 3px; margin-top: 6px; text-shadow: 1px 1px 0 #000; }
.ll .shop .wallet { text-align: right; }
.ll .shop .wallet .cash { font-size: 32px; }
.ll .shop .gate { display: flex; gap: 10px; align-items: center; justify-content: flex-end; margin-top: 6px; }
.ll .shop .gate .seg { width: 180px; height: 12px; }
.ll .shop .tabs { display: flex; gap: 6px; margin: 14px 0 12px; align-items: flex-end; }
.ll .shop .tab { font: inherit; font-size: 16px; letter-spacing: 2px; padding: 8px 16px 6px; cursor: pointer; color: var(--khaki); background: rgba(0,0,0,.35);
  border: 2px solid var(--o3); border-bottom-width: 4px; position: relative; }
.ll .shop .tab .key { margin: 0 8px 0 0; }
.ll .shop .tab.on { color: var(--o0); background: var(--amber); border-color: var(--amber); }
.ll .shop .tab.on .key { background: var(--o0); color: var(--amber); border-bottom-color: #000; }
.ll .shop .tab .badge { position: absolute; right: -6px; top: -8px; font-size: 12px; min-width: 18px; padding: 1px 4px 0; color: var(--o0);
  background: var(--green); box-shadow: 0 0 0 2px rgba(0,0,0,.7); }
.ll .shop .tabs .hint { margin-left: auto; font-size: 12px; color: var(--khaki); letter-spacing: 1px; }
.ll .shop .cards { flex: 1; min-height: 0; overflow: auto; display: grid; grid-template-columns: repeat(auto-fill, minmax(268px, 1fr));
  gap: 14px; padding: 8px 6px 8px 8px; align-content: start; scrollbar-width: thin; scrollbar-color: var(--o4) transparent; }
.ll .card { position: relative; padding: 12px 14px 12px; display: flex; flex-direction: column; gap: 6px; cursor: pointer; min-height: 0; }
.ll .card.pn { position: relative; }
.ll .card .ic { height: 60px; display: flex; align-items: center; justify-content: center; margin: 2px 0 4px;
  background: radial-gradient(ellipse at center, rgba(255,180,58,.08), rgba(0,0,0,0) 70%); }
.ll .card .nm { font-size: 16px; color: var(--bone); letter-spacing: 1px; }
.ll .card .tg { font-size: 12px; color: var(--amber); min-height: 15px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ll .card .ds { font-size: 12px; color: var(--khaki); line-height: 16px; min-height: 64px; }
.ll .card .st { display: grid; grid-template-columns: 106px 1fr auto; gap: 4px 8px; align-items: center; font-size: 12px; margin-top: 2px; }
.ll .card .st .k { color: var(--khaki); }
.ll .card .st .t { color: var(--bone); min-width: 44px; text-align: right; }
.ll .card .st .seg { height: 10px; border-width: 2px; }
.ll .card .st .seg .w { inset: 1px; -webkit-mask: repeating-linear-gradient(90deg,#000 0 6px,transparent 6px 8px); mask: repeating-linear-gradient(90deg,#000 0 6px,transparent 6px 8px); }
.ll .card .pips { display: flex; gap: 4px; }
.ll .card .pips i { width: 14px; height: 8px; border: 2px solid var(--amber-dim); }
.ll .card .pips i.on { background: var(--amber); border-color: var(--amber); }
.ll .card .act { margin-top: auto; padding-top: 8px; display: flex; gap: 8px; align-items: center; justify-content: space-between; }
.ll .card .price { font-size: 16px; color: var(--amber-hi); }
.ll .card .price.no { color: var(--rust); }
.ll .card .reason { font-size: 12px; color: var(--rust); letter-spacing: 1px; }
.ll .card .act .btns { display: flex; gap: 8px; margin-left: auto; }
.ll .card.sel { border-color: var(--amber); }
.ll .card.sel::before { inset: -8px; background: ${brackets('var(--amber-hi)', 14, 3)}; background-repeat: no-repeat; }
.ll .card.dis .ic, .ll .card.dis .nm { opacity: .6; }
.ll .card .stampc { position: absolute; right: 10px; top: 12px; font-size: 12px; padding: 4px 6px 2px; letter-spacing: 2px; border: 2px solid currentColor;
  transform: rotate(6deg); -webkit-mask: var(--grunge); mask: var(--grunge); z-index: 2; background: rgba(10,11,7,.6); }
.ll .card .stampc.eq { color: var(--green); } .ll .card .stampc.mx { color: var(--amber); } .ll .card .stampc.own { color: var(--khaki); }
.ll .shop .ftr { display: flex; align-items: center; justify-content: space-between; gap: 20px; padding-top: 12px; border-top: 2px solid var(--o3); margin-top: 6px; }
.ll .shop .ftr .help { font-size: 12px; color: var(--khaki); letter-spacing: 1px; line-height: 1.8; }
.ll .shop .next { font-size: 24px; padding: 12px 22px 9px; letter-spacing: 3px; }
.ll .shop .next small { font-size: 12px; margin-left: 10px; letter-spacing: 1px; vertical-align: 3px; }
.ll .shop .auto { font-size: 12px; color: var(--amber); letter-spacing: 1px; margin-right: 14px; }
.ll .shop .toast { position: absolute; left: 50%; bottom: 100px; transform: translateX(-50%); font-size: 16px; padding: 8px 14px 6px; color: var(--o0);
  background: var(--amber); letter-spacing: 2px; opacity: 0; pointer-events: none; box-shadow: 0 0 0 2px rgba(0,0,0,.7); white-space: nowrap; }

@media (max-width: 900px), (max-height: 620px) {
  .ll .band .ttl { font-size: 48px; } .ll .band .sub { font-size: 16px; }
  .ll .cash, .ll .wave-n { font-size: 24px; }
  .ll .bl { width: 240px; }
}
`;
}
