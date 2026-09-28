// Dead Air — Chapter 1: THE GREENHOUSE
// Back room of a rooftop greenhouse -> the greenhouse (grow benches, dead
// beds, magenta grow lights, broken glass) -> an airliner roars in low over
// the roofs toward Metro International (red tower beacon in the east) ->
// plank bridge over the alley (horde bursts out of the stair bulkhead, a
// Smoker perches above) -> down Stair B into the 5th floor: a Witch sobbing
// in front of an emergency broadcast, the corridor on fire, a burned-through
// apartment floor -> drop to the 4th floor (a boarded door bursts) -> fire
// escape onto The Anchor's rooftop bar, a crashed Sky 9 news helicopter
// cooking off -> Sterling Mutual's office -> out the smashed window onto a
// semi-trailer -> Harbor Street (car alarm, quarantine roadblock, a possible
// Tank) -> the Harborview Hotel's loading dock -> service corridor -> the
// kitchen safe room.
//
// Geometry: da1_roofs.js (A + greenhouse + plank + B roof/stair), da1_block.js
// (B floors, fire escape, C roof, D office), da1_street.js (street, hotel,
// backdrop), da1_sky.js (city ring, airport landmark, air traffic, smoke).
import * as THREE from 'three';
import { buildRoofs, GH, SHAFT } from './da1_roofs.js';
import { buildBlock } from './da1_block.js';
import { buildStreetAndHotel } from './da1_street.js';
import { buildSky } from './da1_sky.js';
import { YA, F4, F3, YC, HY } from './da1_common.js';

// helper: survivor voice by name if alive
const who = (game, id) => game.survivors.find((s) => s.char.id === id && !s.dead);

export default {
  id: 'greenhouse',
  title: 'The Greenhouse',
  def: {
    director: {
      wanderers: 18, mobInterval: [75, 120], mobSize: [12, 18], specials: ['hunter', 'smoker', 'boomer'], maxSpecials: 2, specialInterval: [24, 40],
      tank: 0.35, tankAt: 0.84, witches: 0.5, relax: [25, 40], outfit: 'civilian',
    },
    navCell: 0.5,
  },
  build(L, game) {
    L.env = Object.assign(L.env, {
      fog: 0x1e1719, fogDensity: 0.0095, hemiSky: 0x50485c, hemiGround: 0x2e1c14, hemiIntensity: 0.46, envIntensity: 0.13,
      moon: { dir: [-0.45, 1, 0.3], intensity: 0.32, color: 0xc09070 }, exposure: 1.18, reverb: 'outdoor', ambience: 'rooftop',
      skyOpts: { hospitalAz: null, moon: false, fires: 20, zenith: '#060609', mid: '#18121a', glow: '#5a2e1e', ground: '#0c0a0a', rotation: 0.6 },
    });
    L.menuCam = { x: 33.5, y: YA + 2.2, z: 42.5, yaw: 2.35, pitch: -0.12 };
    const S = {};
    L.da1 = S; // test / debug handle
    buildRoofs(L, game, S);
    buildBlock(L, game, S);
    buildStreetAndHotel(L, game, S);
    buildSky(L, game, S);
    L.witchSpots.push({ x: 68.3, y: YC + 0.04, z: 18.4 }, { x: 70.5, y: 0.15, z: 61 }, { x: 121, y: HY, z: 76.8 });
    L.killZone(-400, -60, -400, 600, -25, 600);

    // ------------------------------------------------------------ script
    const say = (lines) => game.voice.script(lines);
    const obj = (t) => game.session.objective(t);
    const trig = (box, fn, o) => L.trigger(box[0], box[1], box[2], box[3], box[4], box[5], fn, o);
    const nodesIn = (list) => {
      const nav = L.nav, out = [];
      for (const [x, y, z] of list) { const n = nav.nearestNode(x, y, z, 1.5); if (n >= 0 && Math.abs(nav.nodeY[n] - y) < 0.8) out.push(n); }
      return out;
    };
    const st = { plane: false, witch: null, planeT: 0 };
    S.state = st;
    const lowPass = () => {
      if (st.plane) return;
      st.plane = true;
      S.lowPass(() => {
        game.audio.play('explosion', { vol: 0.25, rate: 0.5 });
        L.after(1.6, () => say([
          { who: 'zoey', text: 'Whoa! A plane — it\'s coming in to land!', d: 0 },
          { who: 'louis', text: 'Metro International! See that red light way out east? That\'s the control tower!', d: 2.6 },
          { who: 'francis', text: 'A flying tin can full of sick people. I hate planes.', d: 6.4 },
          { who: 'bill', text: 'If they\'re still landing there, they\'re still taking off. We head for the airport.', d: 9.2 },
        ]));
        L.after(12, () => obj('Head east across the rooftops'));
      });
    };
    L.script = {
      start() {
        L.after(1.0, () => obj('Gear up and leave the greenhouse'));
        if (S.startDoor) S.startDoor.onOpen = () => L.after(0.8, lowPass);
        L.after(28, lowPass);
        trig([GH.x0 + 1, YA - 0.5, GH.z0, GH.x1, YA + 3, GH.z1], () => L.after(0.5, lowPass));
        // out of the greenhouse: the plank
        trig([GH.x1, YA - 0.5, 24, 31.6, YA + 3, 34], () => say([
          { who: 'louis', text: 'Somebody laid a plank across to the next roof!', d: 0 },
          { who: 'bill', text: 'One at a time. And don\'t look down.', d: 2.4 },
        ]));
        // ---- plank crossing: the bulkhead bursts, a horde from both roofs, a Smoker
        trig(S.plankTrigger, () => {
          const d = game.director;
          const shaftNodes = nodesIn([[41.5, YA, 25.5], [40.3, YA, 25.5], [42.6, 17.1, 22.3], [40.3, 16.2, 19.8], [42.6, 16.2, 19.8], [40.3, 15.3, 22.3]]);
          const bRoof = nodesIn([[60, YA, 30], [62, YA, 34], [55, YA, 36], [63, YA, 41]]);
          const aRoof = nodesIn([[14, YA, 17.5], [22, YA, 17.2], [6, YA, 38], [4, YA, 42]]);
          L.after(1.2, () => {
            const door = S.bulkDoor;
            if (door && !door.broken) {
              if (door.open) door.use(game.player);
              L.after(0.35, () => {
                door.breakDoor(null);
                game.fx.dust(43.9, YA + 1.2, 25.3, 1, 0.2, 0, [0.6, 0.58, 0.55], 12, 0.8);
                if (game.player.pos.distanceTo(new THREE.Vector3(43.9, YA, 25.3)) < 20) game.shake(0.4);
              });
            }
            d.panic('plank', { waves: 2, size: [9, 13], interval: 13, nodes: [...shaftNodes, ...shaftNodes, ...bRoof, ...aRoof], force: true, minD: 6, maxD: 60 });
            if (Math.random() < 0.65) {
              const perch = nodesIn([[41.5, YA + 3.25, 20], [41.5, YA + 3.25, 23]]);
              if (perch.length) L.after(4, () => d.spawnSpecial('smoker', { node: perch[0] }));
            }
            say([{ who: 'francis', text: 'The stairwell! They\'re pouring out of the stairwell!', d: 0.6 }, { who: 'zoey', text: 'Behind us too — they\'re climbing up!', d: 4.2 }]);
          });
          // the Witch settles in front of the TV downstairs
          if (!st.witch) { st.witch = d.spawnWitchAt(S.witchSpot[0], S.witchSpot[1], S.witchSpot[2]); if (st.witch) st.witch.yaw = 0; }
        });
        trig([SHAFT.x0, YA - 0.5, 23.8, SHAFT.x1, YA + 3, SHAFT.z1], () => obj('Get down through the apartment building'));
        // ---- 5th floor: the Witch + TV, the burning hall, the burned floor
        trig([41.4, F4 - 0.3, 27.2, 46.5, F4 + 3, 29.2], () => {
          const w = st.witch;
          if (w && !w.dead && !w.enraged) say([
            { who: 'zoey', text: 'Shh — hear that? Crying... There\'s a Witch in 5A.', d: 0 },
            { who: 'bill', text: 'Kill your lights and keep walking. Nobody say a word.', d: 3.0 },
            { who: 'louis', text: '(whispering) That TV\'s still on — evacuation flights out of Metro International...', d: 6.6 },
          ]);
          else say([{ who: 'louis', text: 'TV in there\'s still going — emergency broadcast. Flights out of Metro International!', d: 0.4 }]);
        });
        trig([50.2, F4 - 0.3, 27.2, 58.7, F4 + 3, 29.2], () => say([{ who: 'bill', text: 'Hall\'s on fire. Cut through that apartment — 5D.', d: 0 }]));
        trig(S.holeTrigger, () => say([
          { who: 'louis', text: 'The whole floor\'s burned through!', d: 0 },
          { who: 'bill', text: 'Then that\'s our way down. Jump!', d: 1.8 },
        ]));
        // ---- 4th floor: the door that bursts
        trig(S.burstTrigger, () => {
          const d = game.director;
          const [x0, y, z0, x1, , z1] = S.burstRoom;
          const nav = L.nav;
          const inside = [];
          for (let x = x0 + 0.5; x < x1; x += 1.6) for (let z = z0 + 0.5; z < z1; z += 1.6) { const n = nav.nodeAt(x, y, z); if (n >= 0 && Math.abs(nav.nodeY[n] - y) < 0.5) inside.push(n); }
          const n = Math.round(8 * (game.difficulty.hordeMul ?? 1));
          for (let i = 0; i < n && inside.length; i++) d.queueCommons(inside[Math.floor(Math.random() * inside.length)], 1, { chase: true, horde: true });
          game.audio.play('doorBang', { pos: new THREE.Vector3(60.5, F3 + 1.1, 27.1), vol: 1.2 });
          L.after(0.5, () => game.audio.play('doorBang', { pos: new THREE.Vector3(60.5, F3 + 1.1, 27.1), vol: 1.3 }));
          L.after(1.1, () => {
            const door = S.burstDoor;
            if (door && !door.broken) { door.breakDoor(null); game.fx.dust(60.5, F3 + 1.2, 27.3, 0, 0.2, 1, [0.55, 0.5, 0.45], 10, 0.7); game.shake(0.35); }
            game.audio.music?.stinger?.('hordeIncoming');
          });
          say([{ who: 'francis', text: 'That door!', d: 0.4 }, { who: 'zoey', text: 'I guess "dead inside" meant literally.', d: 4.5 }]);
        });
        // ---- fire escape: first sight of the hotel
        trig(S.fireEscTrigger, () => {
          obj('Get to the Harborview Hotel across the street');
          say([
            { who: 'louis', text: 'Fire escape! And look — the Harborview, right across the street!', d: 0.2 },
            { who: 'bill', text: 'Big hotel, thick walls. Good place to catch our breath.', d: 3.2 },
          ]);
        });
        // ---- the crashed news chopper cooks off
        trig(S.cRoofTrigger, () => {
          const [x, y, z] = S.chopper;
          L.after(1.6, () => {
            const p = new THREE.Vector3(x + 0.6, y + 1.6, z + 0.4);
            game.fx.explosion(p.x, p.y, p.z, 1.3);
            game.audio.play('explosion', { pos: p, vol: 1.2 });
            if (game.camPos.distanceTo(p) < 25) game.shake(0.7);
            const fl = L.light(p.x, p.y + 2, p.z, 0xff8030, 60, 30, { priority: 3 });
            let k = 1.2;
            L.dynamics.push({ update(dt) { if (k <= 0) return; k -= dt; fl.intensity = Math.max(0, k) * 50; if (k <= 0) fl.on = false; } });
            for (let i = 0; i < 4; i++) game.fx.sparks(p.x, p.y + 1, p.z, (Math.random() - 0.5), 1, (Math.random() - 0.5), 30, [1, 0.6, 0.3], 10);
          });
          say([
            { who: 'zoey', text: 'That\'s the Sky 9 chopper... I watched them all week. They kept saying help was coming.', d: 3.4 },
            { who: 'francis', text: 'Guess the news finally caught up with them.', d: 8.2 },
          ]);
        });
        // ---- office
        trig(S.officeTrigger, () => say([{ who: 'louis', text: 'Same broadcast on the office TV. Flights out of Gate C — they\'re still evacuating!', d: 0.3 }]));
        trig(S.loungeTrigger, () => {
          say([
            { who: 'zoey', text: 'Truck! There\'s a truck right under that window!', d: 0 },
            { who: 'bill', text: 'Drop onto the trailer, then the street. Move it!', d: 2.4 },
          ]);
          const nodes = nodesIn(S.officeHordeNodes);
          L.after(4, () => { if (nodes.length) game.director.spawnMob(12, { nodes, where: 'behind' }); });
        });
        trig(S.streetTrigger, () => {
          obj('Get into the hotel through the service entrance');
          say([{ who: 'louis', text: 'Front\'s barricaded! Service entrance — the loading dock, down the street!', d: 0.6 }]);
        });
        trig(S.dockTrigger, () => say([{ who: 'bill', text: 'Kitchen\'s in the back. Hotels this old always have a safe room by the kitchen.', d: 0 }]));
        trig(S.kitchenTrigger, () => {
          obj('Get inside the kitchen safe room and close the door');
          say([
            { who: 'francis', text: 'A kitchen. If there\'s any food left, it\'s mine.', d: 0.6 },
            { who: 'zoey', text: 'Francis, whoever ate here last is probably chasing us.', d: 3.6 },
          ]);
        });
      },
    };
  },
  onStart(game) {
    game.voice.script([
      { who: 'bill', text: 'Everybody grab a gun and fill your pockets. We are not coming back up here.', d: 0.6 },
      { who: 'louis', text: 'Pipe bombs, molotovs... whoever stocked this greenhouse was expecting company.', d: 4.2 },
    ]);
  },
};
