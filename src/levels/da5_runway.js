// Dead Air 5 — Runway Finale.
// Start in the Gate C4 safe room above the apron. Stepping into the lounge
// sets off the SkyLine Air 212 crash (cinematic: an airliner full of infected
// hits the grass beside the runway and its fuel tanks go up; the blast blows
// the lounge glass in). Out through the C4 jet bridge and its service stair to
// the apron, along the lit taxi lane past the overrun checkpoint to the dead
// loadmaster's radio. The pilot of Evac 41 asks for the tanker's fuel pump:
// starting it (loud) begins the finale — waves from the baggage halls, Hangar
// 3 and over the T-walls, two Tank waves, minigun nests, supply tables and an
// on-screen fuel gauge with pilot updates. At 100% the ramp comes down; board
// and Evac 41 taxis out through gate 7 and takes off past the burning wreck.
import * as THREE from 'three';
import { usable, sign, P } from './kit.js';
import { MountedGun } from '../combat/mounted.js';
import { DF } from '../render/decals.js';
import { SkyLights, skyAircraft, airportLandmark, smokePlumes, cloudDeck } from './da_parts.js';
import { autoClutter, scatterClutter, cables } from './clutter.js';
import { FlameField, glowSprite } from './da5_fx.js';
import { buildTerminal } from './da5_terminal.js';
import { buildCrash, IMPACT_T, FUEL_T } from './da5_crash.js';
import { TransportPlane } from './da5_plane.js';
import { buildApron, GATE7 } from './da5_apron.js';
import { DEP, FAC_Z, SAFE, LOUNGE, APRON, TW, STRIP, HANGAR, HALLS, PLANE, TANKER, NEST_A, NEST_B, RUNWAY, STAIR } from './da5_layout.js';
import { makeRng } from '../core/math.js';

const rng = makeRng(5301);
const V = new THREE.Vector3();
const CREW = { x: 21.8, z: 37.8 };             // dead loadmaster with the radio
const PUMP = { x: TANKER.x, y: 1.2, z: TANKER.z - 5.75 };

function skyAndTraffic(L, game, sky) {
  airportLandmark(L, game, sky, 190, -95, { h: 64, runway: { x0: -440, x1: 560, z: RUNWAY.z }, terminal: [150, -190, 330, -160] });
  // holding stack + a fighter pair + tracer fire over the city
  for (let k = 0; k < 2; k++) {
    const R = 260 + k * 90, alt = 150 + k * 40, w = 0.025 - k * 0.006, ph = k * 2.4;
    skyAircraft(sky, (t) => { const a = t * w + ph; return { x: 60 + Math.cos(a) * R, y: alt + Math.sin(t * 0.1 + k) * 4, z: -120 + Math.sin(a) * R }; }, { scale: 0.8 });
  }
  const jetPath = (off) => (t) => { const k = ((t + off) % 50) / 50; return { x: 600 - k * 1200, y: 170 + Math.sin(k * 5) * 12, z: -380 + k * 300 }; };
  skyAircraft(sky, jetPath(0), { kind: 'jet' });
  skyAircraft(sky, jetPath(-1.2), { kind: 'jet' });
  const tr = [];
  for (let i = 0; i < 10; i++) tr.push(sky.add(0, -1e3, 0, [3, 1.4, 0.4], 0));
  sky.track({ update(t) { for (let i = 0; i < tr.length; i++) { const k = (t * 0.8 + i * 0.17) % 3.2; if (k > 1) { sky.hide(tr[i]); continue; } const bx = -260 + (i % 5) * 110, bz = -320 + (i % 3) * 40; sky.set(tr[i], bx + k * 50, 6 + k * 110, bz + k * 30, null, 3); } } });
  smokePlumes(L, game, [[-220, 0, -260, 190, 20], [140, 0, -330, 170, 18], [-420, 0, 60, 160, 22], [380, 0, -120, 150, 16], [60, 0, 420, 170, 20], [-160, 0, 380, 140, 16]].map(([x, y, z, h, r]) => ({ x, y, z, h, r })), { per: 9, wind: [1, -0.35] });
  cloudDeck(L, game, { y: 190, r: 620, glow: 0x7a4228, dark: 0x1e181c });
}

function fuelHud(game, L, F) {
  document.getElementById('da5fuel')?.remove();
  const el = document.createElement('div');
  el.id = 'da5fuel';
  el.style.cssText = 'position:absolute;right:26px;top:92px;width:230px;display:none;font-family:Impact,"Arial Black",sans-serif;color:#f0e8d0;text-shadow:0 2px 5px #000;pointer-events:none;';
  el.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:baseline;letter-spacing:3px;font-size:17px"><span>EVAC 41 · FUEL</span><span class="p" style="font-size:24px;color:#f0c040">0%</span></div>' +
    '<div style="height:10px;background:rgba(0,0,0,0.6);border:1px solid rgba(255,255,255,0.35);margin-top:4px;position:relative">' +
    '<div class="f" style="height:100%;width:0%;background:linear-gradient(90deg,#b07010,#f0c040);transition:width 0.3s"></div>' +
    [25, 50, 75].map((k) => `<div style="position:absolute;top:0;bottom:0;left:${k}%;width:1px;background:rgba(255,255,255,0.35)"></div>`).join('') + '</div>' +
    '<div class="s" style="font-family:Arial,sans-serif;font-size:12px;letter-spacing:2px;margin-top:4px;color:#c8c0a8;text-transform:uppercase">pump running</div>';
  game.hud.root.appendChild(el);
  const pEl = el.querySelector('.p'), fEl = el.querySelector('.f'), sEl = el.querySelector('.s');
  let last = -1, lastS = '';
  const watch = setInterval(() => { if (game.level !== L) { el.remove(); clearInterval(watch); } }, 1000);
  return {
    update() {
      const show = F.pumping && game.session?.state === 'playing';
      el.style.display = show ? 'block' : 'none';
      if (!show) return;
      const p = Math.floor(F.fuel);
      if (p !== last) { last = p; pEl.textContent = p + '%'; fEl.style.width = F.fuel.toFixed(1) + '%'; }
      const st = F.fuel >= 100 ? 'tanks full — board the plane' : F.fuel >= F.cap - 0.01 ? 'pump pressure dropping…' : 'pump running';
      if (st !== lastS) { lastS = st; sEl.textContent = st; sEl.style.color = F.fuel >= 100 ? '#80ff90' : F.fuel >= F.cap - 0.01 ? '#ff9070' : '#c8c0a8'; }
    },
  };
}

export default {
  id: 'runway',
  title: 'Runway Finale',
  def: {
    director: {
      wanderers: 22, mobInterval: [70, 110], mobSize: [12, 18], specials: ['hunter', 'smoker', 'boomer'], maxSpecials: 3, specialInterval: [20, 34],
      tank: 0, witches: 1, relax: [20, 35], outfit: 'civilian',
      noSpawnBoxes: [[SAFE.x0 - 1, DEP - 1, SAFE.z0 - 1, SAFE.x1 + 1, DEP + 4, SAFE.z1 + 1], [PLANE.x - 3, -1, PLANE.z - 16, PLANE.x + 3, 6, PLANE.z + 8]],
    },
    navCell: 0.5,
  },
  build(L, game) {
    L.env = Object.assign(L.env, {
      fog: 0x1e1614, fogDensity: 0.0085, hemiSky: 0x4c4658, hemiGround: 0x3a2418, hemiIntensity: 0.46, envIntensity: 0.12,
      moon: { dir: [0.35, 1, 0.55], intensity: 0.32, color: 0xc89070 }, exposure: 1.18, reverb: 'outdoor', ambience: 'city',
      skyOpts: { hospitalAz: null, moon: false, fires: 26, zenith: '#060609', mid: '#1c131a', glow: '#6a321e', ground: '#0c0a0a', rotation: 1.4 },
    });
    L.menuCam = { x: 20, y: 3.4, z: 28, yaw: -2.35, pitch: 0.02 };
    const S = { game };
    S.sky = new SkyLights(L, game, 460);
    S.flames = new FlameField(L, game, 120, 120);
    buildTerminal(L, game, S);
    buildApron(L, game, S);
    skyAndTraffic(L, game, S.sky);
    const d = game.director;
    const s = game.session;
    const say = (lines) => game.voice.script(lines);

    // ============================================================ Evac 41 + tanker
    const plane = new TransportPlane(L, game, { x: PLANE.x, z: PLANE.z, yaw: PLANE.yaw, sky: S.sky });
    P.fuelTanker(L, TANKER.x, 0, TANKER.z, Math.PI, { pump: true, color: 0xd8d4c8, cabColor: 0xc8a020 });
    sign(L, 'JET A-1  ·  FLAMMABLE', TANKER.x + 1.23, 2.05, TANKER.z + 1.5, Math.PI / 2, 3.2, 0.5, { bg: '#c8a020', fg: '#101010', clean: true });
    sign(L, 'JET A-1  ·  FLAMMABLE', TANKER.x - 1.23, 2.05, TANKER.z + 1.5, -Math.PI / 2, 3.2, 0.5, { bg: '#c8a020', fg: '#101010', clean: true });
    cables(L, [TANKER.x + 0.9, 1.7, PUMP.z + 0.9], [TANKER.x + 3.6, 4.5, TANKER.z + 0.6], 0.6, 0.055, 'rubber');
    cables(L, [TANKER.x + 3.6, 4.5, TANKER.z + 0.6], [PLANE.x - 14, 4.62, PLANE.z + 1.2], 0.25, 0.055, 'rubber');
    const pumpLamp = glowSprite(0xff2010, 0.5);
    pumpLamp.position.set(PUMP.x + 0.8, 1.62, PUMP.z - 0.5);
    L.addObject(pumpLamp);
    const cabBeacon = glowSprite(0xffa020, 1.6);
    cabBeacon.position.set(TANKER.x, 2.75, TANKER.z + 3.2);
    cabBeacon.visible = false;
    L.addObject(cabBeacon);
    sign(L, 'FUEL PUMP\nSTART ▶', PUMP.x - 0.6, 1.75, PUMP.z - 0.46, 0, 0.6, 0.32, { bg: '#1a1a1a', fg: '#f0c040', clean: true });
    L.flowEnd = [...plane.holdCentre];

    // ============================================================ mounted guns
    const gunA = new MountedGun(L, NEST_A.x, 0, NEST_A.z, NEST_A.yaw, { arc: 1.3 });
    const gunB = new MountedGun(L, NEST_B.x, 0, NEST_B.z, NEST_B.yaw, { arc: 1.3 });
    void gunA; void gunB;

    // ============================================================ the dead loadmaster + flare + radio
    P.corpse(L, CREW.x, 0.01, CREW.z, 2.3, 0x4a5a3a);
    L.decal(CREW.x + 0.2, 0.02, CREW.z + 0.3, 0, 1, 0, 1.8, DF.POOL);
    L.decal(CREW.x - 1.4, 0.02, CREW.z - 1.2, 0, 1, 0, 1.2, DF.SMEAR);
    const rp = P.prop(L, CREW.x + 0.55, 0, CREW.z - 0.45, 0.6);
    rp.rbox(0, 0.13, 0, 0.12, 0.26, 0.07, 0.015, 'plastic', 0x1a1c18).cyl(0.03, 0.34, 0, 0.008, 0.18, 'blackMatte').glow(0, 0.2, -0.037, 0.06, 0.03, 0.005, 0x30ff60);
    const flareP = P.prop(L, CREW.x - 0.8, 0, CREW.z + 0.9, 0.3);
    flareP.cylX(0, 0.025, 0, 0.02, 0.24, 'paintedRed', 0xb01810, 8).glow(0.13, 0.025, 0, 0.03, 0.03, 0.03, 0xff3020);
    const flareL = L.light(CREW.x - 0.7, 0.4, CREW.z + 0.9, 0xff2a18, 10, 14, { flicker: 0.45, priority: 1 });
    L.dynamics.push({ t: 0, update(dt) { this.t -= dt; const cp = game.camPos; if (this.t > 0 || (cp.x - CREW.x) ** 2 + (cp.z - CREW.z) ** 2 > 3600) return; this.t = 0.12; game.fx.smokeColumn(CREW.x - 0.66, 0.1, CREW.z + 0.9, 0.35, [0.5, 0.12, 0.1]); if (Math.random() < 0.3) game.fx.sparks(CREW.x - 0.66, 0.05, CREW.z + 0.9, 0, 1, 0, 3, [1, 0.3, 0.2], 2); } });

    // ============================================================ finale state
    const F = { stage: 'pre', t: 0, fuel: 0, cap: 0, rate: 0.45, pumping: false, said: {}, spawnNodes: [], hallNodes: [], hangarNodes: [], stripNodes: [], waitingTank: false, crash: 'idle' };
    L.finale = F;
    S.F = F; S.plane = plane;
    const hud = fuelHud(game, L, F);
    const crash = buildCrash(L, game, S);
    S.crashApi = crash;
    // burning debris thrown over the south wall by the fuel blast (lit on the blast)
    const debrisF = [[-34, 91.5, 3, 3.5], [-12, 93, 4, 4.5], [8, 90.8, 2.6, 3], [26, 93.6, 3.4, 4], [-50, 93, 2.4, 2.6]].map(([x, z, w, h]) => ({ f: S.flames.add(x, 0.05, z, w, h, { intensity: 0, on: false, flicker: 0.25 }), x, z, w }));
    const debrisL = [L.light(-22, 2.5, 92, 0xff7030, 18, 20, { on: false, flicker: 0.5 }), L.light(16, 2.5, 92, 0xff7030, 16, 18, { on: false, flicker: 0.5 })];
    S.onFuelBlast = () => {
      L.after(1.4, () => {
        for (const e of debrisF) { if (e.f) { e.f.target = 0.9; e.f.rate = 1.2; } game.fx.explosion(e.x, 1, e.z, 1.2); game.decals.add(e.x, 0.02, e.z, 0, 1, 0, e.w * 2.2, DF.SCORCH); S.fires.push([e.x, 0.05, e.z, e.w]); }
        for (const l of debrisL) l.on = true;
      });
      // shockwave: the lounge glass blows in, alarms, the EBS screen dies
      const dir = new THREE.Vector3(0, 0, -1);
      L.after(0.35, () => { for (const p of S.loungePanes) if (!p.broken) p.shatter(dir); game.shake(0.9); });
    };

    const gatherNodes = () => {
      const nav = L.nav;
      const add = (list, x, y, z) => { const n = nav.nearestNode(x, y, z, 1.0); if (n >= 0 && Math.abs(nav.nodeY[n] - y) < 0.6) list.push(n); };
      for (const h of S.halls) for (let x = h.x0; x <= h.x1; x += 2) for (let z = h.z0; z <= h.z1; z += 2) add(F.hallNodes, x, 0, z);
      const hb = S.hangarBox;
      for (let x = hb[0]; x <= hb[3]; x += 3) for (let z = hb[2]; z <= hb[5]; z += 3) add(F.hangarNodes, x, 0, z);
      const sx0 = APRON.x0 - TW.t - STRIP + 1, sz = APRON.z1 + TW.t + 3;
      for (let x = -20; x <= APRON.x1 + 4; x += 3) add(F.stripNodes, x, 0, sz);
      for (let z = 20; z <= APRON.z1; z += 3) add(F.stripNodes, sx0 + 2, 0, z);
      for (let z = HANGAR.z1 + 2; z < APRON.z1; z += 3) add(F.stripNodes, APRON.x1 + TW.t + 3, 0, z);
    };
    const allNodes = () => F.hallNodes.concat(F.hangarNodes, F.stripNodes, F.stripNodes);
    const tankAlive = () => game.infected.specials.some((sp) => sp.kind === 'tank' && !sp.dead);
    const spawnTank = (from) => {
      const nodes = from.length ? from : allNodes();
      game.director.spawnSpecial('tank', { node: nodes[Math.floor(rng() * nodes.length)] });
      F.waitingTank = true;
    };

    // ============================================================ radio + pump
    const radio = usable(L, CREW.x + 0.55, 0.35, CREW.z - 0.45, 'Pick up the radio', () => {
      game.audio.play('radioStatic', { vol: 0.9 });
      F.stage = 'radio';
      say([
        { who: 'radio', text: '—anyone on this net? This is Evac four-one on stand forty-one. Anyone copy?', d: 0.4 },
        { who: 'bill', text: 'We copy. Four survivors, right outside your plane.', d: 4.4 },
        { who: 'pilot', text: 'Survivors? Oh thank God. Okay. Okay. My loadmaster went out to fuel us an hour ago and never came back.', d: 7.6 },
        { who: 'zoey', text: 'Yeah... we found him.', d: 12.6 },
        { who: 'pilot', text: 'The tanker is under my right wing. Get its pump going and I can fill the tanks from the cockpit.', d: 14.8 },
        { who: 'pilot', text: 'Fair warning — that pump is LOUD. Every one of those things out there is going to hear it. Dig in first.', d: 19.8 },
        { who: 'louis', text: 'Guns on the sandbags, supplies in the tents. We can do this!', d: 25.2 },
      ]);
      L.after(25, () => { pump.enabled = true; s.objective('Get ready, then start the fuel pump on the tanker', 'Evac 41'); });
    }, { hold: 1.2, holdLabel: 'Picking up the radio', radius: 2.2, sound: 'radioBeep', enabled: false });
    const pump = usable(L, PUMP.x, PUMP.y, PUMP.z - 0.4, 'Start the fuel pump (starts the finale)', () => startFinale(), { hold: 3, holdLabel: 'Priming the pump', radius: 2.0, sound: 'buttonPress', enabled: false });
    S.radio = radio; S.pump = pump;

    function startFinale() {
      F.stage = 'wavesA'; F.t = 0; F.pumping = true; F.cap = 38;
      flareL.flicker = 0.6;
      pumpLamp.material.color.set(0x30ff50);
      cabBeacon.visible = true;
      F.pumpSnd = game.audio.loop('generator', { pos: new THREE.Vector3(PUMP.x, 1.2, PUMP.z), vol: 2.2 });
      F.pumpSnd2 = game.audio.loop('liftMotor', { pos: new THREE.Vector3(PUMP.x, 1.2, PUMP.z), vol: 0.9 });
      game.audio.play('metalGate', { pos: new THREE.Vector3(PUMP.x, 1.2, PUMP.z), vol: 1.4 });
      d.finaleMode = true; d.blockMobs = true; d.blockWanderers = true; d.cfg.maxSpecials = 3;
      game.audio.music.stinger('finaleStart');
      say([
        { who: 'francis', text: 'Well. That IS loud.', d: 1.2 },
        { who: 'pilot', text: 'Fuel is flowing! I need that pump running until she\'s full, you hear me? Keep them off the truck!', d: 3.2 },
        { who: 'bill', text: 'Here they come — every direction! Hold the line!', d: 8.5 },
      ]);
      s.objective('Defend the tanker until Evac 41 is fuelled', 'Finale');
      L.after(7, () => d.panic('da5A', { waves: 3, size: [16, 24], interval: 20, nodes: allNodes(), stingEvery: true, force: true, onEnd: () => { F.stage = 'tank1'; F.t = 0; F.cap = 48; } }));
    }

    const pilotAt = (k, lines) => { if (F.fuel >= k && !F.said[k]) { F.said[k] = true; say(lines); } };

    function board() {
      F.stage = 'board'; F.t = 0;
      F.pumpSnd?.stop(1.5); F.pumpSnd2?.stop(1.5);
      pumpLamp.material.color.set(0xffa020);
      plane.lowerRamp(4.5);
      plane.setHoldLights(true);
      plane.setEngines(0.55);
      plane.audio(true, 1);
      game.audio.music.stinger('rescueArrive');
      s.objective('Get on the plane!', 'Evac 41');
      d.panic('da5End', { endless: true, size: [16, 24], interval: 12, nodes: allNodes(), force: true });
    }

    // ============================================================ crash cinematic
    function crashCine() {
      F.crash = 'running';
      const t0 = game.time;
      d.blockMobs = true; d.blockSpecials = true;
      crash.start();
      s.cinematic(true);
      say([
        { who: 'zoey', text: 'Is that plane supposed to be that low?', d: 2.2 },
        { who: 'louis', text: 'It\'s not slowing down — it\'s not slowing down!', d: 6.0 },
        { who: 'bill', text: 'GET DOWN!', d: 8.9 },
      ]);
      const cam = game.renderer.camera;
      const [cx, cy, cz] = S.loungeCam;
      const look = new THREE.Vector3(80, 12, 120), tgt = new THREE.Vector3();
      let shake = 0;
      game.hooks.cutscene = (dt) => {
        const t = game.time - t0;
        if (t < IMPACT_T) tgt.copy(crash.flyer.pos);
        else tgt.set(crash.pieces[1].g.position.x, 3, crash.pieces[1].g.position.z);
        if (t < 0.1) look.copy(tgt);
        look.lerp(tgt, Math.min(1, dt * (t < IMPACT_T ? 4 : 1.5)));
        if (t > IMPACT_T && t < IMPACT_T + 0.3) shake = 0.5;
        if (t > FUEL_T && t < FUEL_T + 0.3) shake = 1.0;
        shake = Math.max(0, shake - dt * 0.9);
        const k = shake * shake * 0.25;
        cam.position.set(cx + (Math.random() - 0.5) * k, cy + (Math.random() - 0.5) * k, cz + (Math.random() - 0.5) * k);
        cam.lookAt(look);
        if (t > FUEL_T + 3.6 && F.crash === 'running') {
          F.crash = 'done';
          game.hooks.cutscene = null;
          s.cinematic(false);
          d.blockMobs = false; d.blockSpecials = false;
          say([
            { who: 'francis', text: '...I hate airplanes.', d: 0.6 },
            { who: 'zoey', text: 'That was SkyLine two-twelve. Nobody was flying it.', d: 2.6 },
            { who: 'bill', text: 'Then let\'s make damn sure ours has a pilot. Through the jet bridge — down to the tarmac!', d: 5.6 },
          ]);
          s.objective('Get down to the apron through the C4 jet bridge');
          radio.enabled = true;
          L.after(3, () => d.spawnMob(10, { where: 'ahead' }));
        }
      };
    }

    // ============================================================ escape cutscene
    function escape() {
      F.stage = 'escape'; F.t = 0;
      d.stopPanic(); d.enabled = false;
      game.audio.music.stinger('escape');
      say([
        { who: 'pilot', text: 'Everybody in? Ramp coming up — hold on to something!', d: 0.3 },
        { who: 'louis', text: 'We made it! We actually made it!', d: 7.5 },
        { who: 'francis', text: 'Don\'t jinx it.', d: 10.2 },
        { who: 'zoey', text: 'Roll credits.', d: 13.2 },
      ]);
      for (const x of game.survivors) { x.model?.setHidden(true); x.cmd.fire = false; }
      if (game.player.usingMounted) game.player.usingMounted.dismount?.();
      game.cheats.godAll = true;
      s.state = 'cutscene';
      s.cinematic(true);
      plane.raiseRamp(3.2);
      plane.setEngines(1);
      plane.setLanding(true);
      S.gate.open = true;
      const cam = game.renderer.camera;
      const t0 = game.time;
      let shot = 0;
      const look = new THREE.Vector3();
      L.after(2.4, () => plane.drive([
        { x: PLANE.x, z: PLANE.z, t: 0, ease: 'in' }, { x: PLANE.x, z: PLANE.z + 9, t: 3.2 }, { x: PLANE.x - 0.5, z: PLANE.z + 23, t: 5.8 }, { x: PLANE.x - 1, z: PLANE.z + 40, t: 8.6 },
      ]));
      game.hooks.cutscene = (dt) => {
        const t = game.time - t0;
        const p = plane.group.position;
        if (shot === 0) {
          // from beside the tanker: ramp up, props screaming, she rolls for the gate
          cam.position.set(TANKER.x - 6, 2.2, TANKER.z - 16);
          look.set(p.x, 3.2, p.z + 2);
          if (t > 8.6) {
            shot = 1;
            plane.group.rotation.set(0, Math.PI / 2, 0);
            plane.drive([
              { x: 150, z: RUNWAY.z, t: 0 }, { x: 70, z: RUNWAY.z, t: 3.4 }, { x: 0, z: RUNWAY.z, t: 5.6 }, { x: -60, y: 2, z: RUNWAY.z, t: 7.2, pitch: 0.16 },
              { x: -150, y: 22, z: RUNWAY.z - 2, t: 9.6, pitch: 0.2 }, { x: -300, y: 70, z: RUNWAY.z - 8, t: 13.5 },
            ]);
            plane.group.position.set(150, 0, RUNWAY.z);
          }
        } else {
          // low on the grass by the burning wreck: Evac 41 thunders past and lifts off
          cam.position.set(-16, 2.3, 96.5);
          look.lerp(V.set(p.x, p.y + 3, p.z), Math.min(1, dt * 5));
          if (t < 8.8) look.set(p.x, p.y + 3, p.z);
        }
        cam.lookAt(look);
        if (t > 20 && !F.ended) { F.ended = true; s.fade(0, 1, 1.5); setTimeout(() => { game.hooks.cutscene = null; s.cinematic(false); s.victory(); }, 1600); }
      };
      game.viewmodel.visible = false;
    }
    S.escape = escape;

    // ============================================================ script
    L.script = {
      start() {
        gatherNodes();
        // stepping out of the safe room into the lounge: SkyLine 212
        L.trigger(LOUNGE.x0 + 0.4, DEP - 0.5, LOUNGE.z0, LOUNGE.x1, DEP + 3, LOUNGE.z1, () => { if (F.crash === 'idle') crashCine(); }, {});
        // onto the apron
        L.trigger(STAIR.x1, -0.5, 10, STAIR.x1 + 8, 3, 24, () => {
          s.objective('Follow the taxi lights toward the transport');
          say([
            { who: 'louis', text: 'Army set up a checkpoint by the transport. Doesn\'t look like it held.', d: 0.4 },
            { who: 'bill', text: 'Somebody\'s got a flare burning out there. Let\'s have a look.', d: 4.2 },
          ]);
        }, {});
        L.trigger(CREW.x - 7, -0.5, CREW.z - 7, CREW.x + 7, 3, CREW.z + 7, () => {
          if (F.stage !== 'pre') return;
          say([{ who: 'zoey', text: 'Flight suit. He\'s one of the crew... and he\'s got a radio.', d: 0.2 }]);
          s.objective('Use the crewman\'s radio');
        }, {});
      },
      update(dt) {
        F.t += dt;
        hud.update();
        // the fuel gauge climbs toward the current stage's cap
        if (F.pumping && F.fuel < F.cap) F.fuel = Math.min(F.cap, F.fuel + F.rate * dt);
        if (F.pumping) {
          const k = (game.time * 2.1) % 1;
          cabBeacon.scale.setScalar(k < 0.5 ? 1.8 : 0.3);
          pilotAt(25, [{ who: 'pilot', text: 'Twenty-five percent! Keep them off that truck!', d: 0 }]);
          pilotAt(50, [{ who: 'pilot', text: 'Halfway there! Starting engines two and three — stay out of the props!', d: 0 }]);
          pilotAt(75, [{ who: 'pilot', text: 'Seventy-five! Almost there, almost there...', d: 0 }]);
          pilotAt(90, [{ who: 'pilot', text: 'Ninety percent — come on, come on...', d: 0 }]);
          if (F.fuel >= 50 && !F.engines) { F.engines = true; plane.setEngine(1, 0.35); plane.setEngine(2, 0.35); plane.audio(true, 0.6); }
        }
        switch (F.stage) {
          case 'tank1':
            if (F.t > 4 && !F.waitingTank && !F.t1) { F.t1 = true; spawnTank(F.hangarNodes); say([{ who: 'pilot', text: 'Something BIG just came out of Hangar Three!', d: 0 }, { who: 'zoey', text: 'TANK!', d: 2.4 }]); s.objective('TANK! Protect the pump!', 'Finale'); }
            if (F.waitingTank && !tankAlive() && F.t > 8) { F.waitingTank = false; F.stage = 'wavesB'; F.t = 0; F.cap = 76; say([{ who: 'bill', text: 'It\'s down! Reload and get ready!', d: 0.3 }]); }
            break;
          case 'wavesB':
            if (F.t > 5 && !d.panicState && !F.bStarted) {
              F.bStarted = true;
              d.panic('da5B', { waves: 2, size: [22, 30], interval: 20, nodes: allNodes(), force: true, onEnd: () => { F.stage = 'tank2'; F.t = 0; F.cap = 86; } });
            }
            break;
          case 'tank2':
            if (F.t > 3 && !F.waitingTank && !F.t2) {
              F.t2 = true; spawnTank(F.stripNodes);
              d.panic('da5T2', { waves: 1, size: [14, 20], interval: 30, nodes: F.hallNodes.length ? F.hallNodes : allNodes(), force: true });
              say([{ who: 'louis', text: 'Another Tank?! Over the wall!', d: 0.3 }]);
              s.objective('Another Tank! Hold on!', 'Finale');
            }
            if (F.waitingTank && !tankAlive() && F.t > 8) {
              F.waitingTank = false; F.stage = 'final'; F.t = 0; F.cap = 100;
              say([{ who: 'pilot', text: 'Last push! Thirty more seconds and she\'s full!', d: 0.5 }]);
              s.objective('Final wave — keep the fuel flowing!', 'Finale');
              d.panic('da5F', { endless: true, size: [18, 26], interval: 15, nodes: allNodes(), force: true, stingEvery: true });
            }
            break;
          case 'final':
            if (F.fuel >= 100) {
              d.stopPanic();
              say([{ who: 'pilot', text: 'That\'s it — she\'s FULL! Ramp\'s coming down. GET ON THE PLANE!', d: 0 }, { who: 'bill', text: 'Go, go, GO! Up the ramp!', d: 3.4 }]);
              board();
            }
            break;
          case 'board': {
            if (s.state !== 'playing' || plane.ramp < plane.rampTarget - 0.02) break;
            const z = plane.boardZone;
            const inZone = (x) => x.pos.x > z[0] && x.pos.x < z[3] && x.pos.y > z[1] && x.pos.y < z[4] && x.pos.z > z[2] && x.pos.z < z[5];
            const alive = game.survivors.filter((x) => !x.dead);
            const standing = alive.filter((x) => !x.incapped);
            const humanIn = game.player.dead || (inZone(game.player) && !game.player.incapped);
            if (standing.length && standing.every(inZone) && humanIn) {
              for (const x of alive) if (x.incapped) x.die('left behind');
              escape();
            }
            break;
          }
        }
      },
    };

    // ============================================================ clutter + bounds
    L.killZone(-600, -60, -600, 900, -12, 900);
    L.postBuild = L.postBuild || [];
    autoClutter(L, { theme: 'industrial', density: 0.55, seed: 51, box: [APRON.x0, FAC_Z, APRON.x1, APRON.z1], yMin: -0.5, yMax: 1 });
    scatterClutter(L, [-20, 0, 8, 70, 1, 60], { density: 0.6, kinds: ['casings', 'papers', 'trash', 'rubble'], seed: 52 });
    scatterClutter(L, [LOUNGE.x0, DEP, LOUNGE.z0, LOUNGE.x1, DEP + 0.5, LOUNGE.z1], { density: 0.8, kinds: ['papers', 'trash', 'glass'], seed: 53 });
    L.da5 = S;
  },
  onStart(game) {
    game.voice.script([
      { who: 'louis', text: 'There it is — a real plane! With real engines!', d: 1.0 },
      { who: 'francis', text: 'It\'s a cargo plane. I hate cargo planes.', d: 3.8 },
      { who: 'zoey', text: 'Beggars, choosers, Francis.', d: 6.6 },
      { who: 'bill', text: 'Wall says the pilot\'s waiting on the tarmac. Let\'s not keep him.', d: 8.8 },
    ]);
  },
};
