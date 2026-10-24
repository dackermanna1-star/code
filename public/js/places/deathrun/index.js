// "DEATHRUN: Curse of the Pharaoh". Explorers have found the lost tomb of
// Khamun-Ra. Each round the curse takes one of them - the PHARAOH - who
// walks the hidden galleries above the halls and fires the tomb's traps
// with golden scarab buttons. Everyone else RUNS: eight halls, from the
// colossi at the Nile Gate down through the temple, the tombs and the
// underworld, and up the inside of the pyramid to the Eye of Ra. When the
// first runner reaches it, the Eye opens: fifteen seconds later the sun
// burns the curse away and the runners win. If nobody makes it, the
// Pharaoh wins.
// (A user-made place in the style of the deathruns that came after 2008;
// it uses its own GUI, lighting and effects.)
import * as THREE from 'three';
import { GROUP } from '../../engine/Part.js';
import { sounds } from '../../engine/Sound.js';
import { HATS } from '../../engine/hats.js';
import { buildCourse, updateWater, waterMaterials } from './course.js';
import { Flames, LightPool, allMaterials, V, clamp, lerp, rnd, pick, special } from './kit.js';
import { Particles, Motes, lightShaft } from './fx.js';
import { Post } from './post.js';
import { Gui } from './gui.js';
import { DRBot } from './bots.js';
import * as A from './audio.js';
import * as PNT from './paint.js';

const ROUND = 300, INTERMISSION = 14, INTRO = 6, EYE = 15, END = 8;
const S = { phase: 'boot', T: 0, round: 0, pharaoh: null, eyeAt: null };
export { S };

// the sun: low in the west over the Nile
const SUN = new THREE.Vector3(-0.78, 0.36, 0.5).normalize();

const LOOKS = {
  camp: { sky: 0xffe2bc, ground: 0x8a6a48, amb: 0.85, sun: 0xffc48a, sunI: 3.4, fog: 0xe9b98c, near: 400, far: 3200, exp: 1.0, bloom: 0.2, motes: [0xffe0a0, 0], wind: 0.35 },
  day: { sky: 0xffe2bc, ground: 0x8a6a48, amb: 0.85, sun: 0xffc48a, sunI: 3.4, fog: 0xe9b98c, near: 400, far: 3200, exp: 1.0, bloom: 0.2, motes: [0xffe0a0, 0.1], wind: 0.3 },
  temple: { sky: 0xffd2a0, ground: 0x6a4e34, amb: 0.42, sun: 0xffc48a, sunI: 3.0, fog: 0x4a3420, near: 90, far: 520, exp: 1.2, bloom: 0.28, motes: [0xffdc9a, 0.55], wind: 0.08 },
  lake: { sky: 0xffe2bc, ground: 0x7a6a4a, amb: 0.8, sun: 0xffc48a, sunI: 3.3, fog: 0xe0b48a, near: 300, far: 2400, exp: 1.0, bloom: 0.22, motes: [0xffe0a0, 0.15], wind: 0.25 },
  tomb: { sky: 0x8a90b8, ground: 0x2a2018, amb: 0.2, sun: 0xffc48a, sunI: 0.0, fog: 0x140c06, near: 40, far: 300, exp: 1.35, bloom: 0.34, motes: [0xffb070, 0.4], wind: 0 },
  judgement: { sky: 0x70b090, ground: 0x182018, amb: 0.22, sun: 0x000000, sunI: 0, fog: 0x08140e, near: 50, far: 320, exp: 1.35, bloom: 0.36, motes: [0x9affb0, 0.35], wind: 0 },
  duat: { sky: 0xff8050, ground: 0x501410, amb: 0.34, sun: 0x000000, sunI: 0, fog: 0x2a0a06, near: 60, far: 460, exp: 1.2, bloom: 0.42, motes: [0xff9050, 0.6], wind: 0.05 },
  ascent: { sky: 0xffd8a0, ground: 0x302418, amb: 0.3, sun: 0x000000, sunI: 0, fog: 0x1c140a, near: 50, far: 340, exp: 1.3, bloom: 0.34, motes: [0xffe0a0, 0.45], wind: 0 },
};

// --- the Pharaoh's headdress (a nemes: gold and lapis stripes, the cobra on the brow) ---------------------------------------------------------
HATS.PharaohNemes = () => {
  const c = document.createElement('canvas'); c.width = 64; c.height = 64;
  const x = c.getContext('2d'); for (let i = 0; i < 8; i++) { x.fillStyle = i % 2 ? '#1f4c9c' : '#e8b83a'; x.fillRect(0, i * 8, 64, 8); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const striped = new THREE.MeshPhongMaterial({ map: t, shininess: 60, specular: 0x886622 });
  const gold = new THREE.MeshPhongMaterial({ color: 0xe8b83a, shininess: 80, specular: 0xaa8833 });
  const g = new THREE.Group();
  const top = new THREE.Mesh(new THREE.BoxGeometry(1.36, 0.36, 1.36), striped); top.position.set(0, 0.6, 0.02); g.add(top);
  for (const s of [-1, 1]) {
    const side = new THREE.Mesh(new THREE.BoxGeometry(0.26, 1.1, 1.2), striped); side.position.set(s * 0.68, 0.1, 0.06); g.add(side);
    const lap = new THREE.Mesh(new THREE.BoxGeometry(0.42, 1.25, 0.22), striped); lap.position.set(s * 0.58, -0.75, -0.42); g.add(lap);
  }
  const back = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.4, 0.25), striped); back.position.set(0, -0.35, 0.66); g.add(back);
  const band = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.12, 1.4), gold); band.position.set(0, 0.42, 0.02); g.add(band);
  const cobra = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.11, 0.42, 8), gold); cobra.position.set(0, 0.66, -0.72); g.add(cobra);
  const hood = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6).scale(1, 1.3, 0.5), gold); hood.position.set(0, 0.92, -0.72); g.add(hood);
  return g;
};
function pharaohLook(app) {
  return { ...(app || {}), colors: { ...(app?.colors || {}), torso: 24, leftLeg: 1, rightLeg: 1 }, hats: ['PharaohNemes'], shirt: null, pants: null, tshirt: null, face: app?.face || 'Smile' };
}

// --- death notices ----------------------------------------------------------------------------------------------------------------------------------
const CAUSE = {
  nile: 'was eaten by the crocodiles of the Nile', causeway: 'fell with the Collapsing Causeway', obelisk: 'was flattened by the Toppling Obelisk', geyser: 'was blasted by a Sand Geyser',
  boulder: 'was rolled flat by the Boulder', flame: 'was roasted by the Sphinx Flames', sands: 'was swallowed by the Sinking Sands',
  crush: 'was crushed by the Falling Ceiling', blade: 'was cut down by a Khopesh Pendulum', spears: 'was skewered by the Spear Wall',
  lotus: 'sank with the Lotus Pads', sobek: 'was devoured by Sobek', flood: 'drowned in the Flood of the Nile',
  spikes: 'fell onto the spikes', scarab: 'was eaten by the Scarab Swarm', mummy: 'was caught by a Mummy',
  sweep: 'was swept away by Anubis', ammit: 'was fed to Ammit', walls: 'was crushed by the Closing Walls',
  lava: 'fell into the Lake of Fire', fire: 'was burned by the Fire Pillars', bridge: 'fell with the Bridge of Ash', serpent: 'was devoured by Apophis',
  slide: 'slid into the spikes of the Grand Gallery', sunbeam: 'was burned by the Sunbeams of Ra', capstone: 'fell with the Capstones', fell: 'fell to their death',
};
const SHORT = { nile: 'Eaten by crocodiles!', fell: 'You fell!', mummy: 'A mummy got you!', sobek: 'Sobek ate you!', serpent: 'Apophis ate you!' };

export default {
  thumbnailImage: null,

  build(world, ctx = {}) {
    world.useStaticGrid?.(24);
    const FX = {
      flames: new Flames(world.scene),
      lights: new LightPool(world.scene, 8),
      dust: new Particles(world.scene, 1200, false),
      glow: new Particles(world.scene, 700, true),
    };
    S.world = world; S.FX = FX;
    S.course = buildCourse(world, FX);
    // the sky at the golden hour
    const az = Math.atan2(SUN.z, -SUN.x) - Math.PI, el = Math.asin(SUN.y);
    const skyTex = PNT.tex(PNT.skyCanvas(az, el), { aniso: 1 });
    skyTex.wrapS = THREE.RepeatWrapping;
    world.setSky(skyTex);
    S.skyTex = skyTex;
    void ctx;
    return { thumbnail: { cam: [60, 46, 70], look: [-10, 26, -30] } };
  },

  setup(game) {
    const world = game.world, C = S.course;
    Object.assign(S, { game, gui: new Gui(game.gui.root), phase: 'lobby', T: INTERMISSION, round: 0, pharaoh: null, look: { ...LOOKS.camp }, lookId: 'camp', specIdx: 0, volunteer: false, eyeBeam: null, cine: null });
    game.gui.root.classList.add('dr-mode');
    // the look: HDR with bloom, soft shadows that follow the action
    const r = world.renderer;
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    S.post = new Post(world);
    world.sun.shadow.mapSize.set(2048, 2048); world.sun.shadow.bias = -0.0012; world.sun.shadow.normalBias = 0.3;
    const sc = world.sun.shadow.camera; sc.left = -120; sc.right = 120; sc.top = 120; sc.bottom = -120; sc.near = 1; sc.far = 900; sc.updateProjectionMatrix();
    world.sun.shadow.map?.dispose(); world.sun.shadow.map = null;
    world.fill.intensity = 0;
    S.post.onBeforeRender = (focus) => {
      const f = focus || world.camera.position;
      if (world.skyMesh) world.skyMesh.position.copy(world.camera.position);
      world.sun.target.position.set(Math.round(f.x / 4) * 4, Math.round(f.y / 4) * 4, Math.round(f.z / 4) * 4);
      world.sun.position.copy(world.sun.target.position).addScaledVector(SUN, 400);
      world.sun.target.updateMatrixWorld();
    };
    world.scene.fog = new THREE.Fog(LOOKS.camp.fog, LOOKS.camp.near, LOOKS.camp.far);
    // the sky in the shiny things
    try {
      const pm = new THREE.PMREMGenerator(r);
      const env = pm.fromEquirectangular(S.skyTex).texture; pm.dispose();
      for (const m of allMaterials()) if (m.metalness > 0.5 || m.name === 'basalt' || m.name === 'granite') { m.envMap = env; m.envMapIntensity = m.metalness > 0.5 ? 0.9 : 0.35; m.needsUpdate = true; }
      for (const m of waterMaterials()) { m.envMap = env; m.envMapIntensity = 1; m.needsUpdate = true; }
    } catch (e) { console.warn('[deathrun] env', e); }
    S.motes = new Motes(world.scene, 420);
    game.resize(window.innerWidth, window.innerHeight);
    window.addEventListener('resize', () => S.post.resize());
    S.post.resize();
    S.post.fadeIn(1.5);

    // the rules
    game.respawnTime = null; game.forceFieldTime = 0;
    game.setStats(['Gold', 'Wins']);
    game.labelRange = 90;
    const campSpawns = C.spawns.filter((s) => s.camp);
    game.pickSpawn = (p) => p.spawnOverride || (() => { const s = pick(campSpawns); return { position: s.pos.clone().add(V(rnd(-2, 2), 0, rnd(-2, 2))), yaw: s.yaw }; })();
    game.on('playerAdded', (p) => {
      p.dr = { role: 'camp', alive: false, escaped: false, gold: 0, lastPharaoh: -99, deaths: 0 };
      p.stats.Gold = 0; p.stats.Wins = 0;
      if (p.isBot) p.brain = new DRBot(game, p, S);
    });
    game.on('spawned', (p, ch) => {
      ch.ragdoll = true;
      ch.walkSpeed = p.dr?.role === 'pharaoh' ? 26 : 16;
      ch.body.collisionFilterMask = GROUP.WORLD | GROUP.DYNAMIC; // runners don't push each other off
      if (p.isLocal) { game.camera.subject = ch; S.gui.deadShow(null); }
    });
    game.on('died', (p) => {
      const d = p.dr; if (!d) return;
      const cause = p.character?.lastCause || 'fell';
      if (d.role === 'runner' && d.alive && !d.escaped) {
        d.alive = false;
        const msg = CAUSE[cause] || CAUSE.fell;
        S.gui.feed(`<b>${p.name}</b> ${msg}`);
        p.brain?.onDied?.(cause);
        if (p.isLocal) S.gui.deadShow((SHORT[cause] || 'You died!') + '  Watch the others...');
        const ph = S.pharaoh;
        if (ph && ph.dr.role === 'pharaoh' && cause !== 'fell') { ph.stats.Gold += 2; ph.dr.gold += 2; ph.brain?.onKill?.(); }
        game.gui?.onPlayersChanged();
      }
    });
    game.on('chatted', () => {});

    // keys: E fires the nearest trap (the Pharaoh) or watches the next runner (the dead), Q the previous; P volunteers
    window.addEventListener('keydown', (e) => {
      if (game.gui?.chatFocused || e.repeat) return;
      const k = e.key.toLowerCase(), me = game.localPlayer;
      if (!me?.dr) return;
      if (k === 'e' && me.dr.role === 'pharaoh' && me.character?.alive && S.near) { fireTrap(S.near, me); return; }
      if ((k === 'e' || k === 'q') && spectating(me)) { S.specIdx += k === 'e' ? 1 : -1; return; }
      if (k === 'p') { S.volunteer = !S.volunteer; A.tone(S.volunteer ? 880 : 440, 0.15, { type: 'triangle', vol: 0.2 }); }
    });

    // the camera: never through walls
    const cam = game.camera, camUpdate = cam.update.bind(cam);
    cam.distance = 17;
    S.shakeA = 0;
    C.shake = (pos, k) => { const a = k * clamp(1 - pos.distanceTo(world.camera.position) / 140, 0, 1); if (a > S.shakeA) S.shakeA = a; };
    cam.update = (dt) => {
      if (S.cine) { S.cine(dt); return; }
      camUpdate(dt);
      const c = world.camera;
      if (S.shakeA > 0.01) { c.position.add(V(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)).multiplyScalar(S.shakeA * 0.7)); S.shakeA = Math.max(0, S.shakeA - dt * 1.8); }
      if (!cam.fixed && !cam.firstPerson) {
        const f = cam.focus, dir = c.position.clone().sub(f), L = dir.length();
        if (L > 0.5) {
          dir.divideScalar(L);
          const hit = world.raycast(f, c.position.clone().addScaledVector(dir, 0.8), { mask: GROUP.WORLD });
          if (hit && hit.distance < L + 0.8) c.position.copy(f).addScaledVector(dir, Math.max(1.5, hit.distance - 0.8));
        }
      }
    };

    // the world's moving things
    world.onUpdate((dt, t) => {
      for (const T of C.traps) T.update(t, dt);
      for (const f of C.updaters) f(t, dt);
      updateWater(t);
      for (const m of C.lavas) { const sc = m.material.userData.scroll; if (sc) for (const tx of sc) tx.offset.set(t * 0.004, t * 0.007); }
      for (const p of C.portals) p.sheet.material.uniforms.t.value = t;
    });

    // helpers for the bots and the GUI
    S.hallAt = (p) => hallAt(p);
    S.trapsNear = (p) => { const h = hallAt(p); return C.traps.filter((T) => Math.abs(T.sec - h) <= 1); };
    S.runners = () => game.players.filter((q) => q.dr?.role === 'runner' && q.dr.alive && !q.dr.escaped && q.character?.alive);
    S.runnersIn = (T, except) => S.runners().filter((q) => q.character !== except && T.inZone(q.character.rootPosition)).length;
    S.runnersComing = (T, d) => S.runners().filter((q) => { const z = q.character.rootPosition.z - T.zoneW.z1; return z > 0 && z < d && Math.abs(hallAt(q.character.rootPosition) - T.sec) <= 1; }).length;
    S.pharaohChar = () => (S.pharaoh?.dr.role === 'pharaoh' && S.pharaoh.character?.alive ? S.pharaoh.character : null);
    S.timeLeft = () => (S.phase === 'run' ? S.T : 99);
    S.pharaohTarget = () => pharaohTarget();
    S.fireTrap = (T, by) => fireTrap(T, by);
    S.route = C.halls.flatMap((h) => h.route);
    S.finishAt = C.finish ? new THREE.Vector3((C.finish.x0 + C.finish.x1) / 2, C.finish.y0, (C.finish.z0 + C.finish.z1) / 2) : null;

    window.__dr = { S, C, look: (ex, ey, ez, tx, ty, tz) => { game.camera.fixed = { position: V(ex, ey, ez), lookAt: V(tx, ty, tz) }; return 1; }, free: () => { game.camera.fixed = null; return 1; }, start: () => { S.T = 0; }, set: (ph) => { S.phase = ph; S.T = 0.01; }, kill: (n) => kill(n.character, 'fell'), fire: (i) => fireTrap(C.traps[i], game.localPlayer), traps: () => C.traps.map((t) => [t.index, t.id, t.state, t.sec]) };
    A.playSong('camp', 0.3);
  },

  update(game, dt) {
    if (!S.gui) return;
    const world = game.world, C = S.course, t = world.time;
    S.T -= dt;
    roundLogic(game, dt);
    // kills
    if (S.phase === 'run' || S.phase === 'eye') {
      for (const p of game.players) {
        const d = p.dr, ch = p.character;
        if (!d || d.role !== 'runner' || !d.alive || d.escaped || !ch?.alive) continue;
        const pos = ch.rootPosition, h = hallAt(pos);
        let cause = null;
        for (const T of C.traps) { if (Math.abs(T.sec - h) > 1) continue; cause = T.check(pos, ch); if (cause) { T.kills++; break; } }
        if (!cause) for (const pt of C.pits) { if (Math.abs(pt.sec - h) > 1) continue; cause = pt.fn(_l.set(pos.x - pt.O.x, pos.y - pt.O.y, pos.z - pt.O.z), pos.y - 3); if (cause) break; }
        if (cause) kill(ch, cause);
        // made it to the Eye of Ra
        const F = C.finish;
        if (F && pos.x > F.x0 && pos.x < F.x1 && pos.z > F.z0 && pos.z < F.z1 && pos.y - 3 > F.y0 - 2 && pos.y - 3 < F.y0 + 12) escape(game, p);
      }
      // the Pharaoh's portals
      const ph = S.pharaohChar();
      if (ph && (S.portalT = (S.portalT || 0) - dt) <= 0) for (const q of C.portals) {
        if (q.at.distanceTo(_l.set(ph.rootPosition.x, ph.rootPosition.y - 3, ph.rootPosition.z)) > 3.6) continue;
        const to = C.halls[q.hall + q.dir];
        if (!to) continue;
        const dest = q.dir > 0 ? to.galleryStart : to.galleryEnd;
        ph.body.position.set(dest.x, dest.y + 3.2, dest.z); ph.body.velocity.set(0, 0, 0); ph.root.position.copy(ph.body.position);
        ph.facing = q.dir > 0 ? 0 : Math.PI;
        if (S.pharaoh.isLocal) { game.camera.focus.copy(ph.body.position); game.camera.yaw = ph.facing; }
        S.FX.glow.puff(dest.clone().add(V(0, 3, 0)), 0x80d0ff, 30, 1.6, 10, 1);
        A.tone(660, 0.4, { type: 'sine', to: 1320, vol: 0.12 });
        S.portalT = 1.2;
        break;
      }
    }
    // the Pharaoh's button prompt
    const me = game.localPlayer;
    S.near = null;
    if (me?.dr?.role === 'pharaoh' && me.character?.alive && (S.phase === 'run' || S.phase === 'eye')) {
      let bd = 7.5;
      for (const T of C.traps) { if (T.used || !T.buttonPos) continue; const d = T.buttonPos.distanceTo(_l.set(me.character.rootPosition.x, me.character.rootPosition.y - 3, me.character.rootPosition.z)); if (d < bd) { bd = d; S.near = T; } }
    }
    S.gui.promptShow(S.near ? `<kbd>E</kbd> Unleash: <b class="gold">${S.near.name}</b>` : null);
    // the camera: the living, or whoever you're watching
    spectate(game);
    lookAndFeel(game, dt);
    S.FX.flames.update(dt, world.camera.position);
    S.FX.lights.update(dt, world.camera.position);
    S.FX.dust.update(dt); S.FX.glow.update(dt);
    hud(game);
  },

  onExit(game, close) { A.stopAll(); close(); },
};
const _l = new THREE.Vector3();

// --- where things are ----------------------------------------------------------------------------------------------------------------------------
function hallAt(p) {
  const H = S.course.halls;
  if (p.z > 4) return -1;
  for (const h of H) if (p.z <= h.O.z + 4 && p.z > h.O.z - h.L - 1) return h.i;
  return H.length - 1;
}
/** Which trap should the Pharaoh go for next? The one the runners will reach first (or are in). */
function pharaohTarget() {
  const runners = S.runners();
  let best = null, bs = -1e9;
  for (const T of S.course.traps) {
    if (T.used) continue;
    let score = -1e9;
    for (const q of runners) {
      const p = q.character.rootPosition;
      if (T.inZone(p)) { score = Math.max(score, 100); continue; }
      const ahead = p.z - T.zoneW.z1;
      if (ahead > 0 && ahead < 320 && Math.abs(hallAt(p) - T.sec) <= 1) score = Math.max(score, 60 - ahead * 0.2);
    }
    if (score > bs) { bs = score; best = T; }
  }
  return bs > -1e8 ? best : null;
}

// --- the round ----------------------------------------------------------------------------------------------------------------------------------------
function roundLogic(game, dt) {
  const C = S.course, players = game.players;
  if (S.phase === 'lobby') {
    if (players.length < 2) { S.T = Math.max(S.T, 5); }
    if (S.T <= 0) startRound(game);
  } else if (S.phase === 'intro') {
    const n = Math.ceil(S.T);
    if (n !== S.lastTick && n <= 3 && n >= 1) { S.lastTick = n; A.tick(false); S.gui.bannerShow(String(n), '', '', 0.9); }
    if (S.T <= 0) {
      S.phase = 'run'; S.T = ROUND; S.lastTick = null;
      A.tick(true); A.gates(C.halls[0].gate.leaves[0].m.pos);
      S.gateK = 0;
      S.gui.bannerShow('RUN!', 'The gates are open', '', 1.6);
      A.playSong('run', 0.28);
    }
  } else if (S.phase === 'run' || S.phase === 'eye') {
    if (S.gateK != null && S.gateK < 1) { S.gateK = Math.min(1, S.gateK + dt / 2.4); C.halls[0].gate.set(S.gateK); }
    const runners = players.filter((q) => q.dr?.role === 'runner');
    const alive = runners.filter((q) => q.dr.alive && !q.dr.escaped).length, escaped = runners.filter((q) => q.dr.escaped).length;
    if (S.phase === 'run') {
      if (alive === 0 && escaped === 0) return endRound(game, 'pharaoh');
      if (alive === 0 && escaped > 0 && !S.eyeAt) { S.phase = 'eye'; S.T = 3; }
      if (S.T <= 0) return escaped > 0 ? eyeOfRa(game) : endRound(game, 'pharaoh', 'time');
    } else if (S.T <= 0) eyeOfRa(game);
  } else if (S.phase === 'end') {
    if (S.T <= 0) toCamp(game);
  }
}

function startRound(game) {
  const C = S.course, players = game.players.filter((q) => q.dr);
  S.round++;
  // the Pharaoh: a volunteer, or whoever hasn't been for longest
  const me = game.localPlayer;
  let ph;
  if (S.volunteer && me?.dr && S.round - me.dr.lastPharaoh > 1) ph = me;
  else {
    const pool = players.filter((q) => S.round - q.dr.lastPharaoh > 2);
    ph = pick(pool.length ? pool : players);
  }
  S.volunteer = false;
  S.pharaoh = ph; ph.dr.lastPharaoh = S.round;
  for (const T of C.traps) T.reset();
  C.halls[0].gate.set(0); S.gateK = null; S.eyeAt = null;
  if (S.eyeBeam) { S.world.scene.remove(S.eyeBeam); S.eyeBeam = null; }
  const yard = C.spawns.filter((s) => s.hall === 0);
  let i = 0;
  for (const q of players) {
    q.dr.role = q === ph ? 'pharaoh' : 'runner'; q.dr.alive = true; q.dr.escaped = false;
    if (q === ph) {
      const g = C.halls[0].galleryStart;
      q.spawnOverride = { position: g.clone().add(V(0, 0.2, 4)), yaw: 0 };
      q.appearanceOverride = pharaohLook(q.appearance);
    } else {
      const s = yard[i++ % yard.length];
      q.spawnOverride = { position: s.pos.clone().add(V(rnd(-1, 1), 0, rnd(-1, 1))), yaw: 0 };
      q.appearanceOverride = null;
    }
    game.spawnPlayer(q);
    q.spawnOverride = null;
    q.brain?.onRound?.(q.dr.role);
  }
  S.phase = 'intro'; S.T = INTRO; S.lastTick = null;
  S.gui.results(null);
  if (me?.dr.role === 'pharaoh') S.gui.bannerShow('You are the Pharaoh', `Round ${S.round}`, 'Walk your galleries above the halls. Stand by a golden scarab and press <b>E</b> to unleash its trap.', 5);
  else S.gui.bannerShow('Run', `Round ${S.round}`, `<b class="gold">${ph.name}</b> is the Pharaoh. Reach the Eye of Ra at the top of the pyramid!`, 5);
  game.systemChat(`Round ${S.round}: ${ph.name} has been taken by the curse of the Pharaoh!`);
  A.gong(null, 0.6);
  A.stopSong();
  game.gui?.onPlayersChanged();
}

function kill(ch, cause) {
  if (!ch?.alive) return;
  ch.lastCause = cause;
  S.FX.dust.puff(ch.rootPosition.clone(), 0xc9a878, 10, 2.2, 6, 1.2);
  ch.breakJoints();
}

function escape(game, p) {
  if (p.dr.escaped) return;
  p.dr.escaped = true;
  const first = !S.eyeAt;
  const gold = first ? 15 : 10;
  p.stats.Gold += gold; p.dr.gold += gold;
  S.gui.feed(`<b>${p.name}</b> reached the Eye of Ra! (+${gold})`, true);
  S.FX.glow.puff(p.character.rootPosition.clone().add(V(0, 2, 0)), 0xffd070, 40, 1.4, 12, 1.4);
  A.tone(880, 0.6, { type: 'triangle', vol: 0.15 });
  p.brain?.onEscape?.();
  if (p.isLocal) S.gui.bannerShow('You escaped!', 'The Eye of Ra', 'Stand in the light and watch the curse burn.', 4);
  if (first) {
    S.eyeAt = S.world.time;
    S.phase = 'eye'; S.T = EYE;
    S.gui.bannerShow('The Eye of Ra opens', `${p.name} reached the top`, `${EYE} seconds until the sun burns the Pharaoh. Hurry!`, 4);
    A.playSong('eye', 0.3); A.eyeCharge(EYE);
  }
  game.gui?.onPlayersChanged();
}

/** The sun comes down on the Pharaoh. */
function eyeOfRa(game) {
  const ph = S.pharaohChar();
  if (ph) {
    const beam = lightShaft(5, 7, 600, 0xffe7a0, 0.55);
    beam.position.set(ph.rootPosition.x, ph.rootPosition.y + 560, ph.rootPosition.z);
    S.world.scene.add(beam); S.eyeBeam = beam;
    S.FX.glow.puff(ph.rootPosition.clone(), 0xffd070, 80, 2.2, 30, 1.8);
    ph.lastCause = 'eye';
    ph.breakJoints(null, ph.rootPosition.clone().add(V(0, -2, 0)));
    S.post.hit(0.8, 0xffd070);
  }
  A.eyeBlast();
  endRound(game, 'runners');
}

function endRound(game, winner, why = '') {
  if (S.phase === 'end') return;
  S.phase = 'end'; S.T = END;
  A.stopSong();
  const ph = S.pharaoh, me = game.localPlayer;
  const rows = [];
  for (const q of game.players) {
    if (!q.dr || q.dr.role === 'camp') continue;
    let what, gold = 0;
    if (q.dr.role === 'pharaoh') { what = winner === 'pharaoh' ? 'The Pharaoh (won)' : 'The Pharaoh (burned)'; if (winner === 'pharaoh') { gold = 20; q.stats.Wins++; } }
    else if (q.dr.escaped) { what = 'Escaped'; q.stats.Wins++; }
    else what = q.dr.alive ? 'Trapped in the tomb' : 'Died';
    if (gold) { q.stats.Gold += gold; q.dr.gold += gold; }
    rows.push({ name: q.name, what, gold: `${q.dr.gold} gold`, me: q === me, k: q.dr.role === 'pharaoh' ? 0 : q.dr.escaped ? 1 : 2 });
  }
  rows.sort((a, b) => a.k - b.k);
  if (winner === 'runners') { A.fanfareWin(); S.gui.results('The runners win', 'The Eye of Ra has burned the curse away', rows); }
  else { A.fanfareLose(); S.gui.results('The Pharaoh wins', why === 'time' ? 'Time ran out: the tomb is sealed forever' : 'Nobody escaped the tomb', rows); }
  for (const q of game.players) if (q.dr?.role === 'runner' && !q.dr.escaped) q.brain?.onSurvive?.();
  game.gui?.onPlayersChanged();
}

function toCamp(game) {
  S.phase = 'lobby'; S.T = INTERMISSION;
  S.gui.results(null);
  for (const q of game.players) {
    if (!q.dr) continue;
    q.dr.role = 'camp'; q.dr.alive = false; q.dr.escaped = false; q.dr.gold = 0;
    q.appearanceOverride = null; q.spawnOverride = null;
    game.spawnPlayer(q);
  }
  if (S.eyeBeam) { S.world.scene.remove(S.eyeBeam); S.eyeBeam = null; }
  A.playSong('camp', 0.3);
}

function fireTrap(T, by) {
  if (!T || !T.fire(by)) return false;
  A.gong(T.buttonPos, 0.5);
  T.sfx?.();
  if (by?.isLocal) S.post.hit(0.25, 0xffb040);
  S.gui.feed(`&#9765; The Pharaoh unleashed <b>${T.name}</b>`, true);
  return true;
}

// --- spectating, the camera ------------------------------------------------------------------------------------------------------------------------------
function spectating(me) { return (S.phase === 'run' || S.phase === 'eye') && me?.dr && (me.dr.role === 'camp' || (me.dr.role === 'runner' && (!me.dr.alive || me.dr.escaped)) || !me.character?.alive); }
function spectate(game) {
  const me = game.localPlayer;
  if (!me) return;
  if (!spectating(me)) { if (me.character?.alive && game.camera.subject !== me.character) game.camera.subject = me.character; S.gui.specShow(null); return; }
  const list = game.players.filter((q) => q !== me && q.character?.alive && q.dr && (q.dr.role === 'pharaoh' || (q.dr.role === 'runner' && q.dr.alive && !q.dr.escaped)));
  if (!list.length) { S.gui.specShow(null); return; }
  S.specIdx = ((S.specIdx % list.length) + list.length) % list.length;
  const q = list[S.specIdx];
  if (game.camera.subject !== q.character) game.camera.subject = q.character;
  S.gui.specShow(q.name + (q.dr.role === 'pharaoh' ? ' (the Pharaoh)' : ''));
}

/** Lighting, fog, air and sound follow the hall the camera is in. */
function lookAndFeel(game, dt) {
  const world = game.world, focus = game.camera.focus;
  const h = hallAt(focus), id = h < 0 ? 'camp' : S.course.halls[h].look;
  const L = LOOKS[id] || LOOKS.day, cur = S.look, k = Math.min(1, dt * 1.6);
  for (const key of ['amb', 'sunI', 'near', 'far', 'exp', 'bloom', 'wind']) cur[key] = lerp(cur[key], L[key], k);
  for (const key of ['sky', 'ground', 'sun', 'fog']) { const a = _ca.set(cur[key]), b = _cb.set(L[key]); a.lerp(b, k); cur[key] = a.getHex(); }
  world.ambient.color.set(cur.sky); world.ambient.groundColor.set(cur.ground); world.ambient.intensity = cur.amb;
  world.sun.color.set(cur.sun); world.sun.intensity = cur.sunI;
  world.scene.fog.color.set(cur.fog); world.scene.fog.near = cur.near; world.scene.fog.far = cur.far;
  S.post.update(dt, { exposure: cur.exp, bloom: cur.bloom });
  S.motes.update(dt, world.camera.position, L.motes[0], lerp(S.motes.mat.opacity, L.motes[1], k));
  A.windLevel(cur.wind * 0.4);
}
const _ca = new THREE.Color(), _cb = new THREE.Color();

// --- the HUD ---------------------------------------------------------------------------------------------------------------------------------------
const fmt = (s) => { s = Math.max(0, Math.ceil(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
function hud(game) {
  const C = S.course, me = game.localPlayer, gui = S.gui;
  const focus = game.camera.focus, h = hallAt(focus);
  const hallName = h < 0 ? "The Explorers' Camp" : `${h + 1}. ${C.halls[h].name}`;
  const runners = game.players.filter((q) => q.dr?.role === 'runner');
  const alive = runners.filter((q) => q.dr.alive && !q.dr.escaped).length, escaped = runners.filter((q) => q.dr.escaped).length;
  let time = '', runTxt = '-', low = false;
  if (S.phase === 'lobby') { time = fmt(S.T); runTxt = `${game.players.length} here`; }
  else if (S.phase === 'intro') { time = fmt(S.T); runTxt = `${runners.length}`; }
  else if (S.phase === 'run' || S.phase === 'eye') { time = fmt(S.T); low = S.phase === 'eye' || S.T < 30; runTxt = `${alive} left${escaped ? ` · ${escaped} out` : ''}`; }
  else if (S.phase === 'end') { time = '-'; runTxt = `${escaped} escaped`; }
  gui.top({ hall: hallName, time, low, runners: runTxt, pharaoh: S.pharaoh && S.phase !== 'lobby' ? S.pharaoh.name : '?' });
  // the race
  if (S.phase === 'run' || S.phase === 'eye' || S.phase === 'intro') {
    const z0 = 0, z1 = C.finishZ ?? -1820;
    gui.progress(C.halls, runners.map((q) => ({ name: q.name, me: q === me, dead: !q.dr.alive, color: q.dr.escaped ? '#ffd060' : q === me ? '#7cf07c' : '#e8dcc0', k: clamp(((q.character?.rootPosition.z ?? 0) - z0) / (z1 - z0), 0, 1) })));
  }
  gui.campShow(S.phase === 'lobby' ? (game.players.length < 2 ? 'Waiting for more explorers...' : `The next round begins in <b>${Math.ceil(S.T)}</b>`) : null, S.volunteer);
  gui.eyeShow(S.phase === 'eye' ? `&#120795; THE EYE OF RA: ${Math.ceil(S.T)}` : null);
  // the Pharaoh's list
  const isPh = me?.dr?.role === 'pharaoh' && (S.phase === 'run' || S.phase === 'eye' || S.phase === 'intro');
  if (isPh) { const tgt = pharaohTarget(); for (const T of C.traps) T.next = T === tgt; }
  gui.trapsPanel(isPh, C.halls, me?.character ? hallAt(me.character.rootPosition) : 0);
}
