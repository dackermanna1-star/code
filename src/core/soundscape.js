// Bridges the world and the procedural audio engine: listener, footsteps,
// alley acoustics (slap-back distances, enclosure), spatial emitters placed
// at their sources, lamp buzz driven by the visual flicker.
import * as THREE from 'three';
import { AudioEngine } from '../audio/AudioEngine.js';
import { POLES, facadeById, facadeToWorld } from '../world/layout.js';
import { DRAINS } from '../world/groundData.js';

export class Soundscape {
  constructor(engine) {
    this.engine = engine;
    this.audio = null;
    this.buzz = [];
    this._fwd = new THREE.Vector3();
    this._up = new THREE.Vector3();
    this._lastPos = new THREE.Vector3();
  }

  /** Must be called from a user gesture. */
  async start() {
    if (this.audio) return;
    const audio = new AudioEngine({ seed: 7 });
    this.audio = audio;
    this.engine.audio = audio;
    try {
      await audio.init();
    } catch (e) {
      console.warn('audio init failed', e);
      return;
    }
    this.placeEmitters();
    this.engine.player.onStep((e) => audio.footstep(e));
  }

  placeEmitters() {
    const a = this.audio;
    const w = this.engine.world;
    const v = (x, y, z) => ({ x, y, z });
    // condenser by R5, kitchen exhaust, rooftop units
    const R5 = facadeById('R5');
    const c = facadeToWorld(R5, 8.0, 0.6, 0.5);
    a.addEmitter({ type: 'hvac', position: v(c.x, c.y, c.z), gain: 1.0 });
    const L2 = facadeById('L2');
    const ex = facadeToWorld(L2, 14.6, 2.9, 0.3);
    a.addEmitter({ type: 'exhaust', position: v(ex.x, ex.y, ex.z), gain: 0.9 });
    const L1 = facadeById('L1');
    const roof = facadeToWorld(L1, 8.5, L1.height + 0.6, -2.4);
    a.addEmitter({ type: 'hvac', position: v(roof.x, roof.y, roof.z), gain: 0.55 });
    // transformers hum on the poles
    for (const P of POLES) if (P.transformer) a.addEmitter({ type: 'transformer', position: v(P.x, P.height - 2.6, P.z), gain: 0.6 + 0.15 * P.transformer });
    // lamp ballast buzz (driven per frame by the flicker)
    for (const l of w.lamps) {
      const k = l.def.kind;
      if (!['rlm', 'fluoro', 'wallpack', 'cobra'].includes(k)) continue;
      const p = l.light.position;
      const h = a.addEmitter({ type: 'lampBuzz', position: v(p.x, p.y, p.z), gain: k === 'rlm' ? 1.0 : k === 'fluoro' ? 0.8 : 0.35 });
      this.buzz.push({ h, lamp: l });
    }
    // storm drains gurgle, downspouts trickle into puddles
    for (const d of DRAINS) a.addEmitter({ type: 'drain', position: v(d.x, -0.1, d.z), gain: 0.8 });
    for (const [id, u] of [['L1', 22.6], ['R2', 16.15], ['L3', 0.35], ['R4', 0.3]]) {
      const p = facadeToWorld(facadeById(id), u, 0.12, 0.25);
      a.addEmitter({ type: 'trickle', position: v(p.x, p.y, p.z), gain: 0.7 });
    }
    // life behind lit windows: a couple of TVs, muffled voices, one radio
    let radio = false;
    const lit = w.windows?.windows.filter((x) => x.lit && !x.fx.backdrop) ?? [];
    lit.forEach((win, i) => {
      const p = win.center;
      if (win.tv) a.addEmitter({ type: 'tv', position: v(p.x, p.y, p.z), gain: 0.8 });
      else if (!radio && i % 5 === 2) {
        radio = true;
        a.addEmitter({ type: 'radio', position: v(p.x, p.y, p.z), gain: 0.6 });
      } else if (i % 3 === 0) a.addEmitter({ type: 'voices', position: v(p.x, p.y, p.z), gain: 0.7 });
    });
    // dumpsters for garbage-shift events
    const dumpsters = [v(2.1, 0.8, -22.2), v(-2.15, 0.8, -34.9), v(18.6, 0.8, -78.6)];
    if (a.setDumpsters) a.setDumpsters(dumpsters);
  }

  setPaused(p) {
    this.audio?.setPaused?.(p);
  }

  update(dt, t) {
    const a = this.audio;
    if (!a || !a.ready) return;
    const cam = this.engine.camera;
    cam.getWorldDirection(this._fwd);
    this._up.set(0, 1, 0).applyQuaternion(cam.quaternion);
    a.setListener(cam.position, this._fwd, this._up);
    const pl = this.engine.player;
    const p = pl.pos;
    // reflecting surfaces along the alley axis for slap-back echoes
    let distFront, distBack, enclosure;
    if (p.z > -74) {
      distFront = Math.max(1, p.z - -79.5);
      distBack = Math.max(1, 26 - p.z);
      enclosure = p.z > 7 ? 0.45 : p.z > 3 ? 0.75 : 1.0;
      if (p.x < -2.8 || p.x > 2.8) enclosure *= 0.85;
    } else {
      distFront = Math.max(1, 22 - Math.abs(p.x));
      distBack = Math.max(1, Math.abs(p.x) + 22);
      enclosure = Math.abs(p.x) < 3 ? 0.55 : 0.8;
    }
    a.update(dt, {
      time: t,
      playerPos: { x: p.x, y: pl.groundY + 1.6, z: p.z },
      playerVel: { x: pl.vel.x, y: 0, z: pl.vel.z },
      speed: pl.speed,
      distFront,
      distBack,
      enclosure,
    });
    for (const b of this.buzz) {
      const l = b.lamp;
      const k = l.light.intensity / Math.max(1e-4, l.base);
      b.h?.setIntensity?.(Math.max(0, Math.min(1.2, k)));
    }
  }
}
