// The police of Vice City. Crimes make stars, stars make cops.
//
// A crime counts at once when a cop sees it; one that only civilians saw is
// phoned in a few seconds later. Each level sends more cruisers (sirens on,
// spawned out of sight on the roads), which drive the road graph to you, ram
// you at 2★ and up, and let their crews out when you're on foot. Cops on foot
// arrest you at 1★ (BUSTED) and shoot from 2★. When no cop has seen you for a
// moment the stars flash and they search the area where you were last seen:
// get out of that circle and stay out of sight to lose them (or drive into
// the Pay 'n' Spray). A few patrol cars drive about at 0★ and see crimes too.
//
//   V.police = new Police()      ready()  update(dt)  clear()  set(level)  add(stars, pos)
//   wanted 0-5, searching, search {x, z, r} | null, lastSeen (Vector3), seen, blips [{x, z}]
//   units [{veh, crew, mode}]  cops (Set of police peds)       window.__vc.police (tests)
import * as THREE from 'three';
import { V } from '../state.js';
import { PLACES } from '../world/layout.js';
import { segDist } from '../world/plan.js';

const CARS = [0, 1, 2, 3, 4, 5];               // pursuit cars per level
const HELIS = [0, 0, 0, 1, 1, 2];               // helicopters per level
const SEARCH_R = [0, 130, 180, 240, 300, 360]; // the search circle
const COOL = [0, 7, 10, 14, 19, 25];           // seconds out of it (and out of sight) to lose them
const PATROLS = 2;
const RING_IN = 280, RING_OUT = 480, DROP = 780;
const LEVEL = { assault: 1, carjack: 1, hitPed: 1, shots: 1, theft: 1, trespass: 1, murder: 2, explosion: 2, copAssault: 2, copMurder: 3 };
// heat piles up while you're wanted; it pushes the level up (crimes in plain sight of the cops count double)
const HEAT = { shots: 0.25, assault: 1, carjack: 1, hitPed: 1, theft: 1, trespass: 0.5, murder: 3, explosion: 3, copAssault: 2, copMurder: 5 };
const HEAT_LEVEL = [0, 0.1, 5, 13, 26, 42];
const RUN = 14, SPRINT = 19;
const _v = new THREE.Vector3(), _dir = new THREE.Vector3(), _o = new THREE.Vector3(), _t = new THREE.Vector3();
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const COMPASS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];

export class Police {
  constructor() {
    this.wanted = 0; this.searching = false; this.search = null; this.seen = false;
    this.lastSeen = new THREE.Vector3(); this.lastVel = new THREE.Vector3();
    this.blips = []; this.units = []; this.cops = new Set(); this.reports = [];
    this.t = 0; this.unseenT = 0; this.coolT = 0; this.sightT = 0; this.spawnT = 0; this.radioT = 0; this.copKills = 0; this.aggroT = -99;
    this.rng = 4242;
    this.brain = makeBrain(this);
  }
  rand() { this.rng = (this.rng * 16807) % 2147483647; return this.rng / 2147483647; }

  ready() {
    if (this.hooked) return;
    this.hooked = true;
    // the helicopter's searchlight (one, made now so the shaders compile with it): a bright but bounded pool
    // (no distance falloff, so it's the same on a rooftop as in the street; ~3x the moonlight, under the bloom
    // threshold on light clothes) and a soft beam that fades at its edges, towards the ground and near the camera
    const scene = V.world.scene;
    const spot = new THREE.SpotLight(0xe6eeff, 0, 400, 0.13, 0.65, 0);
    spot.position.set(0, -1000, 0);
    scene.add(spot); scene.add(spot.target);
    const geo = new THREE.ConeGeometry(1, 1, 28, 1, true); geo.translate(0, -0.5, 0); geo.rotateX(-Math.PI / 2); // apex at the origin, opening along +z
    const cone = new THREE.Mesh(geo, new THREE.ShaderMaterial({
      uniforms: { color: { value: new THREE.Color(0xcfe0ff) }, opacity: { value: 0 } },
      vertexShader: `varying vec3 vN, vV; varying float vS;
        void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = -mv.xyz; vS = position.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform vec3 color; uniform float opacity; varying vec3 vN, vV; varying float vS;
        void main() {
          float dist = length(vV);
          float f = abs(dot(normalize(vN), vV / dist));          // the middle of the beam, not its edges
          float a = opacity * f * f * mix(1.0, 0.3, vS) * smoothstep(8.0, 45.0, dist);
          gl_FragColor = vec4(color, a);
        }`,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false,
    }));
    cone.visible = false; cone.frustumCulled = false; cone.renderOrder = 4;
    scene.add(cone);
    this.beam = { spot, cone, x: 0, z: 0 };
    V.events.on('crime', (e) => this._crime(e));
    V.events.on('death', (e) => { if (e.ped?.team === 'cops') { e.ped.persistent = false; this.cops.delete(e.ped); } });
    V.events.on('vehicle:destroyed', (e) => { const u = this.units.find((x) => x.veh === e.veh); if (u && (e.attacker?.isPlayer || e.veh.lastAttacker?.isPlayer)) this._apply('explosion', e.veh.pos, true); });
    const add = () => {
      if (!window.__vc) return setTimeout(add, 500);
      window.__vc.police = {
        P: this,
        set: (n) => this.set(n),
        crime: (kind) => this._apply(kind, V.player.pos, true),
        stats: () => ({ wanted: this.wanted, searching: this.searching, seen: this.seen, cool: +this.coolT.toFixed(1), units: this.units.map((u) => [u.mode, Math.round(u.veh.pos.distanceTo(V.player.pos)), Math.round(u.veh.speed || 0), u.crew.filter((c) => c.vehicle).length]), cops: this.cops.size, ms: +(this.ms || 0).toFixed(2) }),
      };
    };
    add();
  }

  // ---- stars ----
  set(level) {
    const was = this.wanted;
    this.wanted = Math.max(0, Math.min(5, level | 0));
    if (this.wanted > was) {
      if (!was) { this.lastSeen.copy(V.player.pos); this.unseenT = 0; this.copKills = 0; this.heat = Math.max(this.heat || 0, HEAT_LEVEL[this.wanted]); }
      this.coolT = 0; this.knowT = 12; // dispatch knows where you are for a while
      V.audio?.ui?.('star');
      if (this.wanted >= 3 && was < 3) this._radio('All units, suspect is armed and dangerous.');
    }
    if (!this.wanted) { this.searching = false; this.search = null; this.heat = 0; }
  }
  add(stars, pos) { if (pos) this.lastSeen.copy(pos); this.set(this.wanted + stars); }
  clear() {
    this.set(0);
    this.reports.length = 0;
    for (const u of this.units) this._leave(u);
  }

  /** A crime by the player: seen by a cop (counts now), or phoned in by a witness. */
  _crime(e) {
    const P = V.player;
    if (!P || P.dead || !(e.by === P || e.by?.isPlayer)) return;
    if (V.session?.state !== 'play') return;
    let kind = e.kind;
    if (kind === 'assault' && e.victim?.team === 'cops') kind = 'copAssault';
    const pos = e.pos || P.pos;
    if (kind === 'copAssault' || kind === 'copMurder') { this.aggroT = this.t; this._apply(kind, pos, true); return; }
    if (this._copSees(pos)) { this._apply(kind, pos, true); return; }
    if (LEVEL[kind] && kind !== 'theft' && (e.fromPeds || this._civilianNear(pos))) {
      if (this.reports.some((r) => r.kind === kind && r.t > 0)) return;
      this.reports.push({ kind, pos: pos.clone(), t: 3.5 + this.rand() * 3 });
    }
  }
  _apply(kind, pos, seen) {
    let lvl = LEVEL[kind] ?? 1;
    if (kind === 'copMurder') { this.copKills++; lvl = Math.min(5, 3 + (this.copKills >= 6) + (this.copKills >= 12)); }
    if (!lvl) return;
    this.heat = (this.heat || 0) + (HEAT[kind] ?? 1) * (seen ? 1 : 0.6);
    for (let l = 5; l > lvl; l--) if (this.heat >= HEAT_LEVEL[l]) { lvl = l; break; }
    if (seen) { this.lastSeen.copy(V.player.pos); this.unseenT = 0; }
    else if (!this.wanted) this.lastSeen.copy(pos);
    const was = this.wanted;
    if (lvl > this.wanted) this.set(lvl);
    if (!was && this.wanted) this._radio(this._line(kind, pos));
  }
  _civilianNear(pos) {
    for (const p of V.peds?.near?.(pos.x, pos.z, 60) || []) if (!p.dead && p.team === 'civ') return true;
    return false;
  }
  /** Can some cop see this spot? (cheap: the nearest few) */
  _copSees(pos) {
    let n = 0;
    for (const c of this.cops) {
      if (c.dead) continue;
      const d = Math.hypot(c.pos.x - pos.x, c.pos.z - pos.z);
      if (d > (c.vehicle ? (c.vehicle.kind === 'heli' ? 240 : 120) : 90)) continue;
      if (d < 12 || this._los(c, pos)) return true;
      if (++n > 6) break;
    }
    return false;
  }
  _los(c, pos) {
    const ax = c.pos.x, ay = c.pos.y + 4.4, az = c.pos.z;
    const dx = pos.x - ax, dy = pos.y + 3 - ay, dz = pos.z - az, d = Math.hypot(dx, dy, dz);
    if (d < 1) return true;
    const P = V.player;
    return !V.phys.ray(ax, ay, az, dx / d, dy / d, dz / d, d - 1, { skip: (b) => (c.vehicle && b.vehicle === c.vehicle) || (P.vehicle && b.vehicle === P.vehicle) || b.kerb || b.prop });
  }

  // ---- every frame ----
  update(dt) {
    const t0 = performance.now();
    this.t += dt;
    const P = V.player;
    if (!P?.pos || !V.vehicles || !V.peds) return;
    // phoned-in crimes
    for (let i = this.reports.length - 1; i >= 0; i--) { const r = this.reports[i]; if ((r.t -= dt) <= 0) { this.reports.splice(i, 1); if (!P.dead) this._apply(r.kind, r.pos, false); } }
    // who can see the player (a few times a second)
    if ((this.sightT -= dt) <= 0) { this.sightT = 0.2; this.seen = !P.dead && this._copSees(P.pos); }
    if (this.wanted) this._wanted(dt, P);
    this._spray(P);
    this._units(dt, P);
    this._cull(P);
    this._searchlight(dt, P);
    // the radar
    this.blips.length = 0;
    if (this.wanted) {
      for (const u of this.units) if (!u.veh.dead && u.mode !== 'leave') this.blips.push(u.veh.pos);
      for (const c of this.cops) if (!c.dead && !c.vehicle) this.blips.push(c.pos);
    }
    this.ms = (this.ms || 0) * 0.9 + (performance.now() - t0) * 0.1;
  }

  _wanted(dt, P) {
    this.knowT = Math.max(0, (this.knowT || 0) - dt);
    if (this.seen || this.knowT > 0) {
      this.lastSeen.copy(P.pos); this.unseenT = 0; this.coolT = 0;
      const pv = P.vehicle ? P.vehicle.vel : P.vel; this.lastVel.set(pv.x, 0, pv.z);
      if (this.searching) { this.searching = false; this.search = null; this._radio(`Suspect spotted ${this._where(P.pos)}.`); }
      return;
    }
    this.unseenT += dt;
    if (this.unseenT > 2.5 && !this.searching) {
      this.searching = true;
      // they reckon on where you were heading: a fast getaway moves the circle on and makes it bigger
      const sp = Math.min(130, this.lastVel.length()), k = sp > 20 ? 2.5 : 0;
      this.search = { x: this.lastSeen.x + this.lastVel.x * k, z: this.lastSeen.z + this.lastVel.z * k, r: SEARCH_R[this.wanted], extra: sp > 20 ? sp * 2 : 0 };
      this._radio(`All units, suspect last seen ${this._where(this.lastSeen)}.`);
    }
    if (!this.searching) return;
    this.search.r = SEARCH_R[this.wanted] + this.search.extra;
    const out = Math.hypot(P.pos.x - this.search.x, P.pos.z - this.search.z) > this.search.r;
    this.coolT = out ? this.coolT + dt : Math.max(0, this.coolT - dt * 0.5);
    if (this.coolT >= COOL[this.wanted]) {
      this.clear();
      V.hud?.notify?.('You lost the cops.');
      this._radio('All units, suspect lost. Resume patrol.');
    }
  }

  /** The Pay 'n' Spray: drive in unseen, come out clean. */
  _spray(P) {
    if (!this.wanted || !P.vehicle || P.vehicle.kind !== 'car' || this.seen) return;
    const sp = V.city?.places?.sprayshop, at = sp?.door || sp || PLACES.find((p) => p.kind === 'spray');
    if (!at || Math.hypot(P.pos.x - at.x, P.pos.z - at.z) > 26 || (this.sprayT || 0) > this.t) return;
    this.sprayT = this.t + 20;
    const veh = P.vehicle, fee = Math.min(100, P.money);
    P.money -= fee;
    V.post?.fadeOut?.(0.4);
    V.session?.after?.(0.5, () => {
      veh.repair?.();
      veh.setPaint?.(['#c0392b', '#2471a3', '#f4d03f', '#ecf0f1', '#1c1c1c', '#7d3c98', '#17a589'][Math.floor(this.rand() * 7)]);
      V.post?.fadeIn?.(0.8);
    });
    this.clear();
    V.hud?.notify?.(`Pay 'n' Spray: $${fee}. New paint, no heat.`);
  }

  // ---- the units: cruisers with a crew of two ----
  _units(dt, P) {
    const want = (this.wanted ? CARS[this.wanted] : 0);
    const active = this.units.filter((u) => !u.heli && u.mode !== 'leave' && u.mode !== 'patrol' && !u.veh.dead);
    const helis = this.units.filter((u) => u.heli && u.mode === 'pursue' && !u.veh.dead);
    if (this.wanted) {
      // the patrols nearby join in
      for (const u of this.units) if (u.mode === 'patrol' && active.length < want && !u.veh.dead) { this._pursue(u); active.push(u); }
    } else {
      for (const u of this.units) if (u.mode !== 'patrol' && u.mode !== 'leave') this._leave(u);
    }
    if ((this.spawnT -= dt) <= 0) {
      this.spawnT = this.wanted ? 1.2 : 3;
      if (this.wanted && helis.length < HELIS[this.wanted] && !P.dead && (this.heliT || 0) < this.t) { this.heliT = this.t + 8; this._spawnHeli(P); }
      else if (this.wanted && active.length < want && !P.dead) { const u = this._spawn(P, false); if (u) this._pursue(u); }
      else if (!this.wanted && this.units.filter((u) => u.mode === 'patrol').length < PATROLS && !P.dead) this._spawn(P, true);
      // retire extra pursuers (the level went down)
      if (active.length > want + 1) this._leave(active[active.length - 1]);
      if (helis.length > HELIS[this.wanted]) this._leave(helis[helis.length - 1]);
    }
    for (const u of this.units) this._unit(u, dt, P);
  }

  _spawn(P, patrol) {
    const plan = V.plan;
    // a fast getaway: they come in from up the road (on the same road, going your way)
    const pv = P.vehicle?.vel, ps = pv && !patrol ? Math.hypot(pv.x, pv.z) : 0, fast = ps > 35;
    const ux = fast ? pv.x / ps : 0, uz = fast ? pv.z / ps : 0;
    const hwy = fast && nearEdge3(plan, P.pos.x, P.pos.y, P.pos.z, 40)?.edge?.cls === 'hwy';
    for (let tries = 0; tries < (fast ? 16 : 10); tries++) {
      let a = this.rand() * Math.PI * 2, r = RING_IN + this.rand() * (RING_OUT - RING_IN);
      if (fast && tries < 12) { a = Math.atan2(uz, ux) + (this.rand() - 0.5) * (hwy ? 0.3 : 1.2); r = Math.min(620, RING_IN + ps * (2 + this.rand() * 2.5)); }
      const ne = nearEdge3(plan, P.pos.x + Math.cos(a) * r, P.pos.y, P.pos.z + Math.sin(a) * r, 140);
      if (!ne || ne.edge.len < 40 || ne.edge.cls === 'hwy' && !patrol && P.pos.y < 30) continue;
      if (hwy && tries < 12 && ne.edge.cls !== 'hwy') continue;
      const d = Math.hypot(ne.x - P.pos.x, ne.z - P.pos.z);
      // (ahead of a fast car a cruiser far up the road may pop in: a dot that far off, while you look at the road)
      if (d < RING_IN - 40 || d > (fast ? 700 : RING_OUT + 60) || (visible(ne.x, ne.y, ne.z) && d < (fast ? 420 : 650))) continue;
      if (V.vehicles.near(ne.x, ne.z, 14).length) continue;
      // face along the road, towards the player
      const [tx, tz] = tangent(ne.edge, ne.along);
      let toward = (P.pos.x - ne.x) * tx + (P.pos.z - ne.z) * tz > 0 ? 1 : -1;
      if (fast && (ne.x - P.pos.x) * ux + (ne.z - P.pos.z) * uz > 100) toward = tx * ux + tz * uz > 0 ? 1 : -1;
      else if (!patrol) {
        // face the way the route to the player sets off (no U-turn to start with)
        const r = route3(plan, ne.x, ne.y, ne.z, P.pos.x, P.pos.y, P.pos.z);
        const q = r?.pts?.find((p) => Math.hypot(p.x - ne.x, p.z - ne.z) > 4);
        if (q) toward = (q.x - ne.x) * tx + (q.z - ne.z) * tz > 0 ? 1 : -1;
      }
      const h = Math.atan2(tx * toward, tz * toward);
      const off = patrol ? 6 : 2;
      const x = ne.x - tz * toward * off, z = ne.z + tx * toward * off;
      const veh = V.vehicles.spawn('police', x, z, h, { y: ne.y, speed: patrol ? 15 : fast ? Math.min(90, ps * 0.6) : 35 });
      if (!veh) return null;
      const u = { veh, crew: [], mode: patrol ? 'patrol' : 'pursue', path: null, pi: 0, routeT: 0, stuck: 0, backT: 0, waitT: 0, goal: null, lane: patrol ? 6 : 1.5, aimT: 0 };
      const armed = this.wanted >= 3;
      for (let i = 0; i < 2; i++) {
        const c = V.peds.spawn({ x, z, y: ne.y, heading: h, kind: 'cop', team: 'cops', weapon: armed && i === 1 ? (this.wanted >= 4 ? 'carbine' : 'shotgun') : 'pistol', ai: this.brain, persistent: true });
        if (!c) continue;
        c.cop = { unit: u, fireT: 0.6, burst: 0, arrest: 0, losT: 0, los: false, sayT: this.rand() * 4 };
        if (c.enterVehicle(veh, i)) { u.crew.push(c); this.cops.add(c); } else V.peds.remove(c);
      }
      if (!u.crew.length) { V.vehicles.remove(veh); return null; }
      veh.engineOn = true;
      this.units.push(u);
      return u;
    }
    return null;
  }
  /** A police helicopter: comes in high from out of sight, then circles over you. */
  _spawnHeli(P) {
    const a = this.rand() * Math.PI * 2, r = 520;
    const x = P.pos.x + Math.cos(a) * r, z = P.pos.z + Math.sin(a) * r;
    const g = V.ground?.heightAt?.(x, z) ?? 0, y = Math.max(g, P.pos.y) + 110;
    const veh = V.vehicles.spawn('policeheli', x, z, Math.atan2(P.pos.x - x, P.pos.z - z), { y });
    if (!veh) return null;
    veh.rotor = 1; veh.engineOn = true; veh.vel?.set?.(0, 0, 0);
    const u = { veh, crew: [], mode: 'pursue', heli: true, orbit: this.rand() * 6.28, stuck: 0, backT: 0 };
    for (let i = 0; i < 2; i++) {
      const c = V.peds.spawn({ x, z, y, heading: 0, kind: 'cop', team: 'cops', weapon: i ? 'carbine' : 'pistol', ai: this.brain, persistent: true });
      if (!c) continue;
      c.cop = { unit: u, fireT: 2, burst: 0, arrest: 0, losT: 0, los: false, sayT: 9 };
      if (c.enterVehicle(veh, i)) { u.crew.push(c); this.cops.add(c); } else V.peds.remove(c);
    }
    veh.rotor = 1; veh.engineOn = true; veh.siren = false;
    this.units.push(u);
    if (this.wanted >= 3) this._radio('Air unit en route.');
    return u;
  }
  /** At night the first helicopter lights you up (or sweeps the search area). */
  _searchlight(dt, P) {
    const B = this.beam;
    if (!B) return;
    const night = V.vehicles.night?.() ?? 0;
    const u = night > 0.2 && this.units.find((x) => x.heli && x.mode === 'pursue' && !x.veh.dead && x.veh.seats?.[0]);
    if (!u) { B.cone.visible = false; B.spot.intensity = 0; return; }
    const v = u.veh;
    // where it points: at you, or sweeping round where you were last seen
    let tx = P.pos.x, tz = P.pos.z;
    if (this.searching && this.search) { const a = this.t * 0.5; tx = this.search.x + Math.cos(a) * this.search.r * 0.45; tz = this.search.z + Math.sin(a * 1.3) * this.search.r * 0.45; }
    const k = Math.min(1, dt * (this.searching ? 1.5 : 4));
    B.x += (tx - B.x) * k; B.z += (tz - B.z) * k;
    if (Math.hypot(B.x - tx, B.z - tz) > 300) { B.x = tx; B.z = tz; }
    const ty = V.phys.groundAt(B.x, P.pos.y + 6, B.z, 0.5, 40);
    _o.set(v.pos.x, v.pos.y - 2.5, v.pos.z);
    _t.set(B.x, Number.isFinite(ty) ? ty : P.pos.y, B.z);
    const len = _o.distanceTo(_t);
    B.spot.position.copy(_o); B.spot.target.position.copy(_t); B.spot.target.updateMatrixWorld();
    B.spot.intensity = 2.6 * night;
    B.cone.visible = true;
    B.cone.position.copy(_o); B.cone.lookAt(_t);
    const r = len * Math.tan(0.11);
    B.cone.scale.set(r, r, len);
    B.cone.material.uniforms.opacity.value = 0.16 * night;
    // you're in the light: they see you
    if (Math.hypot(P.pos.x - B.x, P.pos.z - B.z) < r * 1.2 && this.wanted) { this.seen = true; }
  }
  /** Fly the helicopter: hold an altitude over the target and circle it. */
  _fly(u, dt, P) {
    const veh = u.veh, c = veh.ctl;
    if (veh.dead) { u.mode = 'wreck'; return; }
    if (!veh.seats?.[0]) { c.up = -0.3; c.throttle = 0; c.yaw = 0; return; }
    veh.rotor = Math.max(veh.rotor || 0, 0.9); veh.engineOn = true;
    let tx, tz;
    if (u.mode === 'leave') { tx = u.goal.x; tz = u.goal.z; }
    else {
      let cx = this.searching && this.search ? this.search.x : P.pos.x, cz = this.searching && this.search ? this.search.z : P.pos.z;
      // (far behind a moving target: fly at where it's going to be)
      const fd = Math.hypot(cx - veh.pos.x, cz - veh.pos.z), lv = P.vehicle ? P.vehicle.vel : P.vel;
      if (!this.searching && fd > 120) { const k = Math.min(3, fd / 100); cx += lv.x * k; cz += lv.z * k; }
      u.orbit += dt * 0.22;
      const R = this.searching ? 110 : 65;
      tx = cx + Math.cos(u.orbit) * R; tz = cz + Math.sin(u.orbit) * R;
    }
    const dx = tx - veh.pos.x, dz = tz - veh.pos.z, d = Math.hypot(dx, dz);
    // altitude: well over the player and over the roofs around and ahead (towers are taller than 85)
    if ((u.roofT = (u.roofT || 0) - dt) <= 0) {
      u.roofT = 0.25;
      let top = -Infinity;
      // (right under it: what's below the skids; further on, the way it's going: anything, however tall - its own
      // body isn't there; the towers downtown and on the beach stand well over 85)
      const ux = d > 1 ? dx / d : 0, uz = d > 1 ? dz / d : 0, look = Math.max(140, Math.hypot(veh.vel.x, veh.vel.z) * 3);
      for (let k = 0; k <= 8; k++) {
        const x = veh.pos.x + ux * look * k / 8, z = veh.pos.z + uz * look * k / 8;
        top = Math.max(top, V.phys.groundAt(x, k ? 600 : veh.pos.y - 1, z, 8, 0), V.ground?.heightAt?.(x, z) ?? 0);
      }
      u.roofY = Math.max(top, (u.roofY ?? top) - 12);   // (and remember it a little while: no bobbing over a roof edge)
    }
    const gy = Math.max(V.ground?.heightAt?.(veh.pos.x, veh.pos.z) ?? 0, P.pos.y);
    const ty = Math.max(gy + (u.mode === 'leave' ? 140 : 85), (u.roofY ?? -Infinity) + 35);
    c.up = Math.max(-1, Math.min(1, (ty - veh.pos.y) * 0.05 - veh.vel.y * 0.08));
    // heading: towards the target point (when far), else look at the player
    const look = d > 40 || u.mode === 'leave' ? Math.atan2(dx, dz) : Math.atan2(P.pos.x - veh.pos.x, P.pos.z - veh.pos.z);
    const da = wrap(look - (veh.heading ?? 0));
    c.yaw = Math.max(-1, Math.min(1, -da * 1.6));
    c.steer = 0;
    // forward: nose down to go, up to stop
    const fwd = veh.vel.x * Math.sin(veh.heading) + veh.vel.z * Math.cos(veh.heading);
    const pv = P.vehicle ? P.vehicle.vel : P.vel, ps = Math.hypot(pv.x, pv.z);
    let want = d > 40 ? Math.min(Math.max(75, ps * 1.25), d * 0.6) * Math.max(0, 1 - Math.abs(da) / 1.4) : 12;
    // a tower ahead that's taller than we are: slow down (or back off) while climbing over it
    const climb = ty - veh.pos.y;
    if (climb > 6) want = Math.min(want, climb > 30 ? -8 : 60 - climb * 2.2);
    c.throttle = Math.max(-1, Math.min(1, (want - fwd) * 0.04));
    // the airframe tops out near 60: when the chase runs faster than that (the expressway), the pilot's
    // "afterburner" keeps it on your tail, up to a little over your speed
    if (u.mode === 'pursue' && d > 60 && want > 58 && fwd > 30 && Math.abs(da) < 0.8) {
      const hs = Math.hypot(veh.vel.x, veh.vel.z), top = Math.min(want, 170);
      if (hs < top) { const a = Math.min(top - hs, 160 * dt) / (hs || 1); veh.vel.x += veh.vel.x * a; veh.vel.z += veh.vel.z * a; }
    }
  }
  _pursue(u) { u.mode = 'pursue'; u.veh.siren = true; u.path = null; u.routeT = 0; u.lane = 1.5; u.progT = 0; u.px = u.pz = null; }
  _leave(u) {
    if (u.mode === 'leave') return;
    u.mode = 'leave'; u.veh.siren = false; u.path = null; u.routeT = 0; u.lane = 6;
    const P = V.player, a = this.rand() * Math.PI * 2;
    u.goal = { x: P.pos.x + Math.cos(a) * 900, z: P.pos.z + Math.sin(a) * 900 };
  }

  _unit(u, dt, P) {
    const veh = u.veh, c = veh.ctl;
    u.crew = u.crew.filter((p) => !p.removed && !p.dead);
    if (u.mode === 'wreck' || u.mode === 'stolen') return;
    const driver = veh.seats?.[0];
    if (driver && driver.team !== 'cops') { u.mode = 'stolen'; return; } // the player took it
    if (veh.dead || (u.mode !== 'parked' && (!driver || driver.dead))) { c.throttle = 0; c.brake = 0.4; c.steer = 0; u.mode = 'wreck'; return; }
    if (u.heli) return this._fly(u, dt, P);
    if (u.mode === 'parked') {
      // everyone back in? then on with the chase (or home)
      c.throttle = 0; c.brake = 1;
      const out = u.crew.filter((p) => !p.vehicle);
      if (!out.length && veh.seats?.[0] && (!this.wanted || P.vehicle || Math.hypot(P.pos.x - veh.pos.x, P.pos.z - veh.pos.z) > 60)) { if (this.wanted) this._pursue(u); else this._leave(u); }
      else if (!u.crew.length) u.mode = 'wreck';
      return;
    }
    const dx = P.pos.x - veh.pos.x, dz = P.pos.z - veh.pos.z, d = Math.hypot(dx, dz);
    if (u.mode === 'patrol' || u.mode === 'leave') {
      if (!u.goal || Math.hypot(u.goal.x - veh.pos.x, u.goal.z - veh.pos.z) < 30) { const a = this.rand() * Math.PI * 2; u.goal = { x: veh.pos.x + Math.cos(a) * 500, z: veh.pos.z + Math.sin(a) * 500 }; u.path = null; }
      this._drive(u, dt, u.goal.x, u.goal.z, u.mode === 'leave' ? 34 : 26, false);
      return;
    }
    // a watchdog: a pursuer that hasn't got anywhere for a few seconds (wedged on a corner, boxed in by
    // traffic) is moved on along its route where you can't see it, or backs out and finds another way
    if ((u.progT = (u.progT || 0) + dt) > 5) {
      const moved = Math.hypot(veh.pos.x - (u.px ?? 1e9), veh.pos.z - (u.pz ?? 1e9));
      u.progT = 0; u.px = veh.pos.x; u.pz = veh.pos.z;
      if (moved < 14 && d > 70) {
        u.stalls = (u.stalls || 0) + 1;
        const seen = visible(veh.pos.x, veh.pos.y, veh.pos.z);
        if (!seen && d > 110 && u.path && this._warp(u)) return;
        if (!seen && u.stalls > 1) u.jams = 9;              // (let it go: _cull drops it, a fresh one comes)
        else { u.backT = 1.8; u.path = null; u.routeT = 0; u.turnT = 0; u.lane = -u.lane; }
      } else if (moved > 40) u.stalls = 0;
    }
    // pursue: you, or (searching) a spot inside the search area
    let tx = P.pos.x, tz = P.pos.z;
    if (this.searching && this.search) {
      if (!u.goal || u.goalT < this.t || Math.hypot(u.goal.x - veh.pos.x, u.goal.z - veh.pos.z) < 25) {
        const a = this.rand() * Math.PI * 2, r = Math.sqrt(this.rand()) * this.search.r * 0.8;
        u.goal = { x: this.search.x + Math.cos(a) * r, z: this.search.z + Math.sin(a) * r }; u.goalT = this.t + 14; u.path = null;
      }
      tx = u.goal.x; tz = u.goal.z;
      this._drive(u, dt, tx, tz, 40, false);
      return;
    }
    u.goal = null;
    const pv = P.vehicle;
    if (!pv) {
      // you're on foot: pull up and get out
      if (d < 38 || (d < 75 && (u.stuck > 0.6 || u.backT > 0))) {
        u.backT = 0; c.throttle = 0; c.brake = 1; c.handbrake = (veh.speed || 0) > 20; c.steer = 0;
        if (Math.abs(veh.speed || 0) < 5) { u.mode = 'parked'; for (const p of u.crew) if (p.vehicle) { p.exitVehicle(); p.cop.fireT = 0.8 + this.rand(); } }
        return;
      }
      this._drive(u, dt, tx, tz, d < 90 ? 38 : 70, d < 70);
      return;
    }
    // you're driving: catch up, then ram (2★+) or box you in when you stop (1★)
    const ps = pv.speed || 0;
    // you've stopped (or crashed): pull up and get out
    if (Math.abs(ps) < 4 && (d < 34 || (d < 75 && (u.stuck > 0.5 || u.backT > 0)))) {
      u.backT = 0; c.throttle = 0; c.brake = 1; c.steer = 0;
      if (Math.abs(veh.speed || 0) < 5) { u.mode = 'parked'; for (const p of u.crew) if (p.vehicle) { p.exitVehicle(); p.cop.fireT = 0.8 + this.rand(); } }
      return;
    }
    const aps = Math.abs(ps);
    if (aps > 40) {
      // ahead of you (spawned up the road, or you went past it): hold the road in front of you, a little
      // slower than you, so you catch up into a block - rather than U-turning into your path
      const ux = pv.vel.x / aps, uz = pv.vel.z / aps, along = -(dx * ux + dz * uz), side = dx * uz - dz * ux;
      if (along > 8 && along < 320 && Math.abs(side) < 60 && veh.vel.x * ux + veh.vel.z * uz > -5) {
        this._drive(u, dt, P.pos.x + ux * (along + 40), P.pos.z + uz * (along + 40), aps * (along < 50 ? 0.82 : along < 150 ? 0.65 : 0.45), along < 90);
        return;
      }
    }
    if (d < 80 && aps < 6) {
      // you've (nearly) stopped: pull up hard beside you and box you in, rather than ramming a parked car to bits
      this._drive(u, dt, tx, tz, Math.max(5, (d - 13) * 0.9), d < 50);
      return;
    }
    if (d < 80) {
      const lead = Math.min(1, d / 60) * 0.6;
      tx += pv.vel.x * lead; tz += pv.vel.z * lead;
      if (this.wanted >= 2) { this._drive(u, dt, tx, tz, Math.max(30, aps + 18), true); veh.ctl.throttle = Math.max(veh.ctl.throttle, d < 25 ? 1 : veh.ctl.throttle); }
      else this._drive(u, dt, tx, tz, Math.max(20, aps * (d > 25 ? 1.15 : 0.9)), true);
      return;
    }
    // far: head for where you're going to be (an intercept), as fast as the road allows
    const lead = Math.min(4, d / 70);
    this._drive(u, dt, tx + pv.vel.x * lead, tz + pv.vel.z * lead, Math.min(150, Math.max(75, aps * 1.25)), false);
  }

  /** Steer and pedal towards (tx, tz): along a route on the roads, or straight there. */
  _drive(u, dt, tx, tz, vmax, direct) {
    const veh = u.veh, c = veh.ctl, h = veh.heading ?? 0, speed = veh.speed || 0;
    let ax = tx, az = tz;
    if (!direct) {
      if ((u.routeT -= dt) <= 0 || !u.path || (u.goalR && Math.hypot(u.goalR.x - tx, u.goalR.z - tz) > Math.max(50, Math.hypot(tx - veh.pos.x, tz - veh.pos.z) * 0.3) && u.routeT < 1.2)) {
        u.routeT = u.mode === 'pursue' ? 1.6 + this.rand() * 0.6 : 6;
        const ty = u.mode === 'pursue' && !this.searching ? V.player.pos.y : veh.pos.y;
        const r = route3(V.plan, veh.pos.x, veh.pos.y, veh.pos.z, tx, ty, tz, { dirX: Math.sin(h), dirZ: Math.cos(h), uturn: Math.abs(speed) > 15 ? 260 : 60 });
        let pts = null;
        if (r && r.pts.length > 1) { pts = [r.pts[0]]; for (const q of r.pts) { const l = pts[pts.length - 1]; if (Math.abs(q.x - l.x) + Math.abs(q.z - l.z) > 2) pts.push(q); } }
        u.path = pts && pts.length > 1 ? pts : null; u.pi = 0; u.goalR = { x: tx, z: tz };
      }
      const pts = u.path;
      if (pts) {
        // the next vertex ahead: passed once we're beyond it along its segment
        while (u.pi < pts.length - 1) {
          const p = pts[u.pi], q = pts[u.pi + 1];
          const sx = q.x - p.x, sz = q.z - p.z;
          if ((p.x - veh.pos.x) ** 2 + (p.z - veh.pos.z) ** 2 < 49 || (veh.pos.x - p.x) * sx + (veh.pos.z - p.z) * sz > 0) u.pi++; else break;
        }
        // aim a little way along the path (pure pursuit), offset into the lane
        let L = 7 + Math.abs(speed) * 0.24, k = u.pi, cx = veh.pos.x, cz = veh.pos.z;   // (short enough not to cut a corner over the kerb)
        ax = pts[k].x; az = pts[k].z;
        for (; k < pts.length; k++) {
          const q = pts[k], dl = Math.hypot(q.x - cx, q.z - cz);
          if (dl >= L) { ax = cx + (q.x - cx) * L / dl; az = cz + (q.z - cz) * L / dl; break; }
          L -= dl; cx = q.x; cz = q.z; ax = q.x; az = q.z;
          // a real corner (a junction): aim at it until we're there, rather than cutting across the kerb into
          // the traffic-light pole on the corner
          const n = pts[k + 1], pr = k > 0 ? pts[k - 1] : null;
          if (n && pr) {
            const ix = q.x - pr.x, iz = q.z - pr.z, ox = n.x - q.x, oz = n.z - q.z, il = Math.hypot(ix, iz), ol = Math.hypot(ox, oz);
            if (il > 1 && ol > 1 && (ix * ox + iz * oz) / (il * ol) < 0.8) break;
          }
        }
        const k0 = Math.max(0, Math.min(k, pts.length - 1) - 1), k1 = Math.min(pts.length - 1, k0 + 1);
        let sx = pts[k1].x - pts[k0].x, sz = pts[k1].z - pts[k0].z; const sl = Math.hypot(sx, sz) || 1; sx /= sl; sz /= sl;
        ax -= sz * u.lane; az += sx * u.lane;
        // brake in time for the corners ahead
        let along = Math.hypot(pts[u.pi].x - veh.pos.x, pts[u.pi].z - veh.pos.z);
        for (let j = u.pi; j < pts.length - 1 && along < 160; j++) {
          const a = pts[Math.max(0, j - 1)], b = pts[j], c2 = pts[j + 1];
          let ux = b.x - a.x, uz = b.z - a.z, wx = c2.x - b.x, wz = c2.z - b.z;
          const ul = Math.hypot(ux, uz), wl = Math.hypot(wx, wz);
          if (ul > 1 && wl > 1) {
            const turn = 1 - (ux * wx + uz * wz) / (ul * wl); // 0 straight, 1 = 90 degrees, 2 = back
            if (turn > 0.15) vmax = Math.min(vmax, (turn > 1 ? 12 : 36 - 22 * turn) + Math.sqrt(2 * 22 * Math.max(0, along - 10)));
          }
          along += wl;
        }
        if (u.pi >= pts.length - 1 && Math.hypot(pts[u.pi].x - veh.pos.x, pts[u.pi].z - veh.pos.z) < 15) { ax = tx; az = tz; }
      }
    }
    // cars in the way: go round them (pursuit) or wait behind them (patrol)
    const fx = Math.sin(h), fz = Math.cos(h);
    let shift = 0, gap = Infinity;
    for (const o of V.vehicles.near(veh.pos.x, veh.pos.z, 45)) {
      if (o === veh || o === V.player.vehicle) continue;
      const ox = o.pos.x - veh.pos.x, oz = o.pos.z - veh.pos.z, along = ox * fx + oz * fz;
      if (along < 4 || along > 40) continue;
      const side = ox * fz - oz * fx;
      if (Math.abs(side) > 7) continue;
      gap = Math.min(gap, along - 12);
      shift += (side > 0 ? -1 : 1) * (8 - Math.abs(side));
    }
    if (u.mode === 'patrol' || u.mode === 'leave') { if (gap < Infinity) vmax = Math.min(vmax, Math.max(0, gap * 0.8)); }
    else if (shift) { ax += fz * shift * 1.5; az -= fx * shift * 1.5; }
    if (u.dodgeT > 0) { u.dodgeT -= dt; ax += fz * u.dodge * 9; az -= fx * u.dodge * 9; }
    // steering (+1 = right) and pedals
    const want = Math.atan2(ax - veh.pos.x, az - veh.pos.z);
    const da = wrap(want - h);
    if (u.backT > 0) {
      // reversing out of a jam
      u.backT -= dt;
      c.throttle = -0.8; c.brake = 0; c.handbrake = false; c.steer = da > 0 ? 1 : -1;
      return;
    }
    // the way on is behind us and we're slow: a three-point turn
    if (Math.abs(da) > 1.75 && Math.abs(speed) < 10 && !u.turnT) { u.backT = 1.4; u.turnT = 3; return; }
    if (u.turnT) u.turnT = Math.max(0, u.turnT - dt);
    c.steer = Math.max(-1, Math.min(1, -da * 2.2));
    if (Math.abs(da) > 0.9) vmax = Math.min(vmax, 24);
    const err = vmax - speed;
    c.throttle = err > 0 ? Math.min(1, err / 10 + 0.2) : 0;
    c.brake = err < -3 ? Math.min(1, -err / 14) : 0;
    c.handbrake = u.mode === 'pursue' && Math.abs(da) > 1.2 && speed > 30;
    // stuck: back up and try again
    if (c.throttle > 0.3 && Math.abs(speed) < 2.5) u.stuck += dt; else u.stuck = Math.max(0, u.stuck - dt * 2);
    if (u.stuck > 1.3) {
      u.stuck = 0; u.jams = (u.jams || 0) + 1;
      this.dbg?.push({ x: veh.pos.x | 0, z: veh.pos.z | 0, da: +da.toFixed(2), sp: speed | 0, cars: V.vehicles.near(veh.pos.x, veh.pos.z, 16).length - 1, path: !!u.path, gap: gap | 0, shift: +shift.toFixed(1), pi: u.pi, ax: ax | 0, az: az | 0 });
      // jammed where you can't see: hop ahead along the route (what you don't see didn't happen)
      const P = V.player;
      if (u.path && Math.hypot(veh.pos.x - P.pos.x, veh.pos.z - P.pos.z) > 110 && !visible(veh.pos.x, veh.pos.y, veh.pos.z) && this._warp(u)) return;
      u.backT = 1.1; u.path = null;
      // nose to nose with a car: back off further and go round it, on the side it isn't
      for (const o of V.vehicles.near(veh.pos.x, veh.pos.z, 22)) {
        if (o === veh) continue;
        const ox = o.pos.x - veh.pos.x, oz = o.pos.z - veh.pos.z;
        if (ox * fx + oz * fz > 2) { u.dodge = ox * fz - oz * fx > 0 ? -1 : 1; u.dodgeT = 3; u.backT = 1.6; break; }
      }
      // or a wall, a pole, a kerb-side box: look left and right of the nose and go the clearer way
      if (!(u.dodgeT > 0)) {
        const clear = (a) => { const dx = Math.sin(h + a), dz = Math.cos(h + a); return V.phys.ray(veh.pos.x, veh.pos.y + 2.5, veh.pos.z, dx, 0, dz, 22, { skip: (b) => b.vehicle || b.kerb })?.d ?? 22; };
        u.dodge = clear(0.6) >= clear(-0.6) ? 1 : -1; u.dodgeT = 2.5; u.backT = 1.5;   // (+1: to the left)
      }
    }
  }

  /** Move a unit (car and crew) a little way along its route, onto the road. */
  _warp(u) {
    const pts = u.path, old = u.veh, P = V.player;
    for (let k = Math.min(u.pi + 1, pts.length - 1); k < pts.length; k++) {
      const a = pts[k - 1] || pts[k], b = pts[k];
      const x = (a.x + b.x) / 2, z = (a.z + b.z) / 2;
      if (Math.hypot(x - old.pos.x, z - old.pos.z) < 30 || Math.hypot(x - P.pos.x, z - P.pos.z) < 140) continue;
      if (visible(x, b.y ?? old.pos.y, z) || V.vehicles.near(x, z, 14).length) continue;
      const ne = nearEdge3(V.plan, x, b.y ?? old.pos.y, z, 40);
      if (!ne) continue;
      const h = Math.atan2(b.x - a.x, b.z - a.z) || old.heading;
      const veh = V.vehicles.spawn('police', ne.x, ne.z, h, { y: ne.y, speed: 20 });
      if (!veh) return false;
      const crew = u.crew.filter((c) => c.vehicle === old);
      for (const c of crew) c.exitVehicle();
      crew.forEach((c, i) => c.enterVehicle(veh, i));
      V.vehicles.remove(old);
      veh.siren = old.siren; veh.engineOn = true;
      u.veh = veh; u.pi = k; u.backT = 0; u.routeT = 0;
      return true;
    }
    return false;
  }

  _cull(P) {
    for (let i = this.units.length - 1; i >= 0; i--) {
      const u = this.units[i], v = u.veh;
      const d = Math.hypot(v.pos.x - P.pos.x, v.pos.z - P.pos.z);
      const gone = v.removed || ((d > DROP || (u.mode === 'leave' && d > (u.heli ? 600 : 360)) || (u.jams > 2 && d > 70 && u.mode !== 'parked')) && !visible(v.pos.x, v.pos.y, v.pos.z)) || d > DROP * 1.8;
      if (u.mode === 'stolen' && !v.removed) { this.units.splice(i, 1); continue; }
      if (!gone) continue;
      this.units.splice(i, 1);
      for (const c of u.crew) if (c.vehicle === v || Math.hypot(c.pos.x - P.pos.x, c.pos.z - P.pos.z) > 300) { this.cops.delete(c); V.peds.remove(c); }
      if (!v.removed && v !== P.vehicle && !v.seats?.some((s) => s?.isPlayer)) V.vehicles.remove(v);
    }
    // cops on foot left behind
    for (const c of this.cops) {
      if (c.removed) { this.cops.delete(c); continue; }
      if (c.vehicle) continue;
      const d = Math.hypot(c.pos.x - P.pos.x, c.pos.z - P.pos.z);
      if ((d > 420 && !visible(c.pos.x, c.pos.y + 2, c.pos.z)) || d > 900 || (!this.wanted && c.cop?.gone && d > 160 && !visible(c.pos.x, c.pos.y + 2, c.pos.z))) { this.cops.delete(c); V.peds.remove(c); }
    }
  }

  /** BUSTED. */
  bust(cop) {
    const P = V.player;
    if (P.dead || V.session?.state !== 'play') return;
    V.peds?.say?.(cop, 'You\'re under arrest!', 2.5);
    if (P.vehicle) P.exitVehicle?.(true);
    V.events.emit('player:busted', { by: cop });
  }

  // ---- the radio ----
  _radio(text) {
    if (this.t < this.radioT) return;
    this.radioT = this.t + 5;
    V.hud?.subtitle?.('Dispatch', text, 4);
    V.audio?.radio?.();
  }
  _where(pos) {
    const ne = nearEdge3(V.plan, pos.x, pos.y, pos.z, 120);
    const D = V.plan.districtAt?.(pos.x, pos.z);
    const P = V.player, vel = P.vehicle ? P.vehicle.vel : P.vel;
    const sp = Math.hypot(vel.x, vel.z);
    let s = ne?.edge?.name ? `on ${ne.edge.name}` : D?.name ? `in ${D.name}` : 'downtown';
    if (ne?.edge?.name && D?.name) s += `, ${D.name}`;
    if (sp > 8) s += `, heading ${COMPASS[Math.round(((Math.atan2(vel.x, -vel.z) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI / 4)) % 8]}`;
    return s;
  }
  _line(kind, pos) {
    const w = this._where(pos);
    return {
      shots: `10-71, shots fired ${w}.`, murder: `Homicide reported ${w}.`, copMurder: `Officer down! Officer down ${w}!`, copAssault: `Officer assaulted ${w}.`,
      carjack: `Carjacking in progress ${w}.`, hitPed: `Hit and run ${w}.`, explosion: `Explosion reported ${w}.`, assault: `Assault in progress ${w}.`,
    }[kind] || `Disturbance reported ${w}.`;
  }
}

// ---- cops on foot ---------------------------------------------------------------------------------------------------------
function makeBrain(pol) {
  return {
    noDrop: false,
    update(p, dt) {
      const P = V.player, sys = V.peds, c = p.cop || (p.cop = { fireT: 0.6, burst: 0, arrest: 0, losT: 0, los: false, sayT: 2 });
      const u = c.unit, car = u?.veh;
      const dx = P.pos.x - p.pos.x, dz = P.pos.z - p.pos.z, d = Math.hypot(dx, dz);
      c.losT -= dt;
      if (c.losT <= 0) { c.losT = 0.2 + pol.rand() * 0.1; c.los = !P.dead && d < (p.vehicle?.kind === 'heli' ? 200 : 130) && sys.lineOfSight(p, P); }
      // in the car: the passenger shoots out of the window at 3★ and up
      if (p.vehicle) {
        const heli = p.vehicle.kind === 'heli';
        if (p.seat > 0 && pol.wanted >= (heli ? 4 : 3) && c.los && d < (heli ? 140 : 55) && !P.dead && (c.fireT -= dt) <= 0) {
          c.fireT = 0.7 + pol.rand() * 0.9;
          _o.set(p.vehicle.pos.x, p.vehicle.pos.y + (heli ? -2 : 4.5), p.vehicle.pos.z);
          _t.set(P.pos.x, P.pos.y + 3, P.pos.z);
          V.combat?.fireAt?.(p, _o.clone(), _t.clone(), p.weapon || 'pistol', { error: heli ? 3 + d * 0.03 : 5 + d * 0.08 });
          if (heli) c.fireT = 0.25 + (++c.burst % 4 === 0 ? 1.6 : 0);
        }
        return;
      }
      const carOk = car && !car.dead && !car.removed && car.seats?.[0]?.team !== 'player' && !car.seats?.some((s) => s?.isPlayer);
      // stand down: back to the car, or walk off
      if (!pol.wanted || P.dead) {
        if (carOk && Math.hypot(car.pos.x - p.pos.x, car.pos.z - p.pos.z) < 140) return backToCar(p, car, sys);
        c.gone = true;
        const a = Math.atan2(-dx, -dz);
        sys.moveTo(p, p.pos.x + Math.sin(a) * 20, p.pos.z + Math.cos(a) * 20, 6.6);
        return;
      }
      // you drove off: back in the car and after you
      if (P.vehicle && d > 45 && carOk && u.mode === 'parked' && Math.hypot(car.pos.x - p.pos.x, car.pos.z - p.pos.z) < 100) return backToCar(p, car, sys);
      // shout now and then
      if ((c.sayT -= dt) <= 0) { c.sayT = 4 + pol.rand() * 5; if (d < 60) sys.say(p, 'cop', 2); }
      const armed = !!(V.weapons?.current && V.weapons.current.mag != null);
      const hostile = pol.wanted >= 2 || pol.t - pol.aggroT < 8 || (armed && V.weapons?.aiming && d < 40);
      // 1★ (and 2★ when you give up): the arrest
      if (pol.wanted <= 2 && d < 4.5 && !(hostile && armed)) {
        const slow = P.vehicle ? Math.abs(P.vehicle.speed || 0) < 3 : Math.hypot(P.vel.x, P.vel.z) < 8;
        if (slow) {
          sys.faceTo(p, P.pos.x, P.pos.z);
          p.P.arms = 'handsup'; p.P.lean = 0.3;
          c.arrest += dt;
          if (c.arrest > 1.2) { c.arrest = 0; pol.bust(p); }
          return;
        }
      }
      c.arrest = Math.max(0, c.arrest - dt);
      if (hostile && c.los && d < 80) {
        // hold position (close in if far), shoot in bursts
        if (d > 32) sys.moveTo(p, P.pos.x, P.pos.z, RUN * 0.8);
        sys.aimAt(p, P);
        if ((c.fireT -= dt) <= 0) {
          sys.shoot(p, P);
          if (++c.burst >= (p.weapon === 'pistol' ? 3 : 4)) { c.burst = 0; c.fireT = 1.0 + pol.rand() * 1.2; }
          else c.fireT = p.weapon === 'shotgun' ? 1.1 : p.weapon === 'pistol' ? 0.38 : 0.14;
        }
        return;
      }
      if (c.burst) { c.burst = 0; c.fireT = 0.5; }
      // chase: you, or where you were last seen
      if (pol.searching && pol.search && !c.los) {
        if (!c.goal || Math.hypot(c.goal.x - p.pos.x, c.goal.z - p.pos.z) < 6) { const a = pol.rand() * Math.PI * 2, r = pol.rand() * pol.search.r * 0.5; c.goal = { x: pol.lastSeen.x + Math.cos(a) * r, z: pol.lastSeen.z + Math.sin(a) * r }; }
        sys.moveTo(p, c.goal.x, c.goal.z, RUN * 0.7);
        return;
      }
      if (armed && d < 40) sys.aimAt(p, P);
      if (d > 3) sys.moveTo(p, P.pos.x, P.pos.z, d > 15 ? SPRINT : RUN);
    },
    onHit(p, attacker) { if (attacker?.isPlayer) pol.aggroT = pol.t; if (p.cop) p.cop.fireT = Math.min(p.cop.fireT, 0.4); },
  };
}

function backToCar(p, car, sys) {
  const dx = car.pos.x - p.pos.x, dz = car.pos.z - p.pos.z;
  if (Math.hypot(dx, dz) < 7) {
    const seat = car.seats[0] ? car.freeSeat(true) : 0;
    if (seat >= 0) p.enterVehicle(car, seat);
    return;
  }
  sys.moveTo(p, car.pos.x, car.pos.z, RUN);
}

// ---- helpers ----
function visible(x, y, z) {
  const cam = V.world.camera;
  _v.set(x - cam.position.x, y - cam.position.y, z - cam.position.z);
  const d = _v.length();
  cam.getWorldDirection(_dir);
  return _v.dot(_dir) / d > 0.5 && d < 900;
}
/** The direction of edge e at distance s along it. */
function tangent(e, s) {
  const pts = e.pts;
  let i = 1;
  while (i < pts.length - 1 && pts[i].d < s) i++;
  const a = pts[i - 1], b = pts[i], L = Math.hypot(b.x - a.x, b.z - a.z) || 1;
  return [(b.x - a.x) / L, (b.z - a.z) / L];
}

// ---- the road graph in 3D ---------------------------------------------------------------------------------------------------
// The expressway deck runs right over the I-95 Frontage boulevard, and core/route.js finds the nearest road in 2D,
// so a chase up on the deck would be routed along the boulevard below. These pick the road at the right height
// (a road far above or below costs 4 studs per stud of height) and run the same A* from there.
const PREFER = { hwy: 0.7, blvd: 0.85, ave: 0.92, street: 1, drive: 1.05 };
const GC3 = 128;
let grid3 = null, grid3Plan = null;
function buildGrid3(plan) {
  grid3 = new Map(); grid3Plan = plan;
  for (const e of plan.edges) {
    const seen = new Set();
    for (let k = 0; k < e.pts.length - 1; k++) {
      const p = e.pts[k], q = e.pts[k + 1], n = Math.max(1, Math.ceil(Math.hypot(q.x - p.x, q.z - p.z) / (GC3 / 2)));
      for (let i = 0; i <= n; i++) {
        const key = Math.floor((p.x + (q.x - p.x) * i / n) / GC3) * 4096 + Math.floor((p.z + (q.z - p.z) * i / n) / GC3);
        if (seen.has(key)) continue; seen.add(key);
        let c = grid3.get(key); if (!c) grid3.set(key, c = []);
        c.push(e);
      }
    }
  }
}
/** The road nearest (x, y, z): {edge, x, y, z, d, along} | null. */
export function nearEdge3(plan, x, y, z, maxR = 400) {
  if (grid3Plan !== plan) buildGrid3(plan);
  let best = null, bd = Infinity;
  const ci = Math.floor(x / GC3), cj = Math.floor(z / GC3);
  for (let r = 0; r <= Math.ceil(maxR / GC3) && bd > (r - 1) * GC3; r++) {
    for (let i = ci - r; i <= ci + r; i++) for (let j = cj - r; j <= cj + r; j++) {
      if (Math.max(Math.abs(i - ci), Math.abs(j - cj)) !== r) continue;
      const c = grid3.get(i * 4096 + j);
      if (c) for (const e of c) for (let k = 0; k < e.pts.length - 1; k++) {
        const p = e.pts[k], q = e.pts[k + 1], sd = segDist(x, z, p.x, p.z, q.x, q.z);
        const ey = p.y + (q.y - p.y) * sd.t, d = sd.d + Math.max(0, Math.abs(ey - y) - 6) * 4;
        if (d < bd) { bd = d; best = { edge: e, x: sd.px, y: ey, z: sd.pz, d: sd.d, along: p.d + (q.d - p.d) * sd.t }; }
      }
    }
  }
  return best && best.d <= maxR ? best : null;
}
/** A* (as core/route.js) from the road at (fx, fy, fz) to the road at (tx, ty, tz). o: {dirX, dirZ, uturn}. */
export function route3(plan, fx, fy, fz, tx, ty, tz, o = null) {
  const s = nearEdge3(plan, fx, fy, fz, 300), t = nearEdge3(plan, tx, ty, tz, 600);
  if (!s || !t) return null;
  const N = plan.nodes, E = plan.edges;
  const g = new Map(), from = new Map(), open = [];
  const h = (n) => Math.hypot(N[n].x - t.x, N[n].z - t.z) * 0.7;
  const push = (n, cost, prev, via) => {
    if (g.has(n) && g.get(n) <= cost) return;
    g.set(n, cost); from.set(n, { prev, via });
    open.push({ n, f: cost + h(n) });
  };
  const back = (n) => (o && (N[n].x - s.x) * o.dirX + (N[n].z - s.z) * o.dirZ < 0 ? o.uturn || 150 : 0);
  const pts = [{ x: s.x, y: s.y, z: s.z }];
  if (s.edge === t.edge) {
    // the same road: straight along it
    const P = s.edge.pts, fwd = t.along >= s.along;
    for (const p of fwd ? P : [...P].reverse()) { if (fwd ? p.d > s.along && p.d < t.along : p.d < s.along && p.d > t.along) pts.push({ x: p.x, y: p.y, z: p.z }); }
    pts.push({ x: t.x, y: t.y, z: t.z });
    return { pts, start: s, end: t };
  }
  push(s.edge.a, s.along * (PREFER[s.edge.cls] || 1) + back(s.edge.a), -1, s.edge.id);
  push(s.edge.b, (s.edge.len - s.along) * (PREFER[s.edge.cls] || 1) + back(s.edge.b), -1, s.edge.id);
  const goal = new Set([t.edge.a, t.edge.b]);
  let end = -1, iter = 0;
  while (open.length && iter++ < 20000) {
    let bi = 0; for (let i = 1; i < open.length; i++) if (open[i].f < open[bi].f) bi = i;
    const { n } = open[bi]; open[bi] = open[open.length - 1]; open.pop();
    if (goal.has(n)) { end = n; break; }
    const gn = g.get(n);
    for (const id of N[n].edges) { const e = E[id], m = e.a === n ? e.b : e.a; push(m, gn + e.len * (PREFER[e.cls] || 1), n, id); }
  }
  if (end < 0) return null;
  const nodes = [], edges = [];
  for (let n = end; n >= 0;) { nodes.unshift(n); const f = from.get(n); if (!f) break; edges.unshift(f.via); n = f.prev; }
  for (let i = 0; i < nodes.length; i++) {
    if (i > 0) { const e = E[edges[i]]; for (const p of e.a === nodes[i - 1] ? e.pts : [...e.pts].reverse()) pts.push({ x: p.x, y: p.y, z: p.z }); }
    else { const n = N[nodes[0]]; pts.push({ x: n.x, y: n.y, z: n.z }); }
  }
  pts.push({ x: t.x, y: t.y, z: t.z });
  return { pts, start: s, end: t };
}
