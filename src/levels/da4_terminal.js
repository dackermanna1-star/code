// Dead Air 4 — The Terminal. Metro International, Terminal C: from the
// conference-centre office at the end of the skybridge (start safe room)
// through the conference wing, over the viewing balcony and down the grand
// stair into the check-in hall; the army's barricade to baggage claim falls to
// a hotwired airport shuttle (crescendo); baggage claim and the baggage
// handling maze; Security Checkpoint C with its live metal detector (alarm
// horde unless you go round through the security office or shoot it); the
// escalators up to Concourse C; the fire shutter forces a detour out of the
// C3 jet bridge, down to the burning apron (fighter flyover), round a wall of
// wreckage and back up the C4 bridge; past the SKYLINE CLUB (a Witch) to the
// safe room at gate C5 that overlooks the apron (chapter 5 starts there).
// Layout: da4_layout.js. Areas: da4_offices / lobby / van / baggage /
// security / concourse / apron.
import * as THREE from 'three';
import { autoClutter } from './clutter.js';
import { SkyLights, skyAircraft, airportLandmark, smokePlumes, cloudDeck, Flyer } from './da_parts.js';
import { installCuller } from './ch4_parts.js';
import { buildOffices } from './da4_offices.js';
import { buildLobby } from './da4_lobby.js';
import { buildVanEvent } from './da4_van.js';
import { buildBaggage } from './da4_baggage.js';
import { buildSecurity } from './da4_security.js';
import { buildConcourse } from './da4_concourse.js';
import { buildApron } from './da4_apron.js';
import { fighterModel } from './da4_parts.js';
import { YU, YD, START, SAFE, TOWER } from './da4_layout.js';

function skyAndTraffic(L, game) {
  const sky = new SkyLights(L, game, 420);
  airportLandmark(L, game, sky, TOWER.x, TOWER.z, { h: TOWER.h, runway: { x0: -420, x1: 560, z: -175 }, terminal: [230, -120, 380, -60] });
  for (let k = 0; k < 3; k++) {
    const R = 240 + k * 80, alt = 140 + k * 40, w = 0.028 - k * 0.006, ph = k * 2.1;
    skyAircraft(sky, (t) => { const a = t * w + ph; return { x: 40 + Math.cos(a) * R, y: alt + Math.sin(t * 0.1 + k) * 4, z: -160 + Math.sin(a) * R }; }, { scale: 0.8 });
  }
  const jetPath = (off) => (t) => { const k = ((t + off) % 52) / 52; return { x: -500 + k * 1100, y: 170 + Math.sin(k * 5) * 12, z: -420 + k * 260 }; };
  skyAircraft(sky, jetPath(0), { kind: 'jet' });
  skyAircraft(sky, jetPath(-1.4), { kind: 'jet' });
  const tr = [];
  for (let i = 0; i < 10; i++) tr.push(sky.add(0, -1e3, 0, [3, 1.4, 0.4], 0));
  sky.track({ update(t) { for (let i = 0; i < tr.length; i++) { const k = (t * 0.85 + i * 0.15) % 3.1; if (k > 1) { sky.hide(tr[i]); continue; } const bx = -300 + (i % 5) * 140, bz = 180 + (i % 3) * 50; sky.set(tr[i], bx + k * 40, 6 + k * 110, bz - k * 20, null, 3); } } });
  // runway approach + edge lights of the far runway, blue taxiway dots
  for (let x = -400; x < 560; x += 20) { sky.add(x, 0.4, -153, [2.4, 2.3, 2.0], 2.2); sky.add(x, 0.4, -197, [2.4, 2.3, 2.0], 2.2); }
  for (let x = -380; x < 540; x += 16) sky.add(x, 0.3, -122, [0.3, 0.5, 2.6], 1.8);
  smokePlumes(L, game, [[-220, 0, -260, 190, 20], [160, 0, -320, 170, 18], [-380, 0, 40, 160, 22], [300, 0, 120, 150, 16], [-38, 0, -134, 90, 8], [60, 0, 360, 170, 20]].map(([x, y, z, h, r]) => ({ x, y, z, h, r })), { per: 9, wind: [1, -0.35] });
  cloudDeck(L, game, { y: 185, r: 600, glow: 0x6a3e2a, dark: 0x1e181c });
  return sky;
}

// Two fighters scream low over the apron; a moment later something on the far side of the runway goes up.
function flyover(L, game, sky) {
  const jets = [0, 1].map(() => new Flyer(L, game, fighterModel(), { sky, light: { color: 0xffb070, intensity: 30, range: 50 }, audio: { vol: 3.2, ref: 55, whine: 320, whineVol: 0.08, hiss: 0.45 }, shake: 90 }));
  return () => {
    jets.forEach((j, i) => {
      const o = i * 26, t0 = i * 0.55;
      j.fly([
        { x: 260 + o, y: 150, z: 120 + o, t: 0 }, { x: 90 + o, y: 60, z: 10 + o * 0.5, t: 2.6 + t0 }, { x: 10 + o, y: 34 + i * 6, z: -70, t: 3.7 + t0 },
        { x: -90 + o, y: 46, z: -170, t: 4.9 + t0 }, { x: -360 + o, y: 140, z: -420, t: 8 + t0 },
      ], { onEnd: () => { j.obj.visible = false; } });
    });
    L.after(5.6, () => {
      const p = new THREE.Vector3(-150, 2, -205);
      game.fx.explosion(p.x, p.y, p.z, 5);
      L.after(0.2, () => game.fx.explosion(p.x + 30, p.y, p.z - 14, 4));
      const fl = L.light(p.x, 30, p.z, 0xffa050, 90, 260, { priority: 3, dynamic: true });
      let k = 1;
      L.dynamics.push({ update(dt) { if (k <= 0) return; k -= dt * 0.7; fl.intensity = Math.max(0, k) * 90; if (k <= 0) fl.on = false; } });
      L.after(0.55, () => { game.audio.play('explosion', { pos: new THREE.Vector3(-60, 4, -110), vol: 2.2, rate: 0.6 }); game.shake?.(0.35); });
    });
  };
}

const say = (game, lines) => game.voice.script(lines);

export default {
  id: 'terminal',
  title: 'The Terminal',
  def: {
    director: {
      wanderers: 22, mobInterval: [85, 135], mobSize: [12, 18], specials: ['hunter', 'smoker', 'boomer'], maxSpecials: 3, specialInterval: [22, 36],
      tank: 0.6, tankAt: 0.74, witches: 0, relax: [25, 40], outfit: 'civilian',
    },
    navCell: 0.5,
  },
  build(L, game) {
    L.env = Object.assign(L.env, {
      fog: 0x1a1618, fogDensity: 0.0105, hemiSky: 0x4a4658, hemiGround: 0x2c2018, hemiIntensity: 0.4, envIntensity: 0.11,
      moon: { dir: [-0.35, 1, -0.45], intensity: 0.26, color: 0xc09070 }, exposure: 1.16, reverb: 'hall', ambience: 'city',
      skyOpts: { hospitalAz: null, moon: false, fires: 22, zenith: '#060609', mid: '#18121a', glow: '#5a2e1e', ground: '#0c0a0a', rotation: 1.9 },
    });
    L.menuCam = { x: 60, y: YD + 1.7, z: -30, yaw: 1.2, pitch: -0.02 };
    const S = { game };
    buildOffices(L, game, S);
    buildLobby(L, game, S);
    const van = buildVanEvent(L, game, S);
    buildBaggage(L, game, S);
    buildSecurity(L, game, S);
    buildConcourse(L, game, S);
    buildApron(L, game, S);
    const sky = skyAndTraffic(L, game);
    const fly = flyover(L, game, sky);
    // floor litter / grime (runs after the nav grid exists)
    for (const [theme, box, density, yMin, yMax] of [
      ['office', [2, 0, 30, 46], 1.0, YU - 0.5, YU + 1], ['city', [30, 0, 100, 44], 1.1, -0.5, 1], ['office', [30, 0, 64, 6], 0.9, YU - 0.5, YU + 1],
      ['city', [100, 0, 136, 44], 1.0, -0.5, 1], ['industrial', [100, -36, 144, 0], 1.0, -0.5, 1], ['city', [52, -34, 100, 0], 1.1, -0.5, 1],
      ['city', [-50, -42, 52, -4], 1.0, YD - 0.5, YD + 1], ['industrial', [-40, -84, 16, -42], 1.1, -0.5, 1],
    ]) autoClutter(L, { theme, box, density, seed: 400 + box[0] + box[1], yMin, yMax });
    L.killZone(-500, -40, -500, 700, -12, 500);
    L.da4Culler = installCuller(L, game, { band: 10, dist: 70 });
    L.da4 = { S, van, sky };

    // ------------------------------------------------------------ script
    const d = game.director;
    const once = (box, fn) => box && L.trigger(...box, fn);
    once(S.receptionTrigger, () => say(game, [
      { who: 'zoey', text: 'Look — you can see the whole check-in hall from here.', d: 0.3 },
      { who: 'francis', text: 'I can see a whole lotta dead people in it.', d: 2.6 },
    ]));
    once(S.blockTrigger, () => say(game, [{ who: 'bill', text: 'Corridor\'s barricaded. Cut through the meeting rooms.', d: 0.3 }]));
    once(S.whiteboardTrigger, () => {
      say(game, [
        { who: 'louis', text: '"Military evacuation flights — Concourse C." It\'s on the whiteboard!', d: 0.3 },
        { who: 'zoey', text: 'Then Concourse C it is.', d: 3.2 },
      ]);
      game.session.objective('Get down to the terminal');
    });
    once(S.balconyTrigger, () => {
      say(game, [{ who: 'francis', text: 'Big room. Lotta places for things to hide.', d: 0.4 }]);
      L.after(4, () => d.spawnMob(10, { where: 'ahead', minD: 14, maxD: 40 }));
    });
    once(S.stairTrigger, () => say(game, [{ who: 'bill', text: 'Down the stairs. Stay tight.', d: 0.3 }]));
    once(S.triageTrigger, () => say(game, [
      { who: 'zoey', text: 'CEDA triage. Didn\'t go so well.', d: 0.3 },
      { who: 'louis', text: 'Nobody here got a boarding pass.', d: 2.4 },
    ]));
    once(S.bagTrigger, () => {
      say(game, [{ who: 'louis', text: 'Conveyor maze. Watch the corners.', d: 0.3 }]);
      if (Math.random() < 0.7) d.spawnSpecial(Math.random() < 0.5 ? 'smoker' : 'hunter', { where: 'ahead' });
    });
    once(S.bagExitTrigger, () => game.session.objective('Get through the security checkpoint'));
    once(S.secTrigger, () => say(game, [
      { who: 'bill', text: 'Security checkpoint. Army closed the first two lanes.', d: 0.3 },
      { who: 'louis', text: 'Lane three\'s still got power. That detector\'s gonna scream if we walk through with all this hardware.', d: 2.6 },
      { who: 'zoey', text: 'Security office has a door on both sides. Or we shoot the thing.', d: 6.6 },
    ]));
    once(S.atriumTrigger, () => {
      game.session.objective('Take the escalators up to the gates');
      say(game, [{ who: 'francis', text: 'Escalators. Stopped. Figures.', d: 0.4 }]);
    });
    once(S.escTrigger, () => {
      game.session.objective('Get to gate C5');
      say(game, [{ who: 'bill', text: 'Departure level. Military gates are down at the far end.', d: 0.3 }]);
      L.after(6, () => d.spawnMob(12, { where: 'ahead', minD: 16, maxD: 45 }));
    });
    once(S.gateTriggerC3, () => { if (Math.random() < 0.6) d.spawnSpecial('boomer', { where: 'ahead' }); });
    once(S.shutterTrigger, () => {
      game.session.objective('Go around: take the C3 jet bridge down to the tarmac');
      say(game, [
        { who: 'bill', text: 'Fire door\'s down. Jammed tight.', d: 0.3 },
        { who: 'louis', text: 'Jet bridge at C3 has a service stair! Down to the tarmac, back up at C4!', d: 2.4 },
        { who: 'francis', text: 'Outside. Great. I love outside.', d: 6.0 },
      ]);
    });
    once(S.apronTrigger, () => {
      game.session.objective('Get around the fire to the C4 jet bridge');
      fly();
      say(game, [
        { who: 'zoey', text: 'Jets! Get down!', d: 2.4 },
        { who: 'francis', text: 'Who are they bombing?!', d: 6.8 },
        { who: 'bill', text: 'Doesn\'t matter. They\'re not landing here. Move!', d: 8.8 },
      ]);
      L.after(9, () => d.spawnMob(14, { where: 'any', minD: 16, maxD: 45 }));
    });
    once(S.loopTrigger, () => say(game, [{ who: 'louis', text: 'Around the fire — C4 stairs, over there!', d: 0.3 }]));
    once(S.c4StairTrigger, () => say(game, [{ who: 'zoey', text: 'Up the stairs, back inside!', d: 0.2 }]));
    once(S.westTrigger, () => {
      game.session.objective('Get to the safe room at gate C5');
      if (S.witch && !S.witchSpawned) { S.witchSpawned = true; const w = d.spawnWitchAt(S.witch.x, S.witch.y, S.witch.z); if (w) w.yaw = Math.PI * 0.5; }
      L.after(3.5, () => say(game, [
        { who: 'louis', text: 'Hear that? ...Somebody crying.', d: 0 },
        { who: 'bill', text: 'Witch. In that fancy lounge. Lights off, walk soft.', d: 2.4 },
      ]));
    });
    once(S.c5Trigger, () => say(game, [
      { who: 'zoey', text: 'Safe room! Gate C5!', d: 0.2 },
      { who: 'francis', text: 'I love safe rooms.', d: 2.0 },
    ]));

    L.script = {
      start() {
        van.scriptStart?.();
        d.cfg.noSpawnBoxes = (d.cfg.noSpawnBoxes || []).concat([
          [START.x0 - 1, YU - 1, START.z0 - 1, START.x1 + 1, YU + 4, START.z1 + 1],
          [SAFE.x0 - 1, YD - 1, SAFE.z0 - 1, SAFE.x1 + 1, YD + 4, SAFE.z1 + 1],
        ]);
        L.after(1.2, () => game.session.objective('Find a way into the terminal'));
      },
      update(dt) {},
    };
  },
  onStart(game) {
    game.voice.script([
      { who: 'louis', text: 'Conference center, huh? Fancy.', d: 1.5 },
      { who: 'bill', text: 'Terminal\'s right below us. Gates, planes, maybe a pilot.', d: 3.8 },
      { who: 'zoey', text: 'Maybe a pilot. Let\'s go find out.', d: 7.4 },
    ]);
  },
};
