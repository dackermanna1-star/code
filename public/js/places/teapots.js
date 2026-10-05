// "Dodge The Teapots of Doom!" by clockwork (place 44814, uploaded 12/15/2007).
//
// Verified (docs/RESEARCH.md, Games): a large gray platform with splits and
// raised walls/bricks to hide behind; giant teapots (a Utah teapot mesh) spawn
// and bounce around and kill on touch; where there is no visible ground you
// die; reaching the end sends you to a yellow platform above everything and
// makes the teapots harder; if nobody makes it for a while they get easier.
//
// Reconstructed (the original map file is not available): the exact layout,
// teapot sizes, colours, spawn rate, the level numbers and message wording.
import * as THREE from 'three';
import * as CANNON from '../vendor/cannon-es.js';
import { TeapotGeometry } from '../vendor/TeapotGeometry.js';
import { BotBrain, pick } from '../engine/Bots.js';
import { sounds } from '../engine/Sound.js';
import { brickColor } from '../engine/BrickColor.js';
import { spawnLocation } from './common.js';

const GRAY = 194, DARK = 199;
const FLOOR_Y = 0; // top of the course
const VIEW = new THREE.Vector3(0, 120, 0); // the yellow platform
const TEAPOT_COLORS = [1, 21, 23, 24, 28, 37, 45, 104, 105, 106, 119, 9, 11, 102, 26, 5];

// Floor slabs [x0, x1, z0, z1]. The course runs from +Z (start) to -Z (finish).
const SLABS = [
  [-30, 30, 100, 150], // start
  [-30, -3, 55, 95], [3, 30, 55, 95], // split lanes
  [-30, 30, 10, 50],
  [-30, -12, -30, 5], [-8, 8, -30, 5], [12, 30, -30, 5], // three lanes
  [-30, 30, -85, -35],
  [-6, 6, -125, -90], [-26, -14, -118, -96], [14, 26, -118, -96], // narrow bridge and side ledges
];
// Gaps that look empty but have invisible deadly ground in them.
const FALSE_GROUND = [
  [-30, 30, 95, 100], [-3, 3, 55, 95], [-30, 30, 50, 55], [-30, 30, 5, 10],
  [-12, -8, -30, 5], [8, 12, -30, 5], [-30, 30, -35, -30], [-30, 30, -90, -85],
];
// Walls and blocks to hide behind: [x, z, sx, sy, sz, color]
const COVER = [
  [-18, 30, 24, 7, 1.2, DARK], [16, 22, 6, 6, 6, GRAY], [22, 40, 8, 4, 2, DARK], [-6, 15, 2, 5, 10, GRAY],
  [-20, 75, 2, 6, 14, DARK], [18, 70, 8, 8, 2, GRAY], [10, 85, 4, 4, 4, DARK],
  [-21, -10, 4, 6, 8, DARK], [0, -18, 6, 3, 2, GRAY], [21, -5, 4, 8, 4, GRAY],
  [-15, -45, 16, 7, 1.2, DARK], [12, -55, 1.2, 7, 16, DARK], [-4, -70, 8, 5, 8, GRAY], [22, -78, 6, 3, 6, GRAY], [-24, -66, 4, 9, 4, DARK],
];

let state = null;

function teapotGeometry() {
  if (teapotGeometry.g) return teapotGeometry.g;
  const g = new TeapotGeometry(1, 6, true, true, true, false, true);
  g.computeBoundingBox();
  const c = g.boundingBox.getCenter(new THREE.Vector3());
  g.translate(-c.x, -c.y, -c.z);
  g.computeBoundingBox();
  teapotGeometry.g = g;
  return g;
}

function buildCourse(world) {
  // a plain gray course floating over nothing
  for (const [x0, x1, z0, z1] of SLABS) world.brick([x1 - x0, 1.2, z1 - z0], [(x0 + x1) / 2, FLOOR_Y - 0.6, (z0 + z1) / 2], GRAY);
  for (const [x, z, sx, sy, sz, c] of COVER) world.brick([sx, sy, sz], [x, FLOOR_Y + sy / 2, z], c);
  // the end: a red pad
  world.brick([30, 1.2, 15], [0, FLOOR_Y - 0.6, -132.5], 21);
  // the yellow viewing platform high above the middle
  world.brick([40, 2, 40], [VIEW.x, VIEW.y - 1, VIEW.z], 24);
  for (const [x, z, sx, sz] of [[0, -20, 40, 1], [0, 20, 40, 1], [-20, 0, 1, 40], [20, 0, 1, 40]]) world.brick([sx, 1.2, sz], [VIEW.x + x, VIEW.y + 0.6, VIEW.z + z], 24);
}

export default {
  build(world, ctx = {}) {
    buildCourse(world);
    const parts = { falseGround: [], finish: null, spawns: [] };
    for (const [x0, x1, z0, z1] of FALSE_GROUND) {
      // invisible ground you can stand on...
      world.add({ size: [x1 - x0, 1.2, z1 - z0], position: [(x0 + x1) / 2, FLOOR_Y - 0.6, (z0 + z1) / 2], transparency: 1, color: GRAY, tags: ['deadly'] });
      // ...that kills you once you are really standing on it (kept clear of the
      // visible edges, so jumping off an edge is safe)
      const inset = 1.2;
      parts.falseGround.push(world.add({ size: [Math.max(0.4, x1 - x0 - inset * 2), 0.6, Math.max(0.4, z1 - z0 - inset * 2)], position: [(x0 + x1) / 2, FLOOR_Y + 0.3, (z0 + z1) / 2], transparency: 1, canCollide: false }));
    }
    parts.finish = world.add({ size: [30, 2, 15], position: [0, FLOOR_Y + 1, -132.5], transparency: 1, canCollide: false });
    for (const x of [-12, 0, 12]) parts.spawns.push(spawnLocation(world, x, FLOOR_Y + 0.01, 128, { yaw: 0 }));
    // an invisible floor far below so falling off doesn't take forever
    parts.abyss = world.add({ size: [600, 2, 600], position: [0, -60, 0], transparency: 1, canCollide: false });
    state = { parts, level: 1, teapots: [], spawnTimer: 2, sinceFinish: 0 };
    if (ctx.thumbnail) {
      // a few teapots in the air for the picture
      for (const [x, y, z, s, c] of [[-8, 14, 30, 9, 21], [14, 8, 60, 8, 23], [-16, 22, 80, 10, 24], [6, 30, 5, 9, 28]]) {
        const bc = brickColor(c);
        const m = new THREE.Mesh(teapotGeometry(), new THREE.MeshPhongMaterial({ color: new THREE.Color().setRGB(bc.r, bc.g, bc.b, THREE.SRGBColorSpace), shininess: 60 }));
        m.scale.setScalar(s / 2); m.position.set(x, y, z); m.rotation.set(0.3, x, 0.2);
        world.scene.add(m);
      }
    }
    return { thumbnail: { cam: [24, 26, 150], look: [-2, 2, 40] } };
  },

  setup(game) {
    const { world } = game;
    const s = state;
    game.setStats([]);
    for (const sp of s.parts.spawns) game.addSpawn(sp);
    // Teapots bounce: give them their own contact material.
    s.teapotMat = new CANNON.Material('teapot');
    world.physics.addContactMaterial(new CANNON.ContactMaterial(s.teapotMat, world.defaultPhysMaterial, { friction: 0.3, restitution: 0.65 }));
    world.physics.addContactMaterial(new CANNON.ContactMaterial(s.teapotMat, s.teapotMat, { friction: 0.3, restitution: 0.7 }));

    const killer = (other) => { if (other.alive && other.player) other.breakJoints(); };
    for (const p of s.parts.falseGround) p.onTouched(killer);
    s.parts.abyss.onTouched(killer);
    s.parts.finish.onTouched((ch) => {
      if (!ch.alive || !ch.player || ch.finished) return;
      ch.finished = true;
      // off to the yellow platform to watch everyone else get pwned
      ch.body.position.set(VIEW.x + (Math.random() - 0.5) * 20, VIEW.y + 3.2, VIEW.z + (Math.random() - 0.5) * 20);
      ch.body.velocity.set(0, 0, 0);
      s.level++;
      s.sinceFinish = 0;
      game.showMessage(`${ch.player.name} has made it to the end! The teapots are now level ${s.level}!`, 4);
      sounds.play('victory', null, 0.6);
      updateHint(game);
    });
    game.on('playerAdded', (p) => {
      if (p.isBot) p.brain = new TeapotBrain(game, p);
    });
    updateHint(game);
  },

  update(game, dt) {
    const s = state;
    if (!s.teapotMat) return;
    s.sinceFinish += dt;
    if (s.sinceFinish > 150 && s.level > 1) {
      s.sinceFinish = 0;
      s.level--;
      game.showMessage(`Nobody made it to the end. The teapots are now level ${s.level}.`, 4);
      updateHint(game);
    }
    s.spawnTimer -= dt;
    if (s.spawnTimer <= 0) {
      s.spawnTimer = Math.max(0.35, 2.6 / (0.6 + s.level * 0.4)) * (0.6 + Math.random() * 0.8);
      if (s.teapots.length < 18 + s.level * 2) spawnTeapot(game, s);
    }
    for (let i = s.teapots.length - 1; i >= 0; i--) {
      const t = s.teapots[i];
      t.life -= dt;
      if (t.life <= 0 || t.part.position.y < -50) {
        game.world.remove(t.part);
        s.teapots.splice(i, 1);
      }
    }
  },
};

function updateHint(game) { game.setHint(`Teapot Level: ${state.level}`); }

function spawnTeapot(game, s) {
  const world = game.world;
  const size = Math.min(24, 7 + s.level * 1.4 + Math.random() * 5);
  const geo = teapotGeometry();
  const bb = geo.boundingBox;
  const dims = [(bb.max.x - bb.min.x) * size / 2, (bb.max.y - bb.min.y) * size / 2, (bb.max.z - bb.min.z) * size / 2];
  const x = (Math.random() - 0.5) * 60, z = -130 + Math.random() * 240;
  const part = world.add({
    name: 'Teapot', shape: 'Mesh', geometry: geo, size: dims, position: [x, 70 + Math.random() * 60, z],
    color: pick(TEAPOT_COLORS), anchored: false, physicsShape: new CANNON.Sphere(Math.min(dims[0], dims[1], dims[2]) * 0.55),
    mass: size * size * 2,
  });
  part.mesh.scale.setScalar(size / 2);
  part.body.material = s.teapotMat;
  part.body.allowSleep = false;
  const push = 4 + s.level * 3;
  part.body.velocity.set((Math.random() - 0.5) * push, -10, (Math.random() - 0.5) * push);
  part.body.angularVelocity.set((Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3);
  part.onTouched((other) => { if (other.alive && other.player) other.breakJoints(); });
  s.teapots.push({ part, life: 14 + Math.random() * 6 });
}

// Simulated players: run the course lane by lane, jump the splits, and try
// (not always successfully) to get out from under falling teapots.
const ROUTE = [
  [-12, 104], [-14, 90], [-14, 58], [-6, 45], [0, 30], [0, 14], [0, -2], [0, -25], [0, -42], [4, -60], [2, -80], [0, -95], [0, -120], [0, -132],
];
class TeapotBrain extends BotBrain {
  constructor(game, player) {
    super(game, player, { chattiness: 0.6 });
    this.allowGapJumps = true;
    this.step = 0;
    this.dodge = 0;
    this.dodgeDir = new THREE.Vector3();
    this.nerve = 0.4 + Math.random() * 0.6;
    this.arriveRadius = 2.5;
  }
  idleChat() {
    if (Math.random() < 0.5) this.say(pick(['omg teapots', 'RUN', 'lol i almost died', 'this is so hard', 'teapot lvl is so high', 'i made it last time', 'noooo', 'haha']));
  }
  think() {
    const ch = this.ch;
    const p = ch.rootPosition;
    if (p.y > VIEW.y - 10) { // watching from the yellow platform
      this.target = Math.random() < 0.3 ? new THREE.Vector3(VIEW.x + (Math.random() - 0.5) * 30, p.y, VIEW.z + (Math.random() - 0.5) * 30) : null;
      return;
    }
    // where on the route are we?
    if (this.step === 0 || !this.target) {
      let best = 0, bd = Infinity;
      ROUTE.forEach(([x, z], i) => { const d = Math.hypot(p.x - x, p.z - z); if (d < bd) { bd = d; best = i; } });
      this.step = Math.min(ROUTE.length - 1, best + 1);
    }
    if (this.reached() && this.step < ROUTE.length - 1) this.step++;
    const [x, z] = ROUTE[this.step];
    this.target = new THREE.Vector3(x + (Math.random() - 0.5) * 3, p.y, z);
    // a teapot coming down nearby? get out of the way (sometimes)
    for (const t of state.teapots) {
      const tp = t.part.position;
      const dx = p.x - tp.x, dz = p.z - tp.z;
      if (Math.hypot(dx, dz) < 12 && tp.y - p.y < 40 && Math.random() < this.nerve) {
        this.dodge = 0.7;
        this.dodgeDir.set(dx, 0, dz).normalize();
        break;
      }
    }
  }
  steer(dt) {
    if (this.dodge > 0) {
      this.dodge -= dt;
      const ch = this.ch;
      ch.input.move.copy(this.dodgeDir);
      ch.input.jump = false;
      return;
    }
    super.steer(dt);
  }
}
