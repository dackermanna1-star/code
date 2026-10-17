// FX galleries for the lighting preview (not shipped):
//   view=fx    every particle type emitting in a softly lit room, labelled
//   view=post  every screen effect applied to the same corridor frame
import HW from '../../src/engine/hw.js';
import { LightingSystem } from '../../src/render/lighting.js';
import { FxSystem } from '../../src/render/fx.js';
import { tinyText } from '../../src/art/util.js';
import { presetRoomMap, corridorMap, drawScene } from './lighting_scene.js';

const EMITTERS = [
  ['dust', 0.08, 1, {}],
  ['steam', 0.05, 1, {}],
  ['drip', 0.45, 1, { z: 30 }],
  ['splash', 0.5, 4, {}],
  ['spark', 0.45, 7, {}],
  ['coal_dust', 0.12, 2, {}],
  ['amber_motes', 0.18, 1, { spread: 8 }],
  ['paper', 0.7, 1, { z: 40, spread: 10 }],
  ['ember', 0.12, 1, { spread: 5 }],
  ['breath', 1.3, 3, { dir: 'right', z: 19 }],
];

export function fxGallery({ makeWorld, panel, q }) {
  const map = presetRoomMap(null, [], ':');
  map.data.dark = Number(q.get('dark') ?? 0.55);
  const L = new LightingSystem();
  L.init();
  const fx = new FxSystem(1234);
  fx.init();
  fx.dustMotes(false);
  HW.fx = fx;
  HW.map = map;
  HW.player = null;
  L.onMapLoad(map);
  const cam = { x: 0, y: 0, w: 480, h: 270 };
  const cells = EMITTERS.map((e, i) => ({ e, x: 40 + (i % 5) * 96, y: 112 + Math.floor(i / 5) * 112, acc: 0 }));
  const dt = 1 / 60;
  const T = Number(q.get('t') ?? 3.2);
  for (let k = 0; k < Math.round(T / dt); k++) {
    for (const c of cells) {
      const [type, every, n, opts] = c.e;
      c.acc += dt;
      if (c.acc >= every) { c.acc -= every; fx.emit(type, c.x + 8, c.y, n, opts); }
    }
    L.update(dt);
    fx.update(dt);
  }
  const [cv, ctx] = makeWorld();
  drawScene(ctx, map, cam, []);
  L.render(ctx, cam);
  fx.renderWorld(ctx, cam);
  for (const c of cells) tinyText(ctx, c.x - 20, c.y + 14, c.e[0].replace('_', ' '), '#e8e2d0');
  panel(cv, { label: `particles (${fx.particles.count} live)`, scale: Number(q.get('scale') ?? 2) });
}

const POST = [
  ['none', () => {}],
  ['flash #fff @40%', (fx) => { fx.flash('#ffffff', 0.5); return 0.2; }],
  ['fade out 60%', (fx) => { fx.fade('out', 1, '#000'); return 0.6; }],
  ['distort 3px', (fx) => { fx.distort(3, 0); return 0.3; }],
  ['chroma 2px', (fx) => { fx.chroma(2, 0); return 0.1; }],
  ['vignette 1 (tunnel)', (fx) => { fx.vignette(1, 0.5); return 0.6; }],
  ['grain 1', (fx) => { fx.grain(1); return 0.1; }],
  ['vhs on', (fx) => { fx.vhs(true); return 1.37; }],
  ['pulse red (peak)', (fx) => { fx.pulse('#9a2229', 0.8); return 0.4; }],
  ['crt (settings.crt)', (fx) => { HW.settings.values.crt = true; return 0.1; }],
  ['shake 4px (offset shown)', (fx) => { fx.shake(4, 1); return 0.1; }],
  ['flash, reduceFlashing', (fx) => { HW.settings.values.reduceFlashing = true; fx.flash('#ffffff', 0.5); return 0.02; }],
];

export function postGallery({ makeWorld, panel, q }) {
  // One lit corridor frame as the base for every effect.
  const map = corridorMap();
  const L = new LightingSystem();
  L.init();
  HW.map = map;
  HW.fx = null;
  const tess = { x: 18 * 16, y: 15 * 16 + 8, dir: 'up', angle: -60 };
  HW.player = { x: tess.x, y: tess.y };
  L.onMapLoad(map);
  L.setGroup('period', true, { mode: 'instant' });
  for (let k = 0; k < 60; k++) {
    Object.assign(L.flashlight, { on: true, x: tess.x + 2, y: tess.y - 11, angle: (tess.angle * Math.PI) / 180, power: 1, flicker: 0 });
    L.update(1 / 60);
  }
  const cam = { x: 7 * 16, y: 4 * 16, w: 480, h: 270 };
  const [base, bctx] = makeWorld();
  drawScene(bctx, map, cam, [tess]);
  L.render(bctx, cam);
  const only = q.get('only');
  for (const [label, setup] of POST) {
    if (only && !label.startsWith(only)) continue;
    const saved = { ...HW.settings.values };
    const fx = new FxSystem(99);
    fx.init();
    const t = setup(fx) || 0;
    for (let k = 0; k < Math.round(t * 60); k++) fx.update(1 / 60);
    const [cv, ctx] = makeWorld();
    ctx.drawImage(base, Math.round(fx.offset.x), Math.round(fx.offset.y));
    fx.renderPost(ctx);
    Object.assign(HW.settings.values, saved);
    panel(cv, { label, scale: Number(q.get('scale') ?? 1) });
  }
}
