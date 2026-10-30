import * as THREE from 'three';
import { Vec3, clamp, lerp, smoothstep } from '../physics/math.js';

/**
 * Sniper-Elite-style kill cam. A sniper round that is going to hit someone (always on a head
 * shot, often on the heart or lungs) freezes the world: the camera rides the round down range in
 * bullet time, slowing as it closes; just before it strikes the victim's flesh turns to X-ray,
 * the round goes through (the real ballistics are applied at that moment), and the skull or bones
 * break apart in extreme slow motion while the camera swings round the impact. Then time ramps
 * back up and the view returns to the shooter.
 *
 * The host steps the world with `timeScale` while `active`, renders with `camera`, forwards the
 * shot's fx (fleshHit) to `onFx`, and supplies an X-ray rig per person (see XRayRig).
 */
const PHASES = { flight: 0, impact: 1, xray: 2, ramp: 3 };

function bulletMesh() {
  // a 7.62 mm boat-tail spitzer: copper jacket, lead visible at the base
  const pts = [];
  const L = 0.031, R = 0.0039;
  pts.push(new THREE.Vector2(0.0001, 0));
  for (let i = 0; i <= 12; i++) {
    const u = i / 12;
    // ogive nose (first 55% of the length)
    pts.push(new THREE.Vector2(R * Math.sqrt(1 - (1 - u) * (1 - u)) * 0.98 + 0.0001, u * L * 0.55));
  }
  pts.push(new THREE.Vector2(R, L * 0.82));
  pts.push(new THREE.Vector2(R * 0.82, L)); // boat tail
  pts.push(new THREE.Vector2(0.0001, L));
  const geo = new THREE.LatheGeometry(pts, 24);
  geo.rotateX(-Math.PI / 2); // nose toward -z
  geo.translate(0, 0, L * 0.5);
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0xc87b4b, metalness: 0.95, roughness: 0.22 }));
  const g = new THREE.Group();
  g.add(m);
  // heat shimmer / air trail behind the round
  const trailGeo = new THREE.CylinderGeometry(0.0008, 0.0028, 1, 10, 1, true);
  trailGeo.rotateX(Math.PI / 2);
  trailGeo.translate(0, 0, 0.5);
  const trail = new THREE.Mesh(trailGeo, new THREE.MeshBasicMaterial({ color: 0xbfd6ff, transparent: true, opacity: 0.07, depthWrite: false, blending: THREE.AdditiveBlending }));
  trail.scale.set(1, 1, 0.9);
  trail.position.z = 0.016;
  g.add(trail);
  // shock rings
  const rings = [];
  for (let i = 0; i < 4; i++) {
    const r = new THREE.Mesh(new THREE.RingGeometry(0.006, 0.0075, 24), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
    g.add(r);
    rings.push(r);
  }
  g.userData = { trail, rings };
  return g;
}

export class KillCam {
  /**
   * host: { renderer, audio, sandbox() -> Sandbox, scene() -> THREE.Scene, xray(person) -> rig|null,
   *         canvas: HTMLCanvasElement, overlay: HTMLElement|null }
   */
  constructor(host) {
    this.host = host;
    const aspect = typeof window !== 'undefined' ? window.innerWidth / window.innerHeight : 16 / 9;
    this.camera = new THREE.PerspectiveCamera(55, aspect, 0.005, 300);
    this.active = false;
    this.mode = 'sniper'; // 'off' | 'sniper' | 'always' (every sniper hit) | 'all' (any gun, head shots)
    this.timeScale = 1;
    this.bullet = null;
    this.state = null;
    this.vignette = null;
    this.moment = null;
  }

  setAspect(a) {
    this.camera.aspect = a;
    this.camera.updateProjectionMatrix();
  }

  /**
   * A shot is about to be fired. Returns true when the kill cam takes it (the host must then NOT
   * fire it itself: the cam fires it when the round arrives).
   */
  tryStart(weapon, origin, dir, view) {
    if (this.active || this.mode === 'off') return false;
    if (weapon !== 'sniper' && this.mode !== 'all') return false;
    const sb = this.host.sandbox();
    const hit = sb.pick(origin, dir, 250);
    if (!hit || !hit.person || !hit.body || !hit.person.ctl.alive) return false;
    const seg = hit.body.userData && hit.body.userData.segment ? hit.body.userData.segment.name : '';
    const dist = hit.t;
    if (dist < 4) return false;
    const head = seg === 'head' || seg === 'neck';
    if (weapon !== 'sniper' && !head) return false;
    const chance = this.mode === 'always' ? 1 : head ? 1 : seg === 'chest' ? 0.75 : seg === 'abdomen' || seg === 'pelvis' ? 0.4 : 0.25;
    if (Math.random() > chance) return false;
    this.start(weapon, origin, dir, hit, seg, view);
    return true;
  }

  start(weapon, origin, dir, hit, seg, view) {
    const h = this.host;
    this.active = true;
    this.state = {
      phase: PHASES.flight, t: 0, weapon, origin: origin.clone(), dir: dir.clone(), hit: hit.point.clone(), person: hit.person, seg,
      dist: hit.t, flight: clamp(0.8 + hit.t / 18, 0.95, 2.6), fired: false, roll: Math.random() * Math.PI * 2, side: Math.random() < 0.5 ? 1 : -1,
      view: view ? { pos: view.pos.clone(), quat: view.quat.clone(), fov: view.fov } : null, xray: null, fx: [],
    };
    if (!this.bullet) this.bullet = bulletMesh();
    h.scene().add(this.bullet);
    this.timeScale = 0;
    h.audio.gunshot(weapon, origin);
    h.audio.whoosh(6, null);
    this.setLook('flight');
  }

  /** Visual grade of the screen (CSS filter on the canvas + a vignette). */
  setLook(kind) {
    if (this.host.hideUi) this.host.hideUi(kind !== 'none' && kind !== 'moment');
    const c = this.host.canvas;
    if (!c || typeof document === 'undefined') return;
    if (!this.vignette && this.host.overlay !== null) {
      // vignette and cinema bars
      const v = document.createElement('div');
      v.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:30;opacity:0;transition:opacity .25s;background:radial-gradient(ellipse at center, rgba(0,0,0,0) 45%, rgba(0,0,0,0.78) 100%)';
      v.innerHTML = '<div class="kc-bar" style="position:absolute;left:0;right:0;top:0;height:9vh;background:#000"></div><div class="kc-bar" style="position:absolute;left:0;right:0;bottom:0;height:9vh;background:#000"></div>';
      document.body.appendChild(v);
      this.vignette = v;
    }
    if (this.vignette) for (const b of this.vignette.querySelectorAll('.kc-bar')) b.style.display = kind === 'moment' ? 'none' : '';
    if (kind === 'moment') {
      c.style.filter = 'contrast(1.15) saturate(0.7)';
      if (this.vignette) this.vignette.style.opacity = 0.8;
    } else if (kind === 'flight') {
      c.style.filter = 'contrast(1.12) saturate(0.8) brightness(1.03)';
      if (this.vignette) this.vignette.style.opacity = 1;
    } else if (kind === 'xray') {
      c.style.filter = 'contrast(1.22) saturate(0.55) brightness(0.98)';
      if (this.vignette) this.vignette.style.opacity = 1;
    } else {
      c.style.filter = '';
      if (this.vignette) this.vignette.style.opacity = 0;
    }
  }

  /** fx of the kill shot (fleshHit and friends) - drive the X-ray damage. */
  onFx(e) {
    if (!this.active || !this.state || !this.state.fired) return;
    if (e.type !== 'fleshHit' || e.person !== this.state.person) return;
    const S = this.state, rig = S.xray;
    if (!rig) return;
    const dir = e.dir, entry = e.entry, exit = e.exit || e.entry;
    const E = e.energy || 1000;
    if (rig.bulletTrack && e.exit) rig.bulletTrack(entry, exit);
    const kinds = e.structures || [];
    const seg = e.seg ? e.seg.name : S.seg;
    if (seg === 'head' && (kinds.includes('brain') || kinds.includes('skull') || kinds.includes('brainstem'))) {
      if (rig.shatterSkull) rig.shatterSkull(exit, dir, E);
    } else if (kinds.includes('bone') || seg === 'chest' || seg === 'pelvis') {
      if (rig.breakBone) rig.breakBone(seg, entry, dir, E);
    }
    for (const k of ['heart', 'lung']) if (kinds.includes(k) && rig.damageOrgan) rig.damageOrgan(k === 'lung' ? (entry.x - e.person.rd.segments.chest.body.pos.x >= 0 ? 'lung L' : 'lung R') : 'heart', entry, dir, E);
    if (kinds.includes('organ') && rig.damageOrgan) rig.damageOrgan('liver', entry, dir, E);
  }

  /**
   * A bone-breaking blow (a full-power bat swing to the ribs, a haymaker to the jaw, a stomp on the
   * head): a beat of slow motion with the X-ray on the victim, seen from wherever the player is.
   */
  impactMoment(person, dur = 1.1) {
    if (this.active || this.moment || this.mode === 'off') return false;
    const h = this.host;
    const xray = h.xray ? h.xray(person) : null;
    if (xray && xray.setVisible) xray.setVisible(true, 0.1);
    if (h.ghost) h.ghost(person, true);
    this.moment = { t: 0, person, xray, dur, off: false };
    this.setLook('moment');
    return true;
  }

  /** Per real-time frame: the time scale of a running impact moment (1 when there is none). */
  momentScale(dt) {
    const M = this.moment;
    if (!M) return 1;
    M.t += dt;
    const ramp = 0.4;
    if (M.t > M.dur && !M.off) {
      M.off = true;
      if (M.xray && M.xray.setVisible) M.xray.setVisible(false, 0.4);
      if (this.host.ghost) this.host.ghost(M.person, false);
      if (!this.active) this.setLook('none');
    }
    if (M.t > M.dur + ramp) {
      this.moment = null;
      return 1;
    }
    return M.t < M.dur ? lerp(0.05, 0.1, M.t / M.dur) : lerp(0.1, 1, ((M.t - M.dur) / ramp) ** 2);
  }

  /** Skip to the end (a key press). */
  skip() {
    if (this.moment) this.moment.t = Math.max(this.moment.t, this.moment.dur);
    if (!this.active) return;
    if (!this.state.fired) this.fire();
    this.finish();
  }

  fire() {
    const S = this.state, h = this.host;
    S.fired = true;
    // the real round: the same line, no spread (the cam already showed where it goes)
    h.sandbox().fire(S.weapon, S.origin, S.dir, { spreadScale: 0, by: 'killcam' });
  }

  finish() {
    const h = this.host;
    if (this.bullet) h.scene().remove(this.bullet);
    if (this.state && this.state.xray && this.state.xray.setVisible) this.state.xray.setVisible(false, 0.35);
    if (this.state && this.state.ghost) this.state.ghost(false);
    this.setLook('none');
    this.active = false;
    this.timeScale = 1;
    this.state = null;
  }

  /**
   * Per real-time frame. Returns the world time scale to use (0 = frozen). Moves the camera.
   */
  update(dt) {
    if (!this.active) return 1;
    const S = this.state, h = this.host;
    S.t += dt;
    const d = S.dir;
    const up = Math.abs(d.y) > 0.95 ? new Vec3(1, 0, 0) : new Vec3(0, 1, 0);
    const side = new Vec3().crossVectors(d, up).normalize();
    const lift = new Vec3().crossVectors(side, d).normalize();
    const cam = this.camera;
    if (S.phase === PHASES.flight) {
      const u = clamp(S.t / S.flight, 0, 1);
      // fast out of the muzzle, slowing hard over the last few metres
      const s = u < 0.75 ? (u / 0.75) * 0.88 : 0.88 + 0.12 * smoothstep(0.75, 1, u);
      const start = S.origin.clone().addScaled(d, 0.6);
      const end = S.hit.clone().addScaled(d, -0.015);
      const pos = start.clone().lerp(end, s);
      this.bullet.position.set(pos.x, pos.y, pos.z);
      this.bullet.lookAt(pos.x - d.x, pos.y - d.y, pos.z - d.z);
      this.bullet.rotateZ(S.t * 40);
      // trail grows with the distance travelled
      const tl = Math.min(2.5, pos.distanceTo(start));
      this.bullet.userData.trail.scale.z = Math.max(0.05, tl);
      this.bullet.userData.rings.forEach((r, i) => {
        const ph = (S.t * 3 + i / 4) % 1;
        r.position.set(0, 0, 0.03 + ph * 0.25);
        r.scale.setScalar(1 + ph * 5);
        r.material.opacity = 0.35 * (1 - ph) * (u < 0.9 ? 1 : 0);
      });
      // the camera rides just behind and beside the round, rolling slowly round its line
      const ang = S.roll + u * 1.3 * S.side;
      const off = side.clone().scale(Math.cos(ang)).add(lift.clone().scale(Math.sin(ang)));
      const back = lerp(0.13, 0.32, smoothstep(0.8, 1, u)), out = lerp(0.035, 0.18, smoothstep(0.82, 1, u));
      const cp = pos.clone().addScaled(d, -back).addScaled(off, out);
      cam.position.set(cp.x, cp.y, cp.z);
      const look = pos.clone().addScaled(d, lerp(0.08, 0.25, u));
      cam.up.set(lift.x, lift.y, lift.z);
      cam.lookAt(look.x, look.y, look.z);
      cam.fov = lerp(48, 40, u);
      cam.updateProjectionMatrix();
      // X-ray on as it closes in
      if (u > 0.72 && !S.xray) {
        S.xray = h.xray ? h.xray(S.person) : null;
        if (S.xray && S.xray.setVisible) S.xray.setVisible(true, 0.25);
        S.ghost = h.ghost ? (on) => h.ghost(S.person, on) : null;
        if (S.ghost) S.ghost(true);
        this.setLook('xray');
      }
      if (u >= 1) {
        S.phase = PHASES.impact;
        S.t = 0;
        S.impactPos = S.hit.clone();
        this.fire();
        h.audio.bulletImpact('bone', S.hit, 1.2);
        h.scene().remove(this.bullet);
      }
      return 0;
    }
    // after the impact: hold a beat, then orbit the wound in extreme slow motion
    const P = S.impactPos;
    const holdT = 0.12, xrayT = 2.4, rampT = 0.9;
    let ts;
    if (S.phase === PHASES.impact) {
      ts = 0.015;
      if (S.t > holdT) {
        S.phase = PHASES.xray;
        S.t = 0;
      }
    } else if (S.phase === PHASES.xray) {
      ts = lerp(0.03, 0.08, S.t / xrayT);
      if (S.t > xrayT) {
        S.phase = PHASES.ramp;
        S.t = 0;
        if (S.xray && S.xray.setVisible) S.xray.setVisible(false, 0.5);
        if (S.ghost) S.ghost(false);
        this.setLook('none');
      }
    } else {
      const u = clamp(S.t / rampT, 0, 1);
      ts = lerp(0.08, 1, u * u);
      if (u >= 1) {
        this.finish();
        return 1;
      }
    }
    // orbit: from beside the line of fire round toward the exit side, a little above
    const total = holdT + xrayT + rampT;
    const tt = (S.phase === PHASES.impact ? S.t : S.phase === PHASES.xray ? holdT + S.t : holdT + xrayT + S.t) / total;
    const a0 = 0.5 * S.side, a = a0 + S.side * 1.6 * smoothstep(0, 1, tt);
    const r = lerp(0.75, 1.15, tt);
    const ox = Math.cos(a) * side.x * r + Math.sin(a) * d.x * r, oz = Math.cos(a) * side.z * r + Math.sin(a) * d.z * r;
    cam.up.set(0, 1, 0);
    cam.position.set(P.x + ox, P.y + 0.1 + 0.2 * tt, P.z + oz);
    cam.lookAt(P.x, P.y - 0.05 * tt, P.z);
    cam.fov = 46;
    cam.updateProjectionMatrix();
    return ts;
  }
}
