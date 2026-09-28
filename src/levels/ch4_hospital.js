// Chapter 4 — THE HOSPITAL
// Mercy Hospital, ground floor to the 29th floor. Start in the lobby security
// office (safe room) -> marble atrium -> ER / military triage -> radiology ->
// stair A -> 2F ward (collapsed hall, detour through patient rooms) -> atrium
// balcony -> ICU -> stair B -> 3F surgery (detour through the O.R.s), labs,
// pharmacy, isolation ward, dark boiler plant -> stair C -> 4F administration
// -> ELEVATOR CRESCENDO (walls burst, vents open, ~76 s) -> elevator ride
// (teleport into the identical car at 28F) -> construction floors open to the
// burning city, scaffold walk outside the tower -> 29F safe room under the roof.
//
// Geometry lives in ch4_lower.js (1F-3F + 4F offices), ch4_elevator.js (4F
// elevator lobby, both cars, crescendo/ride controller), ch4_upper.js (tower,
// 28F/29F, crane, city) and ch4_parts.js (shared modules).
import * as THREE from 'three';
import { buildLower } from './ch4_lower.js';
import { buildElevatorLobby, buildUpperCar, elevatorController, CAR, LOW_Y, TOP_Y } from './ch4_elevator.js';
import { buildUpper } from './ch4_upper.js';
import { installCuller } from './ch4_parts.js';
import { Helicopter } from './helicopter.js';

// Link the two elevator cars in the nav graph so the distance fields (chapter
// progress, bot exit-seeking, director "ahead/behind") flow through the shaft.
// A redundant diagonal slot of one node in each car is repointed at the other
// car; reverse adjacency + static fields are then rebuilt.
function linkElevator(L) {
  const nav = L.nav;
  if (!nav || !nav.links) return false;
  const a = nav.nodeAt(CAR.cx, LOW_Y, CAR.cz), b = nav.nodeAt(CAR.cx, TOP_Y, CAR.cz);
  if (a < 0 || b < 0) { console.warn('[ch4] elevator nav nodes missing', a, b); return false; }
  nav.links[a * 8 + 4] = b; nav.ltype[a * 8 + 4] = 0;
  nav.links[b * 8 + 4] = a; nav.ltype[b * 8 + 4] = 0;
  nav.revStart = null;
  nav.buildReverse();
  nav.computeStatic('fromStart', [L.flowStart], { survivor: false });
  nav.computeStatic('toExit', [L.flowEnd]);
  return true;
}

const NO_SPAWN_BEFORE = [
  [36, 11, 24, 42, 15, 30.4], // west breach room
  [66, 11, 24, 72, 15, 30.4], // east breach room
  [42, 15.3, 24, 66, 18.5, 42.2], // vent plenum
  [52, 11, 20, 56, 15, 24], // lower car
  [28, 100, -8, 92, 130, 50], // the whole tower top (until the ride)
];
const NO_SPAWN_AFTER = [
  [-8, -5, -8, 104, 20, 70], // the lower hospital
  [52, 107, 20, 56, 111, 24], // upper car
];

export default {
  id: 'hospital',
  title: 'The Hospital',
  def: {
    // (getter: a fresh Tank position is rolled each time the director resets;
    // kept away from the elevator crescendo at progress ~0.74-0.80)
    get director() {
      const tankAt = Math.random() < 0.65 ? 0.3 + Math.random() * 0.36 : 0.83 + Math.random() * 0.1;
      return { wanderers: 26, mobInterval: [65, 110], mobSize: [14, 22], tank: 0.5, tankAt, witches: 1.5, outfit: 'hospital', maxSpecials: 3, relax: [25, 45], noSpawnBoxes: NO_SPAWN_BEFORE };
    },
    navCell: 0.5,
  },
  build(L, game) {
    L.env = Object.assign(L.env, {
      fog: 0x0b0d10, fogDensity: 0.02, hemiSky: 0x3a4250, hemiGround: 0x1a1816, hemiIntensity: 0.4, envIntensity: 0.11,
      exposure: 1.12, reverb: 'room', ambience: 'hospital',
      skyOpts: { hospitalAz: null, moonAz: 0.3, fires: 18, rotation: 0.2 },
    });
    const S = { noSpawnAfter: NO_SPAWN_AFTER };
    buildLower(L, game, S);
    buildElevatorLobby(L, game, S);
    buildUpperCar(L, game, S);
    buildUpper(L, game, S);
    const E = elevatorController(L, game, S);
    const heli = new Helicopter(game, { color: 0x2a3424, stripe: 0x3a4430 });
    L.dynamics.push(heli);

    // entering the elevator lobby
    L.trigger(42.2, LOW_Y, 24.2, 65.8, LOW_Y + 3, 35.8, () => {
      if (E.state !== 'idle') return;
      game.session.objective('Call the elevator');
      game.voice.script('ch4Elevator');
    }, { name: 'ch4lobby' });
    L.trigger(36, LOW_Y, 30.4, 42, LOW_Y + 3, 34.4, () => game.voice.script([{ who: 'zoey', text: 'Elevators! Right through here.', d: 0 }, { who: 'louis', text: 'Stock up first. Once that thing starts moving, everything in this building hears it.', d: 2.2 }]));

    // switch the atmosphere when the survivors come out on top of the tower
    S.onTop = () => {
      const g = game;
      g.scene.fog.color.set(0x1c1a1e); g.scene.fog.density = 0.0062;
      g.hemi.intensity = 0.46; g.hemi.color.set(0x4a5270); g.hemi.groundColor.set(0x2a1e18);
      g.moon.intensity = 0.42; g.moon.color.set(0x8a9ac8); g.moonDir = new THREE.Vector3(-0.35, 1, 0.55).normalize();
      g.renderer.r.toneMappingExposure = 1.18;
      L.env.reverb = 'outdoor'; L.env.ambience = 'rooftop';
    };
    S.onTopOpen = () => {
      game.session.objective('Find the safe room');
      game.voice.script([
        { who: 'zoey', text: 'Oh my God. Look at the city...', d: 0.8 },
        { who: 'bill', text: 'Don\'t sightsee. Stairs to the roof are up here somewhere.', d: 3.4 },
      ]);
      L.after(7, () => {
        heli.fly([{ x: -160, y: 150, z: 180, t: 0 }, { x: -20, y: 132, z: 90, t: 9 }, { x: 110, y: 138, z: 40, t: 17 }, { x: 260, y: 160, z: -120, t: 28 }], { hideAtEnd: true });
        heli.setSearchlight(true);
        L.after(6, () => game.voice.script([{ who: 'louis', text: 'Chopper! HEY! Down here!', d: 0 }, { who: 'francis', text: 'It\'s not stopping. It never stops.', d: 2.4 }]));
      });
    };

    L.script = {
      start() {
        linkElevator(L);
        L.ch4.culler = installCuller(L, game);
        L.after(1.2, () => game.session.objective('Find the elevator'));
      },
      update(dt) {
        E.update(dt);
      },
      // co-op clients: nav link (for progress) + draw-call culler only
      clientStart() {
        linkElevator(L);
        L.ch4.culler = installCuller(L, game);
      },
    };
    L.ch4 = { S, E }; // test / debug handle
  },
  onStart(game) {
    game.voice.script('ch4Start');
  },
};
