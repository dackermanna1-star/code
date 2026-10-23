// Connects the simulation to the audio system: events become spatial sounds,
// nearby engines become loops, weather and battle intensity drive the
// ambience.

import * as THREE from 'three';

const LOOP_KIND = {
  mbt: 'tank',
  spaag: 'tank',
  spg: 'tank',
  ifv: 'ifv',
  apc: 'apc',
  scout: 'apc',
  mlrs: 'truck',
  attack_heli: 'heli',
  transport_heli: 'heli',
  jet: 'jet',
  transport_plane: 'plane',
  fpv_drone: 'drone',
  recon_uav: 'uav',
};

const EXPLOSION_SOUND = { small: 'explosion_small', medium: 'explosion_medium', large: 'explosion_large', huge: 'explosion_huge' };

export class AudioBridge {
  constructor(audio) {
    this.audio = audio;
    this.listener = { position: new THREE.Vector3(), forward: new THREE.Vector3(), up: new THREE.Vector3(), velocity: new THREE.Vector3() };
    this.lastPos = new THREE.Vector3();
    this.loops = [];
    this.lastStrike = null;
    this.flybyT = new Map();
    this.impactBudget = 0;
  }

  get ready() {
    return this.audio && this.audio.ready;
  }

  handle(events, world) {
    if (!this.ready) return;
    const a = this.audio;
    const L = this.listener.position;
    this.impactBudget = 8;
    for (const e of events) {
      switch (e.t) {
        case 'fire': {
          if (!e.sound) break;
          const s = e.weapon.sound;
          if (!s) break;
          a.play(s, e, { volume: e.n > 1 ? 1.15 : 1, duration: e.duration || undefined });
          break;
        }
        case 'explosion':
          a.play(e.air && e.size !== 'small' ? 'explosion_air' : EXPLOSION_SOUND[e.size] || 'explosion_medium', e);
          break;
        case 'impact': {
          const d2 = (e.x - L.x) ** 2 + (e.y - L.y) ** 2 + (e.z - L.z) ** 2;
          if (e.kind === 'metal' || e.kind === 'penetration') {
            if (d2 < 600 * 600) a.play('impact_metal', e, { volume: e.kind === 'penetration' ? 1.3 : 1 });
          } else if (e.kind === 'ricochet') {
            if (d2 < 150 * 150) a.play('ricochet', e);
          } else if (d2 < 45 * 45 && this.impactBudget > 0) {
            this.impactBudget -= 1;
            const map = { dirt: 'impact_dirt', concrete: 'impact_concrete', wood: 'impact_wood', foliage: 'impact_dirt', water: 'impact_dirt' };
            if (map[e.kind]) a.play(map[e.kind], e, { volume: 0.7 });
          }
          break;
        }
        case 'incoming':
          a.play(e.kind === 'bomb' ? 'bomb_whistle' : 'incoming_shell', e);
          break;
        case 'vehicle_destroyed':
          a.play('vehicle_destroyed', e.unit.pos);
          if (e.catastrophic) a.play('ammo_cookoff', e.unit.pos);
          break;
        case 'aircraft_hit':
          a.play('explosion_air', e.unit.pos);
          break;
        case 'aircraft_crash':
          a.play('explosion_huge', e.unit.pos);
          break;
        case 'building_collapse':
          a.play('building_collapse', e.s);
          break;
        case 'building_ruined':
          a.play('building_collapse', e.s, { volume: 0.7 });
          a.play('debris', e.s);
          break;
        case 'melee': {
          const p = e.target.pos;
          if ((p.x - L.x) ** 2 + (p.z - L.z) ** 2 < 60 * 60) a.play('impact_wood', p, { volume: 0.8 });
          break;
        }
        case 'structure_destroyed':
        case 'crush':
          a.play('debris', e.s, { volume: 0.7 });
          break;
        case 'tree_fall':
          a.play('tree_fall', e.tree);
          break;
        case 'flares':
          a.play('flare_launch', e);
          break;
        case 'smoke_launch':
          a.play('smoke_launch', e);
          break;
        case 'para_open':
          a.play('parachute_open', e.unit.pos, { volume: 0.6 });
          break;
        case 'drone_dive':
          a.play('drone_dive', e.unit.pos);
          break;
        case 'flyby':
          a.flyby(e.kind, e, e.speed);
          break;
        default:
          break;
      }
    }
    void world;
  }

  update(dt, camera, world, timeScale, paused) {
    if (!this.ready) return;
    const a = this.audio;
    const l = this.listener;
    l.position.copy(camera.position);
    camera.getWorldDirection(l.forward);
    l.up.set(0, 1, 0).applyQuaternion(camera.quaternion);
    if (dt > 0) l.velocity.subVectors(camera.position, this.lastPos).divideScalar(dt);
    if (l.velocity.lengthSq() > 250000) l.velocity.set(0, 0, 0); // camera cuts
    this.lastPos.copy(camera.position);
    a.setTimeScale(paused ? 0 : timeScale);
    a.update(dt, l);

    // Engine loops for the closest sources.
    const src = this.loops;
    src.length = 0;
    const P = l.position;
    const consider = (u, kind, intensity, range) => {
      const d2 = u.pos.distanceToSquared(P);
      if (d2 > range * range) return;
      src.push({ id: u.id, kind, position: u.pos, velocity: u.vel, intensity, d2 });
    };
    for (const u of world.units) {
      if (!u.alive || u.hidden) continue;
      const kind = LOOP_KIND[u.type];
      if (!kind) continue;
      if (u.cat === 'veh') consider(u, kind, u.engine ?? 0.5, 700);
      else if (u.cat === 'air') consider(u, kind, u.throttle ?? 0.7, u.aclass === 'jet' ? 4500 : u.aclass === 'plane' ? 3500 : u.aclass === 'drone' ? 350 : 2200);
    }
    for (const u of world.dead) {
      if (u.burning > 3 && (u.cat === 'veh' || u.cat === 'air')) consider(u, 'fire', Math.min(1, u.burning / 30), 160);
    }
    src.sort((x, y) => x.d2 - y.d2);
    if (src.length > 12) src.length = 12;
    a.setLoops(src);

    // Low passes by jets.
    for (const u of world.airUnits[0].concat(world.airUnits[1])) {
      if (u.aclass !== 'jet') continue;
      const d = u.pos.distanceTo(P);
      const last = this.flybyT.get(u.id) || -100;
      if (d < 450 && world.time - last > 8) {
        this.flybyT.set(u.id, world.time);
        a.play('jet_flyby', u.pos);
      }
    }

    // Ambience.
    let heat = 0;
    for (let i = 0; i < world.combatHeat.length; i++) heat += world.combatHeat[i];
    const cx = Math.max(0, Math.min(31, Math.floor((P.x + 1024) / 64)));
    const cz = Math.max(0, Math.min(31, Math.floor((P.z + 1024) / 64)));
    let near = 0;
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const x = cx + dx;
        const z = cz + dz;
        if (x >= 0 && z >= 0 && x < 32 && z < 32) near += world.combatHeat[z * 32 + x];
      }
    }
    const w = world.weather;
    a.setEnvironment({
      wind: Math.min(1, w.windSpeed / 14),
      rain: w.rain,
      thunderstorm: w.lightning && w.rain > 0.5,
      battleIntensity: Math.min(1, heat / 400),
      nearIntensity: Math.min(1, near / 60),
      night: w.isNight,
    });
    if (w.strike && w.strike !== this.lastStrike) {
      this.lastStrike = w.strike;
      a.thunder(Math.hypot(w.strike.x - P.x, w.strike.z - P.z));
    }
  }
}
