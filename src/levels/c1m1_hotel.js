// Chapter 1: HOTEL. Rooftop -> 8th floor (CEDA suite, flare-up, ledge walk) -> 7th floor (burning)
// -> elevator ride -> burning ground floor crescendo -> kitchen -> restaurant -> lobby -> safe room.
// Original layout inspired by the beats of the original chapter; names and signage invented.
import * as THREE from 'three';
import { prop } from './props.js';
import { MeshKit } from '../engine/meshkit.js';
import { createPS1Material } from '../engine/ps1material.js';
import { DynamicBox, SURF } from '../engine/collision.js';
import { charAtlas } from '../game/rig.js';
import { spawnFire, FireArea } from '../game/items.js';
import { LevelBuilder } from '../engine/levelbuilder.js';
import { tex } from '../engine/textures.js';
import { hotelRoom, stairCore, P, wallSeg, skylineRing, cityBlocks, gatherZone, smokeEmitter } from './common.js';

const Y0 = 0, Y7 = 20.4, Y8 = 23.8, YR = 27.2, H = 3.0;
const CAR = { x0: 34.2, x1: 36.8, z0: 8, z1: 10.6 };

export default {
  id: 'c1m1_hotel', name: 'Hotel', chapter: 1, tagline: 'The last chopper just left without you.',
  env: { fog: 0x5a4a3c, fogNear: 18, fogFar: 110, clear: 0x8a6a4a, sky: { top: 0x2a2c3a, horizon: 0xc0844c, bottom: 0x4a3a2c } },
  builderOpts: {
    ambientSky: 0x34302c, ambientGround: 0x1c1a16, minLight: 0x221e1a,
    sun: { dir: [-0.62, 0.42, 0.3], color: new THREE.Color(1.0, 0.72, 0.42) },
    skyRays: 6, skyColor: 0xb8a088,
  },
  music: 'explore_hotel',
  director: { variant: 'hotel', hazmatChance: 0.15, wanderers: 12, bosses: [], specials: ['boomer', 'hunter', 'smoker', 'charger', 'jockey', 'spitter'] },
  virtualLinks: [{ from: [35.5, Y7, 9.3], to: [35.5, Y0, 9.3], cost: 5 }],
  // camera viewpoints for automated screenshot tours: [name, x, y, z, yaw, pitch]
  tour: [
    ['roof_start', 27, YR, -21, Math.PI, 0.05], ['roof_west', 12, YR, 18.5, Math.PI / 2, 0], ['stair_s1', 4.6, YR, 20.3, Math.PI, -0.5],
    ['corridor_a', 7.5, Y8, 19.7, -Math.PI / 2, 0], ['ceda_suite', 15.5, Y8, 25.3, 0, -0.05], ['junction', 29, Y8, 24, -Math.PI / 2 - 0.4, 0],
    ['corridor_b_fire', 29.1, Y8, 11, 0, 0], ['laundry', 31.2, Y8, 9.6, -Math.PI / 2 - 0.5, 0], ['ledge', 34.6, Y8, 7.5, 0, -0.1],
    ['corridor_c', 29.1, Y7, -18.5, Math.PI, 0], ['lounge', 23.5, Y7, 9, -Math.PI / 2, 0], ['elevator', 36.3, Y7, 9.3, Math.PI / 2, 0],
    ['ground_service', 33.4, Y0, 9.3, Math.PI / 2, 0], ['security', 32.3, Y0, 5.8, Math.PI / 2 + 0.3, -0.1], ['kitchen', 19.5, Y0, 9.3, Math.PI / 2, 0],
    ['restaurant', 7, Y0, 5, Math.PI / 2 + 0.3, 0], ['lobby', 4, Y0, -7.5, 0.2, 0.05], ['hallway', 20.5, Y0, -25.8, -Math.PI / 2, 0], ['saferoom', 29.6, Y0, -25.6, -Math.PI / 2, 0],
  ],
  routeCheck: [
    ['roof start', 27, YR, -20], ['roof west', 9, YR, 19.7], ['S1 top landing', 4.5, YR, 20.4], ['S1 mid landing', 3, (YR + Y8) / 2, 14.5],
    ['S1 bottom', 3, Y8, 20.4], ['corridor A', 10, Y8, 19.7], ['junction', 31, Y8, 19.7], ['corridor B north', 29.1, Y8, 8], ['laundry', 32, Y8, 7.3],
    ['ledge', 34.5, Y8, 5], ['ledge south', 34.5, Y8, -7.3], ['room 816', 33.3, Y8, -9.6], ['corridor B south', 29.1, Y8, -15], ['S2 top', 28.5, Y8, -21],
    ['S2 mid', 23.5, (Y8 + Y7) / 2, -23], ['S2 bottom', 28.5, Y7, -24.5], ['corridor C', 29.1, Y7, -10], ['lounge', 28, Y7, 11], ['car up', 35.5, Y7, 9.3],
    ['car down', 35.5, Y0, 9.3], ['service corridor', 28, Y0, 9.2], ['kitchen east', 17, Y0, 7], ['kitchen west', 10, Y0, 7], ['restaurant', -3, Y0, 4],
    ['lobby', 3, Y0, -18], ['hallway', 24, Y0, -25.8], ['saferoom', 33, Y0, -25.5],
  ],
  intro: [
    { who: 0, text: 'Hey! HEY! Down here! We\'re right here!', delay: 1.2 },
    { who: 1, text: 'They\'re not turning around.', delay: 4.2 },
    { who: 3, text: 'That was the last bird out. Where\'s it heading?', delay: 7 },
    { who: 2, text: 'News said there\'s another evac center. The mall, across town.', delay: 10 },
    { who: 0, text: 'Then that\'s where we\'re going. Grab what you can off that table.', delay: 13.5 },
    { who: 1, text: 'I don\'t like the sounds coming from downstairs.', delay: 17 },
  ],

  build(L) {
    const A = this;
    // ---------------------------------------------------------------- materials
    L.defMat('facade', { tex: ['facade', { color: 0xa89474, cols: 2, rows: 1, lit: 0.05, burnt: 0.25 }], scale: 3.4, surf: SURF.CONCRETE });
    L.defMat('facadeFar', { tex: ['facade', { color: 0x7a6a5a, cols: 3, rows: 3, lit: 0.1, burnt: 0.15 }], scale: 9, surf: SURF.CONCRETE });
    L.defMat('facadeFar2', { tex: ['facade', { color: 0x8a7a6a, cols: 2, rows: 3, lit: 0.08, burnt: 0.1 }], scale: 8, surf: SURF.CONCRETE });
    L.defMat('hallPaper', { tex: ['wallpaper', { color: 0xb8a078, stripe: 0x8a7050 }], scale: 2, surf: SURF.CONCRETE });
    L.defMat('roomPaper', { tex: ['wallpaper', { color: 0x9aa088, stripe: 0x7a8068 }], scale: 2, surf: SURF.CONCRETE });
    L.defMat('suitePaper', { tex: ['wallpaper', { color: 0x8a4a3a, stripe: 0x6a3226 }], scale: 2, surf: SURF.CONCRETE });
    L.defMat('sootPaper', { tex: ['wallpaper', { color: 0x4a3c30, stripe: 0x2a2018 }], scale: 2, surf: SURF.CONCRETE });
    L.defMat('sootCarpet', { tex: ['carpet', { color: 0x3a1a16, accent: 0x4a3a2a }], scale: 2, surf: SURF.CARPET });
    L.defMat('kitchenTile', { tex: ['tile', { color: 0xc8c0b0, n: 8 }], scale: 1.2, surf: SURF.TILE });
    L.defMat('lobbyFloor', { tex: ['marble', { color: 0xc8b898 }], scale: 2.5, surf: SURF.TILE });
    L.defMat('whitePlaster', { tex: ['plaster', { color: 0xd8d4c8 }], scale: 3, surf: SURF.CONCRETE });
    L.defMat('stairConcrete', { tex: ['concrete', { color: 0x8a8478 }], scale: 2, surf: SURF.CONCRETE });
    L.defMat('steelDoor', { tex: ['metal', { color: 0xa8acb0 }], scale: 1.5, surf: SURF.METAL });
    L.defMat('elevWall', { tex: ['metal', { color: 0x8a7a5a }], scale: 1.2, surf: SURF.METAL });
    L.defMat('helipad', { tex: ['concrete', { color: 0x5a5a58 }], scale: 4, surf: SURF.CONCRETE });
    L.defMat('lobbyWall', { tex: ['wallpaper', { color: 0xc8b08a, stripe: 0xa08a60 }], scale: 2.4, surf: SURF.CONCRETE });

    // ================================================================= ROOF (YR)
    // roof slab over the whole building (north wing + east wing)
    L.slab(0, 13.2, 34, 26, YR, 0.4, 'roof', 'ceiling', { holes: [[0, 13.5, 6, 21.1]] });
    L.slab(22, -26, 34, 13.2, YR, 0.4, 'roof', 'ceiling');
    // parapets
    const par = (x0, z0, x1, z1) => L.wall(x0, z0, x1, z1, YR, YR + 1.1, 'brickTan', { thick: 0.3, mat2: 'brickTan' });
    par(0, 26, 34, 26); par(34, 26, 34, -26); par(34, -26, 22, -26); par(22, -26, 22, 13.2); par(22, 13.2, 0, 13.2); par(0, 13.2, 0, 26);
    // helipad
    L.floor(24, -22, 33, -13, YR + 0.02, 'helipad', { collide: false });
    L.sign([28.5, YR + 0.04, -17.5], 0, 5, 5, 'sign', { text: 'H', bg: 'rgb(70,70,68)', fg: 'rgb(220,200,60)', w: 32, h: 32, size: 26 }, { offset: 0 });
    // the sign() helper is vertical; lay a flat H decal instead
    L.floorDecal(28.5, YR + 0.03, -17.5, 0.1, 0, 'blood');
    L.marker('survivorStart', [26.5, YR + 0.05, -20], { yaw: Math.PI * 0.95 });
    L.marker('survivorStart', [28.0, YR + 0.05, -21], { yaw: Math.PI * 0.9 });
    L.marker('survivorStart', [29.5, YR + 0.05, -20.5], { yaw: Math.PI * 0.85 });
    L.marker('survivorStart', [27.2, YR + 0.05, -22.2], { yaw: Math.PI });
    L.zone([21.5, YR - 0.5, -26.5], [34.5, YR + 12, 26.5], { saferoom: 'start', skyRays: 6 });
    L.zone([-0.5, YR - 0.5, 13], [34.5, YR + 12, 26.5], { saferoom: 'start', skyRays: 6, roofPart: true });
    // roof dressing
    P(L, 'ac_unit', 30, YR, 0, 0); P(L, 'ac_unit', 30, YR, 5, 0); P(L, 'ac_unit', 25, YR, 3, Math.PI / 2);
    P(L, 'roof_vent', 24, YR, -6, 0); P(L, 'roof_vent', 32, YR, -8, 0); P(L, 'roof_vent', 12, YR, 24, 0);
    P(L, 'water_tower', 16, YR, 22, 0); P(L, 'satellite_dish', 31, YR, 22, -2.4);
    P(L, 'tent', 24.5, YR, -11, Math.PI / 2, { open: true });
    P(L, 'crate', 32.5, YR, -11, 0.2); P(L, 'crate', 32.4, YR, -12.2, -0.1); P(L, 'cardboard_boxes', 23, YR, 8, 0.3);
    P(L, 'sandbags', 22.6, YR, -2, Math.PI / 2); P(L, 'cot', 26, YR, 10, 0.1); P(L, 'cot', 28, YR, 10.5, -0.2);
    P(L, 'body_bag', 25, YR, 15, 1.4); P(L, 'body_bag', 26.2, YR, 16.2, 1.6);
    P(L, 'generator', 10, YR, 17, 0);
    // supply table by the stair housing
    L.box([7.2, YR, 15.4], [9.0, YR + 0.85, 17.6], { side: 'woodDark', top: 'woodLight' });
    for (let i = 0; i < 4; i++) L.marker('item', [7.5 + (i % 2) * 0.9, YR + 0.85, 15.8 + (i >> 1) * 0.8], { id: 'medkit' });
    L.marker('weapon', [8.1, YR + 0.85, 17.2], { id: 'pistol', count: 2, yaw: 0.3 });
    L.marker('weapon', [7.6, YR, 18.3], { id: ['fireaxe', 'crowbar', 'cricket_bat', 'baseball_bat'], yaw: 1.2 });
    L.marker('weapon', [8.6, YR, 14.8], { id: ['katana', 'crowbar', 'golf_club', 'fireaxe'], yaw: 2.1 });
    // roof lights / signage
    L.sign([17, YR + 2.2, 26.2], Math.PI, 10, 2, 'sign', { text: 'THE MAGNOLIA', bg: 'rgb(40,24,18)', fg: 'rgb(240,200,120)', w: 128, h: 24, size: 16, border: 'rgb(200,160,80)' }, { unlit: true });

    // ---------------------------------------------------------------- stairwell S1 (roof -> 8th)
    stairCore(L, { x0: 0, z0: 13.5, yTop: YR, yBot: Y8, variant: 'east', housing: true, wall: 'concreteWarm' });
    L.doors.push({ pos: [6, YR, 19.7 - 0.6], width: 1.2, height: 2.2, rotY: -Math.PI / 2, type: 'metal', name: 'roofDoor' });
    L.light([4.5, YR + 2.6, 17], 0xb0c0ff, 8, 0.9);
    L.light([3, (YR + Y8) / 2 + 2.4, 14.5], 0xb0c0ff, 7, 0.8, { flicker: 0.4 });
    L.light([3, Y8 + 2.6, 19], 0xb0c0ff, 6, 0.6, { flicker: 0.5 });
    L.sign([5.88, Y8 + 2.5, 19.7], -Math.PI / 2, 0.9, 0.3, 'sign', { text: 'EXIT', bg: 'rgb(20,60,20)', fg: 'rgb(120,255,120)', w: 32, h: 12, size: 9 }, { unlit: true });
    L.sign([5.88, Y8 + 1.6, 18.2], -Math.PI / 2, 0.6, 0.6, 'sign', { text: '8', bg: 'rgb(30,30,30)', fg: 'rgb(230,230,230)', w: 16, h: 16, size: 13 });

    // ================================================================= 8th FLOOR (Y8)
    const F8 = Y8;
    // floors & ceilings
    L.floor(6, 18.4, 27.8, 21, F8, 'carpetRed');                // corridor A
    L.floor(27.8, 13.2, 34, 26, F8, 'carpetRed');               // lobby/junction
    L.floor(27.8, -20, 30.4, 13.2, F8, 'carpetRed');            // corridor B
    L.ceiling(6, 18.4, 34, 21, F8 + H, 'ceiling');
    L.ceiling(27.8, 13.2, 34, 18.4, F8 + H, 'ceiling'); L.ceiling(27.8, 21, 34, 26, F8 + H, 'ceiling');
    L.ceiling(27.8, -20, 30.4, 13.2, F8 + H, 'ceiling');
    // corridor A walls (south wall: rooms on -z; north wall: rooms on +z)
    wallSeg(L, 6, 18.4, 27.8, 18.4, F8, H, 'roomPaper', 'hallPaper', [{ at: 2.5, w: 1.1, h: 2.2 }, { at: 7.5, w: 1.1, h: 2.2 }, { at: 12.5, w: 1.1, h: 2.2 }, { at: 18, w: 1.1, h: 2.2 }]);
    wallSeg(L, 6, 21, 27.8, 21, F8, H, 'hallPaper', 'suitePaper', [{ at: 2.5, w: 1.1, h: 2.2 }, { at: 9.5, w: 2.2, h: 2.4 }, { at: 17.5, w: 1.1, h: 2.2 }]);
    // guest rooms -z side (z 13.2..18.4)
    hotelRoom(L, { x0: 6, z0: 13.2, x1: 11, z1: 18.4, y: F8, door: 's', doorAt: 2.5, number: 802, window: 'n', seed: 1, items: ['pills'] });
    hotelRoom(L, { x0: 11, z0: 13.2, x1: 16, z1: 18.4, y: F8, door: 's', doorAt: 2.5, number: 804, window: 'n', seed: 2, items: ['pipebomb'], trashed: true });
    hotelRoom(L, { x0: 16, z0: 13.2, x1: 21, z1: 18.4, y: F8, door: 's', doorAt: 2.5, number: 806, window: 'n', seed: 3, items: ['adrenaline', 'molotov'] });
    hotelRoom(L, { x0: 21, z0: 13.2, x1: 27.8, z1: 18.4, y: F8, door: 's', doorAt: 2.6, number: 808, window: 'n', seed: 4, items: ['pills'], barricade: true });
    // +z side: room 801, CEDA suite, room 805
    hotelRoom(L, { x0: 6, z0: 21, x1: 11, z1: 26, y: F8, door: 'n', doorAt: 2.5, number: 801, window: 's', seed: 5, items: ['medkit'] });
    hotelRoom(L, { x0: 20, z0: 21, x1: 27.8, z1: 26, y: F8, door: 'n', doorAt: 3.5, number: 805, window: 's', seed: 6, items: ['bilejar'] });
    // CEDA command suite (x 11..20)
    L.floor(11, 21, 20, 26, F8, 'carpetBlue'); L.ceiling(11, 21, 20, 26, F8 + H, 'ceiling');
    wallSeg(L, 11, 26, 20, 26, F8, H, 'suitePaper', 'facade', [{ at: 3, w: 2.2, h: 1.6, y0: 0.9 }, { at: 6.5, w: 2.2, h: 1.6, y0: 0.9 }], { exterior: true });
    wallSeg(L, 11, 21, 11, 26, F8, H, 'roomPaper', 'suitePaper', []);
    wallSeg(L, 20, 26, 20, 21, F8, H, 'roomPaper', 'suitePaper', [{ at: 2.2, w: 1.0, h: 2.2 }]);
    L.glass.push({ min: [13.9, F8 + 0.9, 25.9], max: [16.1, F8 + 2.5, 26.0] });
    L.glass.push({ min: [16.4, F8 + 0.9, 25.9], max: [18.6, F8 + 2.5, 26.0] });
    P(L, 'table_long', 15.5, F8, 23.4, Math.PI / 2);
    for (let i = 0; i < 3; i++) { P(L, 'office_chair', 14.2, F8, 22.2 + i * 0.9, Math.PI / 2 + 0.2 * i); P(L, 'office_chair', 16.8, F8, 22.4 + i * 0.9, -Math.PI / 2 - 0.15 * i); }
    L.sign([15.5, F8 + 1.65, 21.12], 0, 3.2, 1.6, 'wallmap', {}, {});
    L.sign([11.12, F8 + 1.5, 23.5], Math.PI / 2, 2.2, 1.4, 'whiteboard', {}, {});
    L.sign([19.88, F8 + 1.6, 24.5], -Math.PI / 2, 0.7, 1.0, 'poster', { text: 'NERA' }, {});
    P(L, 'cardboard_boxes', 12, F8, 25, 0.2); P(L, 'crate', 19, F8, 25.2, 0.1);
    P(L, 'lamp_floor', 11.6, F8, 21.6, 0);
    L.light([15.5, F8 + 2.7, 23.5], 0xfff0c8, 8, 1.0);
    L.marker('item', [15.2, F8 + 0.78, 23.8], { id: ['pills', 'adrenaline'], chance: 0.8 });
    // suite bedroom (through the side door in the x=20 wall) is room 805; magnum spawn on its nightstand
    L.marker('weapon', [26.9, F8 + 0.6, 25.4], { id: 'magnum', chance: 0.6 });
    // junction / dead elevators (x 27.8..34, z 13.2..26)
    wallSeg(L, 27.8, 21, 27.8, 26, F8, H, 'roomPaper', 'hallPaper', [], { caps: false });
    wallSeg(L, 34, 13.2, 34, 26, F8, H, 'hallPaper', 'facade', [], { exterior: true });
    wallSeg(L, 34, 26, 27.8, 26, F8, H, 'hallPaper', 'facade', [], { exterior: true });
    wallSeg(L, 30.4, 13.2, 34, 13.2, F8, H, 'hallPaper', 'roomPaper', []);
    P(L, 'elevator_doors', 33.9, F8, 16.8, -Math.PI / 2);
    P(L, 'elevator_doors', 33.9, F8, 22.6, -Math.PI / 2);
    L.sign([33.88, F8 + 2.45, 19.7], -Math.PI / 2, 1.6, 0.4, 'sign', { text: 'OUT OF ORDER', bg: 'rgb(220,210,180)', fg: 'rgb(150,20,20)', w: 64, h: 14, size: 9 }, {});
    P(L, 'potted_plant', 28.6, F8, 25.2, 0); P(L, 'luggage_cart', 32, F8, 24.5, 0.6);
    P(L, 'vending_machine', 28.3, F8, 14.2, Math.PI / 2, { kind: 'soda' });
    P(L, 'body', 31, F8, 19, 2.1, { pose: 'back' }); P(L, 'blood_pool', 31, F8, 19, 0);
    L.light([31, F8 + 2.7, 19.7], 0xffd8a0, 9, 1.0, { flicker: 0.3 });
    L.light([31, F8 + 2.7, 24.5], 0xffd8a0, 6, 0.8);
    L.light([16, F8 + 2.7, 19.7], 0xffd8a0, 8, 0.7);
    L.light([9, F8 + 2.7, 19.7], 0xffd8a0, 7, 0.5, { flicker: 1 });
    L.light([23, F8 + 2.7, 19.7], 0xffd8a0, 7, 0.6);
    // ---------------------------------------------------------------- corridor B (x 27.8..30.4) running -z
    // west wall (rooms 810/812/820 behind)
    wallSeg(L, 27.8, 13.2, 27.8, -20, F8, H, 'hallPaper', 'roomPaper', [{ at: 4.2, w: 1.1, h: 2.2 }, { at: 14.2, w: 1.1, h: 2.2 }, { at: 20.2, w: 1.1, h: 2.2 }]);
    // east wall (laundry, rooms 814/816/818 behind)
    wallSeg(L, 30.4, -20, 30.4, 13.2, F8, H, 'hallPaper', 'roomPaper', [{ at: 15.3, w: 1.1, h: 2.2 }, { at: 25.0, w: 1.1, h: 2.2 }, { at: 8.0, w: 1.1, h: 2.2 }, { at: 2.6, w: 1.1, h: 2.2 }]);
    hotelRoom(L, { x0: 22, z0: 3, x1: 27.8, z1: 13.2, y: F8, door: 'e', doorAt: 4.2, number: 810, window: 'w', seed: 7, items: ['pipebomb', 'pills'], noDoorWall: true });
    hotelRoom(L, { x0: 22, z0: -3, x1: 27.8, z1: 3, y: F8, door: 'e', doorAt: 2.2 + 1.8, number: 812, window: 'w', seed: 8, items: ['molotov'], noDoorWall: true });
    hotelRoom(L, { x0: 22, z0: -20, x1: 27.8, z1: -3, y: F8, door: 'e', doorAt: 3.8, number: 820, window: 'w', seed: 9, items: ['medkit', 'pills'], noDoorWall: true, suite: true });
    // laundry room (x 30.4..34, z 5..10.5): door at z=7.8 (at 25.0 from z=-20 -> z=5.0? computed below)
    L.floor(30.4, 4, 34, 10.6, F8, 'tileWhite'); L.ceiling(30.4, 4, 34, 10.6, F8 + H, 'ceiling');
    wallSeg(L, 30.4, 10.6, 34, 10.6, F8, H, 'plasterBlue', 'roomPaper', []);
    wallSeg(L, 34, 4, 30.4, 4, F8, H, 'plasterBlue', 'roomPaper', []);
    wallSeg(L, 34, 10.6, 34, 4, F8, H, 'plasterBlue', 'facade', [{ at: 3.3, w: 1.3, h: 2.1, y0: 0.05 }], { exterior: true });
    L.glass.push({ min: [33.93, F8 + 0.05, 6.65], max: [34.03, F8 + 2.15, 7.95], laundry: true });
    P(L, 'washing_machine', 31, F8, 9.9, Math.PI); P(L, 'washing_machine', 31.9, F8, 9.9, Math.PI); P(L, 'laundry_cart', 32.6, F8, 4.8, 0.3);
    P(L, 'ironing_board', 33.2, F8, 9.2, 0.4);
    L.marker('item', [32.6, F8 + 0.6, 4.8], { id: ['pills', 'adrenaline', 'pipebomb'], chance: 0.7 });
    L.light([32.2, F8 + 2.7, 7.3], 0xd8e8ff, 7, 1.0, { flicker: 1 });
    // rooms past the fire, entered from the ledge
    for (const [z0, z1, num, win] of [[-3.5, 4, 814, false], [-11, -3.5, 816, true], [-20, -11, 818, false]]) {
      L.floor(30.4, z0, 34, z1, F8, 'carpetGreen'); L.ceiling(30.4, z0, 34, z1, F8 + H, 'ceiling');
      wallSeg(L, 30.4, z0, 34, z0, F8, H, 'roomPaper', 'roomPaper', [], { caps: false });
      // facade with a french window (only room 816's is passable; 814's is boarded, 818's is glass)
      wallSeg(L, 34, z1, 34, z0, F8, H, 'roomPaper', 'facade', [{ at: (z1 - z0) / 2, w: 1.3, h: 2.1, y0: 0.05 }], { exterior: true });
      const zc = (z0 + z1) / 2;
      if (!win) {
        if (num === 814) P(L, 'plywood_board', 34.05, F8 + 0.05, zc, Math.PI / 2, { w: 1.4, h: 2.2 }), L.box([34.0, F8, zc - 0.7], [34.15, F8 + 2.2, zc + 0.7], 'clip');
        else L.glass.push({ min: [33.93, F8 + 0.05, zc - 0.65], max: [34.03, F8 + 2.15, zc + 0.65] });
      }
      P(L, 'bed', 31.6, F8, zc, -Math.PI / 2); P(L, 'nightstand', 30.8, F8, zc - 1.3, -Math.PI / 2);
      L.light([32.2, F8 + 2.7, zc], 0xffd8a0, 5, 0.4, { flicker: num === 814 ? 1 : 0 });
    }
    wallSeg(L, 30.4, -20, 34, -20, F8, H, 'roomPaper', 'roomPaper', [], { caps: false });
    L.marker('item', [30.9, F8 + 0.6, -8.6], { id: ['adrenaline', 'pills', 'medkit'], chance: 0.8 });
    L.marker('item', [33.4, F8, -17], { id: ['molotov', 'pipebomb'], chance: 0.6 });
    // the burning wreckage in corridor B (z ~0..3) + clip so it can't be crossed
    P(L, 'burning_wreckage', 29.1, F8, 1.8, 0);
    L.box([27.8, F8, 0.6], [30.4, F8 + H, 3.0], 'clip');
    L.marker('fire', [29.1, F8, 1.8], { radius: 1.6, permanent: true, name: 'wreckFire' });
    L.light([29.1, F8 + 1.2, 1.8], 0xff7a30, 9, 1.4, { flicker: 1 });
    L.trigger([27.8, F8, 4.5], [30.4, F8 + 3, 8.0], { name: 'flareup' });
    L.light([29.1, F8 + 2.7, 10], 0xffd8a0, 6, 0.5);
    L.light([29.1, F8 + 2.7, -8], 0xffb070, 6, 0.6, { flicker: 1 });
    L.light([29.1, F8 + 2.7, -16], 0xffd8a0, 6, 0.5);
    // exterior ledge along x=34 (34..35.0), z -12..9
    L.floor(34, -12.5, 35.0, 9.2, F8, 'concreteWarm');
    L.box([34, F8 - 0.45, -12.5], [35.0, F8, 9.2], 'concreteWarm', { faces: { py: false } });
    L.box([34, F8 + H, -12.5], [34.6, F8 + H + 0.25, 9.2], 'concreteWarm'); // cornice above
    L.zone([33.9, F8 - 1, -13], [36, F8 + 4, 10], { skyRays: 6 });

    // ---------------------------------------------------------------- stairwell S2 (8th -> 7th), doors on its north wall at z=-20
    stairCore(L, { x0: 22.75, z0: -26, yTop: F8, yBot: Y7, variant: 'north', wall: 'concreteWarm' });
    L.light([26.5, F8 + 2.6, -23], 0xb0c0ff, 7, 0.5, { flicker: 0.6 });
    L.light([27, Y7 + 2.6, -22], 0xff7030, 7, 1.2, { flicker: 1 });
    L.marker('fire', [24.6, Y7, -21.6], { radius: 0.9, permanent: true });
    P(L, 'burning_wreckage', 24.4, Y7, -21.4, 0.6, { small: true });

    // ================================================================= 7th FLOOR (Y7)
    const F7 = Y7;
    L.floor(27.8, -20, 30.4, 6, F7, 'sootCarpet'); L.ceiling(27.8, -20, 30.4, 6, F7 + H, 'ceiling');
    wallSeg(L, 27.8, 6, 27.8, -20, F7, H, 'sootPaper', 'roomPaper', [{ at: 3, w: 1.1, h: 2.2 }, { at: 9, w: 1.1, h: 2.2 }, { at: 15.75, w: 1.1, h: 2.2 }, { at: 22.5, w: 1.1, h: 2.2 }]);
    wallSeg(L, 30.4, -20, 30.4, 6, F7, H, 'sootPaper', 'roomPaper', [{ at: 4, w: 1.1, h: 2.2 }, { at: 11.5, w: 1.1, h: 2.2 }, { at: 18.5, w: 1.1, h: 2.2 }, { at: 24, w: 1.1, h: 2.2 }]);
    // west rooms
    hotelRoom(L, { x0: 22, z0: 0, x1: 27.8, z1: 6, y: F7, door: 'e', doorAt: 3, number: 713, window: 'w', seed: 11, items: ['pills'], noDoorWall: true, soot: true });
    hotelRoom(L, { x0: 22, z0: -6.5, x1: 27.8, z1: 0, y: F7, door: 'e', doorAt: 3.5, number: 711, window: 'w', seed: 12, items: [], noDoorWall: true, soot: true, burning: true });
    hotelRoom(L, { x0: 22, z0: -13, x1: 27.8, z1: -6.5, y: F7, door: 'e', doorAt: 3.25, number: 709, window: 'w', seed: 13, items: ['molotov'], noDoorWall: true, soot: true, burning: true });
    hotelRoom(L, { x0: 22, z0: -20, x1: 27.8, z1: -13, y: F7, door: 'e', doorAt: 3.5, number: 707, window: 'w', seed: 14, items: ['adrenaline'], noDoorWall: true, soot: true });
    // east rooms
    hotelRoom(L, { x0: 30.4, z0: -20, x1: 34, z1: -12, y: F7, door: 'w', doorAt: 4, number: 708, window: 'e', seed: 15, items: [], noDoorWall: true, soot: true, burning: true });
    hotelRoom(L, { x0: 30.4, z0: -12, x1: 34, z1: -5, y: F7, door: 'w', doorAt: 3.5, number: 710, window: 'e', seed: 16, items: ['pipebomb'], noDoorWall: true, soot: true });
    hotelRoom(L, { x0: 30.4, z0: -5, x1: 34, z1: 2, y: F7, door: 'w', doorAt: 3.5, number: 712, window: 'e', seed: 17, items: ['medkit'], noDoorWall: true, soot: true });
    L.floor(30.4, 2, 34, 6, F7, 'tileWhite'); L.ceiling(30.4, 2, 34, 6, F7 + H, 'ceiling');
    wallSeg(L, 34, 6, 34, 2, F7, H, 'plasterBlue', 'facade', [], { exterior: true }); wallSeg(L, 30.4, 2, 34, 2, F7, H, 'plasterBlue', 'roomPaper', [], { caps: false });
    P(L, 'kitchen_shelf', 33.5, F7, 4, -Math.PI / 2); L.marker('item', [33.3, F7 + 1.0, 4.2], { id: ['pipebomb', 'bilejar', 'molotov'], chance: 0.8 });
    // backdraft doors (smoke curls from under them)
    L.doors.push({ pos: [27.8, F7, -3.25 - 0.55 + 0], width: 1.1, height: 2.2, rotY: -Math.PI / 2, type: 'wood', name: 'backdraft711' });
    L.doors.push({ pos: [30.4, F7, -8.5 - 0.55], width: 1.1, height: 2.2, rotY: -Math.PI / 2, type: 'wood', name: 'backdraft710' });
    L.marker('smoke', [27.6, F7 + 0.1, -3.25], { door: true }); L.marker('smoke', [30.6, F7 + 0.1, -8.5], { door: true });
    // corridor fires and smoke
    L.marker('fire', [29.1, F7, -10.5], { radius: 0.8, permanent: true });
    L.marker('fire', [28.4, F7, -1], { radius: 0.6, permanent: true });
    L.light([29.1, F7 + 1.2, -10.5], 0xff7030, 8, 1.3, { flicker: 1 });
    L.light([29.1, F7 + 2.6, -16], 0xff8040, 7, 0.9, { flicker: 1 });
    L.light([29.1, F7 + 2.6, 2], 0xffb070, 7, 0.7, { flicker: 0.6 });
    for (let z = -18; z < 6; z += 4) L.marker('smoke', [29.1, F7 + 2.6, z], { ceiling: true });
    P(L, 'ironing_board', 28.6, F7, -11.5, 0.8); P(L, 'room_service_cart', 29.6, F7, 4.5, 0.4);
    P(L, 'body', 29.0, F7, -6, 0.5, { pose: 'front' });
    // lounge / elevator lobby (x 22..34, z 6..17)
    L.floor(22, 6, 34, 17, F7, 'carpetBrown'); L.ceiling(22, 6, 34, 17, F7 + H, 'ceiling');
    wallSeg(L, 22, 6, 27.8, 6, F7, H, 'roomPaper', 'hallPaper', [], { caps: false });
    wallSeg(L, 30.4, 6, 34, 6, F7, H, 'plasterBlue', 'hallPaper', [], { caps: false });
    wallSeg(L, 22, 17, 22, 6, F7, H, 'hallPaper', 'facade', [{ at: 5.5, w: 2.4, h: 1.5, y0: 0.9 }], { exterior: true });
    L.glass.push({ min: [21.95, F7 + 0.9, 9.3], max: [22.05, F7 + 2.4, 11.7] });
    wallSeg(L, 34, 6, 34, 17, F7, H, 'facade', 'hallPaper', [{ at: 3.3, w: 1.8, h: 2.3 }], { exterior: true });
    wallSeg(L, 34, 17, 22, 17, F7, H, 'facade', 'hallPaper', [{ at: 8.5, w: 1.1, h: 2.2 }], { exterior: true });
    hotelRoom(L, { x0: 22, z0: 17, x1: 28, z1: 22.5, y: F7, door: 'n', doorAt: 3.5, number: 715, window: 's', seed: 18, items: ['pills'], noDoorWall: true });
    L.marker('weapon', [23.2, F7 + 0.6, 21.6], { id: ['magnum', 'chainsaw'], chance: 0.7 });
    P(L, 'elevator_doors', 33.9, F7, 13.7, -Math.PI / 2);
    for (let i = 0; i < 5; i++) P(L, 'sleeping_bag', 23.5 + (i % 3) * 2.2, F7, 12 + Math.floor(i / 3) * 2.6, 0.3 * i);
    P(L, 'sofa', 25, F7, 15.8, Math.PI); P(L, 'armchair', 23, F7, 7.6, 0.6); P(L, 'coffee_table', 25.2, F7, 14.6, 0);
    P(L, 'cardboard_boxes', 27, F7, 7, 0); P(L, 'potted_plant', 32.8, F7, 16.2, 0);
    L.sign([33.88, F7 + 2.5, 9.3], -Math.PI / 2, 1.0, 0.3, 'sign', { text: '▼ ▲', bg: 'rgb(30,30,30)', fg: 'rgb(255,190,60)', w: 32, h: 10, size: 8 }, { unlit: true });
    L.light([28, F7 + 2.7, 11.5], 0xffd8a0, 11, 1.0, { flicker: 0.4 });
    L.light([24, F7 + 2.0, 14], 0xff8040, 6, 0.7, { flicker: 1 });
    L.marker('smoke', [26, F7 + 2.6, 10], { ceiling: true });
    // the working elevator car (7th floor)
    elevatorCar(L, F7);
    L.light([35.5, F7 + 2.4, 9.3], 0xfff0c0, 4, 1.0);
    L.zone([34.1, F7 - 0.2, 7.9], [36.9, F7 + 2.7, 10.7], { name: 'carUp', skyRays: 0 });

    // ================================================================= GROUND FLOOR (Y0)
    const G0 = Y0;
    elevatorCar(L, G0);
    L.zone([34.1, G0 - 0.2, 7.9], [36.9, G0 + 2.7, 10.7], { name: 'carDown', skyRays: 0 });
    // service corridor (x 20..34, z 7..11.5)
    L.floor(20, 7, 34, 11.5, G0, 'concreteDark'); L.ceiling(20, 7, 34, 11.5, G0 + 3.2, 'ceiling');
    wallSeg(L, 34, 7, 34, 11.5, G0, 3.2, 'concreteDark', 'elevWall', [{ at: 2.3, w: 1.8, h: 2.3 }]);
    wallSeg(L, 20, 7, 34, 7, G0, 3.2, 'plasterDirty', 'plasterDirty', [{ at: 9.5, w: 1.1, h: 2.2 }]);
    wallSeg(L, 34, 11.5, 20, 11.5, G0, 3.2, 'plasterDirty', 'sootPaper', [{ at: 6, w: 1.6, h: 2.3 }]);
    L.marker('weapon', [31.5, G0, 9.2], { id: 'smg_silenced', infinite: true, yaw: 0.4 });
    L.light([28, G0 + 3, 9.2], 0xff9050, 8, 0.8, { flicker: 1 });
    // security office (x 26..33, z 2..7)
    L.floor(26, 2, 33, 7, G0, 'tileWhite'); L.ceiling(26, 2, 33, 7, G0 + 3.2, 'ceiling');
    wallSeg(L, 26, 2, 33, 2, G0, 3.2, 'plaster', 'plaster', []); wallSeg(L, 26, 7, 26, 2, G0, 3.2, 'plaster', 'plaster', []); wallSeg(L, 33, 2, 33, 7, G0, 3.2, 'plaster', 'plaster', []);
    P(L, 'desk', 30.5, G0, 2.9, 0); P(L, 'office_chair', 30.5, G0, 3.9, Math.PI);
    for (let i = 0; i < 3; i++) P(L, 'tv', 29.3 + i * 1.1, G0 + 0.78, 2.6, 0, { on: true });
    L.box([26.2, G0, 5.4], [27.6, G0 + 0.9, 6.8], { side: 'metalDark', top: 'metal' });
    for (let i = 0; i < 3; i++) L.marker('weapon', [26.5 + i * 0.4, G0 + 0.9, 6.1], { id: 'chrome_shotgun', yaw: Math.PI / 2 });
    L.marker('item', [32.4, G0, 6.4], { id: 'medkit' });
    L.marker('ammo', [32.4, G0, 2.8]);
    L.light([29.5, G0 + 3, 4.5], 0xc8e0ff, 8, 1.1);
    // burning storage on the other side (x 26..33, z 11.5..16)
    L.floor(26, 11.5, 33, 16, G0, 'concreteDark'); L.ceiling(26, 11.5, 33, 16, G0 + 3.2, 'ceiling');
    wallSeg(L, 26, 16, 33, 16, G0, 3.2, 'sootPaper', 'sootPaper', []); wallSeg(L, 26, 11.5, 26, 16, G0, 3.2, 'sootPaper', 'sootPaper', []); wallSeg(L, 33, 16, 33, 11.5, G0, 3.2, 'sootPaper', 'sootPaper', []);
    P(L, 'burning_wreckage', 29.5, G0, 14, 0.3); L.marker('fire', [29.5, G0, 14], { radius: 1.8, permanent: true });
    L.marker('item', [26.8, G0, 15.3], { id: ['pipebomb', 'pills', 'molotov'], chance: 0.8 });
    L.light([29.5, G0 + 1.5, 14], 0xff6a20, 10, 1.6, { flicker: 1 });
    // kitchen (x 8..20, z 1..15)
    L.floor(8, 1, 20, 15, G0, 'kitchenTile'); L.ceiling(8, 1, 20, 15, G0 + 3.4, 'ceiling');
    wallSeg(L, 20, 1, 20, 7, G0, 3.4, 'plasterDirty', 'tileWhite', []);
    wallSeg(L, 20, 11.5, 20, 15, G0, 3.4, 'plasterDirty', 'tileWhite', []);
    L.box([20, G0 + 3.2, 7], [20.2, G0 + 3.4, 11.5], 'plasterDirty');
    wallSeg(L, 8, 1, 20, 1, G0, 3.4, 'facade', 'tileWhite', [], { exterior: true });
    wallSeg(L, 20, 15, 8, 15, G0, 3.4, 'facade', 'tileWhite', [], { exterior: true });
    wallSeg(L, 8, 15, 8, 1, G0, 3.4, 'plasterPeach', 'tileWhite', [{ at: 9.5, w: 1.4, h: 2.3 }]);
    for (let i = 0; i < 4; i++) { P(L, 'kitchen_oven', 9 + i * 1.6, G0, 14.3, Math.PI); if (i % 2 === 0) L.marker('fire', [9 + i * 1.6, G0 + 0.9, 13.9], { radius: 0.6, permanent: true }); }
    L.light([11, G0 + 1.5, 13.6], 0xff6a20, 9, 1.5, { flicker: 1 });
    for (let i = 0; i < 3; i++) P(L, 'kitchen_shelf', 9 + i * 2.2, G0, 1.5, 0);
    L.marker('item', [11.2, G0 + 1.0, 1.6], { id: ['pipebomb', 'molotov', 'bilejar'], chance: 0.7 });
    P(L, 'prep_table', 17, G0, 4, 0); P(L, 'prep_table', 17, G0, 9.5, 0);
    // the long steel counter you have to vault over (x 14, full width)
    L.box([13.6, G0, 1.2], [14.4, G0 + 0.95, 14.8], { side: 'steel', top: 'steel' });
    for (let i = 0; i < 5; i++) P(L, 'body_bag', 10, G0, 3.5 + i * 1.6, Math.PI / 2 + (i % 2) * 0.1);
    L.light([17, G0 + 3.2, 7], 0xd8e8ff, 7, 0.5, { flicker: 1 });
    L.marker('smoke', [14, G0 + 3.0, 8], { ceiling: true }); L.marker('smoke', [10, G0 + 3.0, 12], { ceiling: true });
    // restaurant / buffet (x -14..8, z -6..18)
    L.floor(-14, -6, 8, 18, G0, 'carpetBrown'); L.ceiling(-14, -6, 8, 18, G0 + 4, 'ceiling');
    wallSeg(L, 8, 1, 8, -6, G0, 4, 'plasterPeach', 'plasterPeach', [], { caps: false });
    wallSeg(L, 8, 18, 8, 15, G0, 4, 'plasterPeach', 'plasterPeach', [], { caps: false });
    L.box([8, G0 + 3.4, 1], [8.2, G0 + 4, 15], 'plasterPeach');
    wallSeg(L, -14, 18, 8, 18, G0, 4, 'facade', 'wallpaperRed', [{ at: 5, w: 2.2, h: 1.6, y0: 1 }, { at: 11, w: 2.2, h: 1.6, y0: 1 }, { at: 17, w: 2.2, h: 1.6, y0: 1 }], { exterior: true });
    for (const x of [-9, -3, 3]) P(L, 'plywood_board', x, G0 + 1, 17.95, Math.PI, { w: 2.3, h: 1.7 });
    wallSeg(L, -14, -6, -14, 18, G0, 4, 'facade', 'wallpaperRed', [], { exterior: true });
    wallSeg(L, 8, -6, -14, -6, G0, 4, 'lobbyWall', 'wallpaperRed', [{ at: 10, w: 3.2, h: 2.8 }]);
    for (let i = 0; i < 6; i++) P(L, 'restaurant_table_set', -11 + (i % 3) * 6, G0, 2 + Math.floor(i / 3) * 7, i * 0.3);
    P(L, 'buffet_table', -2, G0, 14, 0); P(L, 'buffet_table', 2.5, G0, 14, 0); P(L, 'buffet_table', -12.5, G0, 6, Math.PI / 2);
    for (const [x, z, r] of [[-6, 8, 1.2], [2, 4, 1.0], [-10, -2, 0.9], [4, 10, 1.1]]) { L.marker('fire', [x, G0, z], { radius: r, permanent: true }); P(L, 'burning_wreckage', x, G0, z, x * 0.3, { small: r < 1.1 }); L.light([x, G0 + 1.3, z], 0xff6a20, 9, 1.3, { flicker: 1 }); }
    P(L, 'chandelier', -3, G0 + 4, 6, 0);
    L.marker('item', [-12.6, G0 + 0.9, 3], { id: ['pills', 'adrenaline'], chance: 0.6 });
    L.marker('item', [6.8, G0, -5], { id: ['medkit', 'pills'], chance: 0.5 });
    L.marker('smoke', [-3, G0 + 3.6, 6], { ceiling: true }); L.marker('smoke', [-9, G0 + 3.6, 12], { ceiling: true });
    // lobby (x -14..20, z -30..-6), 7m tall
    L.floor(-14, -30, 20, -6, G0, 'lobbyFloor');
    L.ceiling(-14, -30, 20, -6, G0 + 7, 'ceiling', { holes: [[-2, -22, 8, -14]] });
    L.box([-2, G0 + 7, -22], [8, G0 + 7.6, -14], 'glass', { faces: { ny: false }, collide: false });
    wallSeg(L, -14, -30, -14, -6, G0, 7, 'facade', 'lobbyWall', [], { exterior: true });
    wallSeg(L, 20, -6, 20, -30, G0, 7, 'whitePlaster', 'lobbyWall', [{ at: 19.8, w: 3.0, h: 3 }]);
    wallSeg(L, -14, -30, 20, -30, G0, 7, 'lobbyWall', 'facade', [{ at: 17, w: 6, h: 3.4 }], { exterior: true });
    for (const x of [1, 4]) P(L, 'plywood_board', x, G0, -29.95, 0, { w: 3, h: 3.4 });
    L.box([0, G0, -30.3], [6, G0 + 3.4, -30.1], 'clip');
    L.box([-8, G0 + 3.6, -6.2], [8, G0 + 4.0, -6.0], 'lobbyWall');
    wallSeg(L, 8, -6, 20, -6, G0, 7, 'lobbyWall', 'whitePlaster', [], { caps: false });
    for (const [x, z] of [[-6, -12], [-6, -24], [6, -12], [6, -24], [14, -12], [14, -24]]) { L.cylinder(x, G0, z, 0.55, 7, 'marbleDark', { segments: 10 }); }
    P(L, 'reception_desk', -11.5, G0, -18, Math.PI / 2);
    L.sign([-13.88, G0 + 3.2, -18], Math.PI / 2, 4, 1, 'sign', { text: 'THE MAGNOLIA', bg: 'rgb(40,24,18)', fg: 'rgb(220,180,100)', w: 96, h: 24, size: 14 }, {});
    L.sign([-13.88, G0 + 2.3, -12], Math.PI / 2, 1.4, 0.7, 'sign', { text: 'FREE COFFEE\n6AM - 10AM', bg: 'rgb(230,220,200)', fg: 'rgb(60,40,30)', w: 48, h: 24, size: 8 }, {});
    P(L, 'chandelier', 3, G0 + 7, -18, 0);
    P(L, 'sofa', -2, G0, -26, 0); P(L, 'sofa', 2, G0, -26, 0); P(L, 'coffee_table', 0, G0, -24.5, 0); P(L, 'armchair', -4, G0, -22, 1.2);
    P(L, 'luggage_cart', 10, G0, -20, 0.4); P(L, 'potted_plant', -12.5, G0, -28.5, 0); P(L, 'potted_plant', 18.5, G0, -8, 0);
    P(L, 'barricade_furniture', 3, G0, -28.6, 0);
    for (let i = 0; i < 5; i++) P(L, 'body', -8 + i * 2.7, G0, -28 + (i % 2), i * 1.3, { pose: i % 2 ? 'front' : 'back' });
    P(L, 'blood_pool', 0, G0, -27.5, 0);
    L.marker('item', [-11.4, G0 + 1.1, -18.5], { id: ['pills', 'pipebomb', 'adrenaline'], chance: 0.8 });
    L.marker('weapon', [10.4, G0, -19.6], { id: ['smg', 'pump_shotgun'], chance: 0.6 });
    L.light([3, G0 + 6.5, -18], 0xffe0a0, 16, 0.9);
    L.light([-10, G0 + 3, -18], 0xffd090, 8, 0.7);
    L.light([3, G0 + 3, -9], 0xff8040, 8, 0.6, { flicker: 1 });
    L.zone([-14, G0, -30], [20, G0 + 7.6, -6], { skyRays: 3, skyAmt: 0.5 });
    // white hallway (x 20..29, z -27.4..-24.2) -> safe room
    L.floor(20, -27.4, 29, -24.2, G0, 'tileWhite'); L.ceiling(20, -27.4, 29, -24.2, G0 + 3, 'ceiling');
    wallSeg(L, 20, -27.4, 29, -27.4, G0, 3, 'whitePlaster', 'whitePlaster', []);
    wallSeg(L, 29, -24.2, 20, -24.2, G0, 3, 'whitePlaster', 'whitePlaster', []);
    L.light([22, G0 + 2.8, -25.8], 0xe8f0ff, 7, 1.1, { flicker: 0.2 });
    L.light([27, G0 + 2.8, -25.8], 0xe8f0ff, 6, 1.0);
    L.sign([28.88, G0 + 1.4, -24.9], -Math.PI / 2, 0.9, 0.5, 'graffiti', { text: 'SAFE', color: 'rgb(200,30,20)', arrow: false, w: 32, h: 16 }, { alpha: true });
    // safe room (x 29..36, z -30..-21)
    L.floor(29, -30, 36, -21, G0, 'concrete'); L.ceiling(29, -30, 36, -21, G0 + 3, 'ceiling');
    wallSeg(L, 29, -21, 29, -30, G0, 3, 'plasterGreen', 'whitePlaster', [{ at: 4.6 + 0.0, w: 1.4, h: 2.3 }]);
    wallSeg(L, 29, -30, 36, -30, G0, 3, 'facade', 'plasterGreen', [], { exterior: true }); wallSeg(L, 36, -30, 36, -21, G0, 3, 'facade', 'plasterGreen', [], { exterior: true }); wallSeg(L, 36, -21, 29, -21, G0, 3, 'facade', 'plasterGreen', [], { exterior: true });
    L.doors.push({ pos: [29, G0, -26.3], width: 1.4, height: 2.3, rotY: -Math.PI / 2, type: 'saferoom', name: 'endDoor', open: true });
    L.zone([29.1, G0 - 0.2, -29.9], [35.9, G0 + 3, -21.1], { saferoom: 'end', skyRays: 0, sky: new THREE.Color(0.22, 0.23, 0.2) });
    L.marker('goal', [33, G0, -25.5]);
    P(L, 'cot', 34.5, G0, -28.5, 0); P(L, 'cot', 34.5, G0, -23, 0);
    L.box([31, G0, -29.8], [33.4, G0 + 0.85, -28.8], { side: 'woodDark', top: 'woodLight' });
    for (let i = 0; i < 4; i++) L.marker('item', [31.3 + i * 0.6, G0 + 0.85, -29.3], { id: 'medkit' });
    L.marker('ammo', [35.2, G0, -25.5]);
    L.marker('weapon', [32.2, G0, -22], { id: ['smg', 'pump_shotgun', 'chrome_shotgun', 'smg_silenced'], count: 2, yaw: 1.4 });
    L.sign([35.88, G0 + 1.6, -25.5], -Math.PI / 2, 1.2, 1.6, 'poster', { text: 'NERA' }, {});
    L.light([32.5, G0 + 2.8, -25.5], 0xfff0d0, 10, 1.6);

    // ---------------------------------------------------------------- exterior: facades, street far below, city ring
    // hotel facade from street level up to the roof (outside faces only)
    const fac = (x0, z0, x1, z1) => L.wall(x0, z0, x1, z1, 0, YR, 'facade', { thick: 0.05, top: false, caps: false, collide: false });
    fac(0, 13.2, 22, 13.2); fac(22, 13.2, 22, -26); fac(22, -26, 34, -26); fac(34, -26, 34, -12.5); fac(34, 9.2, 34, 26); fac(34, 26, 0, 26); fac(0, 26, 0, 13.2);
    L.wall(34, -12.5, 34, 9.2, 0, Y8 - 0.45, 'facade', { thick: 0.05, top: false, caps: false, collide: false });
    L.floor(-60, -80, 100, 80, -0.3, 'asphalt', { collide: true, maxQuad: 8 });
    L.box([-80, -60, -100], [120, -0.3, 100], 'clip', { faces: { ny: false, py: false } });
    cityBlocks(L, { cx: 17, cz: 0, inner: 45, outer: 120, seed: 31, mats: ['facadeFar', 'facadeFar2'] });
    skylineRing(L, 17, 0, 170, 70);
    // street dressing far below
    for (const [x, z, r, n] of [[45, 10, 0.2, 'car'], [50, -15, 1.7, 'taxi'], [42, 30, -0.4, 'police_car'], [-15, 35, 1.2, 'bus'], [60, 40, 2.4, 'car'], [-25, -20, 0.6, 'ambulance']]) P(L, n, x, -0.3, z, r, { wrecked: Math.random() < 0.5, burned: n === 'car' });
    L.light([45, 2, 10], 0xff6020, 14, 1.2);
  },

  setup(w) {
    // fires
    for (const m of w.builder.markers) {
      if (m.type === 'fire') { const f = spawnFire(w, m.pos, m.radius || 1, 1e9, null, { permanent: true, flames: Math.round(6 + m.radius * 6) }); if (m.name) w.flags[m.name] = f; }
    }
    smokeEmitter(w, w.builder.markers.filter((m) => m.type === 'smoke'));
    const L = w.builder;
    // ---------------------------------------------------------- intro helicopter flying away
    const hb = new LevelBuilder();
    try { prop(hb, 'helicopter', 0, 0, 0, 0, {}); } catch (e) { hb.box([-2, 0, -6], [2, 2.4, 3], 'metalGreen'); }
    const heli = hb.buildSimple(1.1);
    heli.position.set(29, YR + 3, -14);
    w.scene.add(heli);
    w.flags.heli = { obj: heli, t: 0, snd: null };
    // ---------------------------------------------------------- flare-up
    w.events.on('trigger', (name, who) => {
      if (name !== 'flareup') return;
      const f = w.flags.wreckFire;
      w.sound('fire_burst', new THREE.Vector3(29.1, Y8 + 1, 2), { volume: 1 });
      w.sound('explosion_small', new THREE.Vector3(29.1, Y8 + 1, 2), { volume: 1 });
      w.effects.explosion(new THREE.Vector3(29.1, Y8 + 0.8, 2.2), 0.7);
      w.events.emit('shake', new THREE.Vector3(29.1, Y8, 2), 0.6);
      spawnFire(w, new THREE.Vector3(29.1, Y8, 3.2), 1.5, 1e9, null, { permanent: true, flames: 14 });
      w.after(1.2, () => w.speak(who[0], 'go', 1) || null);
      w.after(1.5, () => { const s = w.survivors.find((x) => x.state === 'alive'); w.subtitles.push({ who: s.name, text: 'Fire\'s spreading! We go around — through the laundry, out on the ledge!', t: 4 }); });
      w.message('The corridor is blocked by fire', 'warn');
    });
    // laundry window -> ledge: shout when broken
    w.events.on('glassBroken', (g) => { if (g.d.laundry) { const s = w.survivors.find((x) => x.state === 'alive'); if (s) w.subtitles.push({ who: s.name, text: 'Easy now. Don\'t look down.', t: 3 }); } });
    // ---------------------------------------------------------- backdraft doors
    for (const d of w.doors) {
      if (!d.name || !d.name.startsWith('backdraft')) continue;
      d.onOpen = (ww, s, door) => {
        if (door.burst) return; door.burst = true;
        const c = door.center.clone();
        ww.sound('fire_burst', c, { volume: 1 }); ww.sound('explosion_small', c, { volume: 0.8 });
        ww.effects.explosion(c, 0.6);
        const out = new THREE.Vector3(c.x + (door.d.pos[0] < 29 ? 1.2 : -1.2), Y7, c.z);
        spawnFire(ww, out, 1.3, 25, null, { flames: 10 });
        spawnFire(ww, c.clone().setX(c.x + (door.d.pos[0] < 29 ? -1.6 : 1.6)), 1.4, 1e9, null, { permanent: true, flames: 9 });
        for (const sv of ww.survivors) if (sv.state === 'alive' && sv.body.pos.distanceTo(c) < 2.2) sv.takeDamage(10, { type: 'fire' });
      };
    }
    // ---------------------------------------------------------- elevator
    setupElevator(w);
    gatherZone(w, 'carUp', [[35.0, Y7, 8.7], [36.0, Y7, 8.7], [35.0, Y7, 9.9], [36.0, Y7, 9.9]]);
    w.objective = null;
  },

  onBegin(w) {
    const h = w.flags.heli;
    h.snd = w.sound('helicopter_loop', h.obj.position, { loop: true, volume: 1, follow: h.obj });
  },

  update(w, dt) {
    // helicopter departs
    const h = w.flags.heli;
    if (h && h.obj.visible) {
      h.t += dt;
      const t = h.t;
      h.obj.position.set(29 + t * t * 0.9, YR + 3 + t * 2.2, -14 + t * 5 + t * t * 0.35);
      h.obj.rotation.set(-0.15, -0.6 + t * 0.05, 0.12 * Math.sin(t));
      if (t > 22) { h.obj.visible = false; if (h.snd) h.snd.stop(2); }
    }
    // fog: smoky inside, hazy outside
    const p = w.player;
    if (p) {
      const y = p.body.pos.y;
      const out = y > YR - 1 || (p.body.pos.x > 33.9 && y > Y8 - 1 && y < Y8 + 3);
      let c = 0x2a2018, n = 5, f = 38;
      if (out) { c = 0x6a5642; n = 20; f = 120; }
      else if (y > Y8 - 1) { c = 0x3a3028; n = 6; f = 48; }
      else if (y > Y7 - 1) { c = 0x2e2218; n = 3; f = 26; }
      if (w.elevatorSmoke) { c = 0x4a3a2a; n = 0.5; f = 4 + (1 - w.elevatorSmoke) * 30; }
      w.fogTo(c, n, f, dt);
    }
    updateElevator(w, dt);
  },
};

// ===================================================================== elevator car + event
function elevatorCar(L, y) {
  const { x0, x1, z0, z1 } = CAR;
  L.floor(x0, z0, x1, z1, y, 'metalDiamond');
  L.ceiling(x0, z0, x1, z1, y + 2.6, 'elevWall');
  L.wall(x1, z0, x1, z1, y, y + 2.6, 'elevWall', { thick: 0.12, mat2: 'elevWall' });
  L.wall(x0, z0, x1, z0, y, y + 2.6, 'elevWall', { thick: 0.12, mat2: 'elevWall' });
  L.wall(x1, z1, x0, z1, y, y + 2.6, 'elevWall', { thick: 0.12, mat2: 'elevWall' });
  // front wall with the door opening (x = 34)
  L.wall(34, z0 - 0.1, 34, z1 + 0.1, y, y + 2.6, 'steelDoor', { thick: 0.15, mat2: 'elevWall', openings: [{ at: 1.4, w: 1.8, h: 2.3 }] });
  // button panel
  L.box([x1 - 0.1, y + 1.0, z1 - 0.5], [x1 - 0.04, y + 1.5, z1 - 0.25], 'steel');
  L.box([x0 + 0.8, y + 2.56, z0 + 0.8], [x1 - 0.8, y + 2.6, z1 - 0.8], 'emissiveWarm', { collide: false });
  L.light([(x0 + x1) / 2, y + 2.3, (z0 + z1) / 2], 0xfff0c8, 4.5, 1.1);
  // the shaft beyond the car is solid
  L.box([x1, y - 0.5, z0 - 0.3], [x1 + 0.4, y + 3.2, z1 + 0.3], 'concreteDark');
}

function doorPanel() {
  const k = new MeshKit(); k.defaultUV = charAtlas().cloth;
  k.box([0.45, 1.15, 0], [0.9, 2.3, 0.05], 0x9aa0a4);
  k.box([0.45, 1.15, 0.03], [0.85, 2.2, 0.01], 0x7a8084);
  return new THREE.Mesh(k.toGeometry(), createPS1Material({ map: charAtlas().texture, tint: true }));
}

function setupElevator(w) {
  const E = w.flags.elev = { state: 'idle', t: 0, panels: [], dyn: [] };
  // door panels for both floors (upper starts open, lower closed)
  for (const [y, open] of [[Y7, true], [Y0, false]]) {
    const l = doorPanel(), r = doorPanel();
    l.position.set(33.97, y, 8.4); l.rotation.y = -Math.PI / 2;
    r.position.set(33.97, y, 9.3); r.rotation.y = -Math.PI / 2;
    w.scene.add(l); w.scene.add(r);
    for (const m of [l, r]) m.material.uniforms.uAmbient.value.copy(w.probeAt(new THREE.Vector3(33.5, y + 1, 9.3)));
    const dyn = w.collision.addDynamic(new DynamicBox([33.85, y, 8.4], [34.1, y + 2.3, 10.2], { surface: SURF.METAL }));
    dyn.enabled = !open;
    E.panels.push({ l, r, y, open: open ? 1 : 0, target: open ? 1 : 0, dyn });
  }
  // call button (inside the upper car)
  const btn = {
    useText: 'Press the elevator button', radius: 0.3,
    focusPos: () => new THREE.Vector3(36.68, Y7 + 1.25, 10.2),
    usable: (s) => E.state === 'idle' && s.body.pos.y > Y7 - 1 && s.body.pos.y < Y7 + 2,
    onUsed: (s) => {
      const zone = w.builder.zones.find((z) => z.name === 'carUp');
      const alive = w.survivors.filter((o) => o.state !== 'dead');
      const v = new THREE.Vector3();
      const isOut = (o) => !zone.box.containsPoint(v.set(o.body.pos.x, o.body.pos.y + 0.5, o.body.pos.z)) || o.state !== 'alive';
      // bots that are right outside but blocked by bodies in the doorway get herded in
      const gz = (w.gatherZones || []).find((g) => g.box === zone.box);
      if (gz) {
        let i = 0;
        for (const o of alive) {
          if (!o.isBot || o.state !== 'alive' || o.pinnedBy || !isOut(o)) continue;
          if (o.body.pos.distanceTo(gz.points[0]) > 8 || Math.abs(o.body.pos.y - Y7) > 1.5) continue;
          for (; i < gz.points.length; i++) {
            const p = gz.points[i];
            if (alive.some((q) => q !== o && Math.hypot(q.body.pos.x - p.x, q.body.pos.z - p.z) < 0.5)) continue;
            o.body.pos.set(p.x, p.y + 0.05, p.z); o.body.vel.set(0, 0, 0); if (o.controller) o.controller.path = null;
            i++; break;
          }
        }
      }
      const outside = alive.filter(isOut);
      w.sound('button_press', btn.focusPos());
      if (outside.length) { w.message(`Everyone needs to be in the elevator (${outside.map((o) => o.name).join(', ')})`, 'warn'); return; }
      E.state = 'closing'; E.t = 0;
      w.sound('elevator_ding', btn.focusPos());
    },
  };
  w.interactables.push(btn);
  // pry the jammed doors on the ground floor
  const pry = {
    useText: 'Force the doors open', radius: 0.5, holdTime: 2.5,
    focusPos: () => new THREE.Vector3(34.05, Y0 + 1.2, 9.3),
    usable: (s) => E.state === 'jammed' && s.body.pos.y < Y0 + 2,
    onUsed: (s) => {
      E.state = 'open'; E.panels[1].target = 1; E.panels[1].dyn.enabled = false;
      w.sound('metal_crash', pry.focusPos(), { volume: 1 });
      w.sound('door_metal_open', pry.focusPos(), { volume: 1 });
      w.noise(pry.focusPos(), 60);
      w.after(1.2, () => {
        w.director.start();
        w.director.startPanic({ initial: 22, waves: 3, size: [14, 22], interval: [7, 11], limit: 34, delay: 6, behind: false });
        w.message('The noise is drawing a horde!', 'warn');
        const s = w.survivors.find((o) => o.state === 'alive');
        if (s) w.subtitles.push({ who: s.name, text: 'They heard that. Here they come!', t: 3 });
      });
    },
  };
  w.interactables.push(pry);
}

const RIDE_LINES = [
  [2.0, 2, 'Is anybody else freaking out? Because I am freaking out.'],
  [5.5, 0, 'Breathe, son. What\'s your name?'],
  [8.5, 2, 'Trey. I, uh, work at the skate shop on Bay Street. Worked.'],
  [11.5, 1, 'Maya. Paramedic. I was on a call when it all went sideways.'],
  [14.5, 3, 'Silas. I drive trucks. Just passing through town.'],
  [17.5, 0, 'Gus. Well, we\'re not passing through alone anymore. We stick together.'],
  [20.5, 1, 'Smell that? Smoke\'s getting in. Get ready.'],
];

function updateElevator(w, dt) {
  const E = w.flags.elev; if (!E) return;
  for (const p of E.panels) {
    p.open += (p.target - p.open) * Math.min(1, dt * 2.5);
    p.l.position.z = 8.4 - p.open * 0.85; p.r.position.z = 9.3 + p.open * 0.85;
  }
  if (E.state === 'closing') {
    E.t += dt;
    E.panels[0].target = 0;
    if (E.t > 0.4) E.panels[0].dyn.enabled = true;
    if (E.t > 1.5) { E.state = 'riding'; E.t = 0; E.hum = w.sound('elevator_hum', new THREE.Vector3(35.5, Y7 + 1, 9.3), { loop: true, volume: 0.8 }); w.saferoomLocked = false; }
  } else if (E.state === 'riding') {
    E.t += dt;
    const zone = w.builder.zones.find((z) => z.name === 'carUp');
    // gentle shake
    if (Math.random() < dt * 2) w.events.emit('shake', new THREE.Vector3(35.5, Y7, 9.3), 0.15);
    for (const [t, who, text] of RIDE_LINES) if (E.t >= t && E.t - dt < t) { const s = w.survivors[who]; if (s && s.state !== 'dead') { w.subtitles.push({ who: s.name, text, t: 3.2 }); if (w.game && w.game.voice) w.game.voice.say(s, text); } }
    // smoke creeping in
    if (E.t > 16) {
      w.elevatorSmoke = Math.min(1, (E.t - 16) / 7);
      if (Math.random() < dt * 8) w.effects.smokePuff(35.5 + (Math.random() - 0.5) * 2, Y7 + 2.3, 9.3 + (Math.random() - 0.5) * 2, { size: 0.8, life: 3, vy: -0.1, a: 0.6, r: 0.25, g: 0.2, b: 0.16 });
    }
    if (E.t > 23.5) {
      // power dies at the bottom: teleport everyone to the ground-floor car
      if (E.hum) E.hum.stop(0.2);
      w.sound('elevator_stop', new THREE.Vector3(35.5, Y0 + 1, 9.3), { volume: 1 });
      w.events.emit('shake', new THREE.Vector3(35.5, Y0, 9.3), 0.8);
      for (const s of w.survivors) {
        if (s.state === 'dead') continue;
        s.body.pos.y -= (Y7 - Y0); s.lastGrounded.y -= (Y7 - Y0);
        s.body.vel.set(0, 0, 0);
      }
      // nothing left upstairs
      for (const z of w.infected) if (z.position.y > Y7 - 1) z.remove();
      E.state = 'jammed'; E.t = 0;
      w.fieldT = 0;
    }
  } else if (E.state === 'jammed') {
    E.t += dt;
    w.elevatorSmoke = Math.max(0.35, 1 - E.t / 3) ;
    if (E.t > 1 && E.t - dt <= 1) { const s = w.survivors.find((o) => o.state === 'alive'); if (s) w.subtitles.push({ who: s.name, text: 'Power\'s dead. Doors are stuck — we gotta pry \'em!', t: 3.5 }); }
    if (Math.random() < dt * 4) w.effects.smokePuff(35.5 + (Math.random() - 0.5) * 2, Y0 + 2.2, 9.3 + (Math.random() - 0.5) * 2, { size: 0.8, life: 3, vy: -0.05, a: 0.5, r: 0.25, g: 0.2, b: 0.16 });
  } else if (E.state === 'open') {
    E.t += dt;
    w.elevatorSmoke = Math.max(0, (w.elevatorSmoke || 0) - dt * 0.4);
    if (w.elevatorSmoke <= 0) w.elevatorSmoke = 0;
  }
}
