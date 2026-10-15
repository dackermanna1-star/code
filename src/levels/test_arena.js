// Small systems-test map: start saferoom -> hall -> yard -> end saferoom.
import * as THREE from 'three';

export default {
  id: 'test', name: 'Test Arena', chapter: 0,
  env: { fog: 0x2a2c30, fogNear: 14, fogFar: 70, clear: 0x2a2c30 },
  builderOpts: { ambientSky: 0x3a3c44, ambientGround: 0x1c1a18, sun: { dir: [0.5, 0.8, 0.3], color: new THREE.Color(0.8, 0.65, 0.45) }, skyRays: 4, skyColor: 0x6a7080 },
  director: { variant: 'civilian', hazmatChance: 0.1, wanderers: 10, bosses: [] },
  build(L) {
    // start saferoom 6x6 at origin
    L.room({ x0: -3, z0: -3, x1: 3, z1: 3, y: 0, h: 3, floor: 'tileWhite', wall: 'plasterGreen', wallOut: 'brick', doors: { n: [{ at: 3, w: 1.2, h: 2.2 }] } });
    L.zone([-3, 0, -3], [3, 3, 3], { saferoom: 'start', skyRays: 0, sky: new THREE.Color(0.25, 0.26, 0.24) });
    L.doors.push({ pos: [-0.6, 0, -3], width: 1.2, height: 2.2, rotY: 0, type: 'saferoom', name: 'startDoor' });
    L.light([0, 2.8, 0], 0xffe8c0, 8, 1.2);
    for (let i = 0; i < 4; i++) L.marker('survivorStart', [-1.5 + i, 0.05, 1.5], { yaw: 0 });
    L.box([-2.8, 0, 1.8], [-1.2, 0.9, 2.8], 'woodDark');
    L.marker('weapon', [-2.3, 0.9, 2.1], { id: 'smg', infinite: true });
    L.marker('weapon', [-1.6, 0.9, 2.5], { id: 'pump_shotgun', infinite: true });
    L.box([1.2, 0, 1.8], [2.8, 0.9, 2.8], 'woodDark');
    for (let i = 0; i < 4; i++) L.marker('item', [1.4 + i * 0.4, 0.9, 2.2], { id: 'medkit' });
    L.marker('ammo', [2.4, 0, -2.2]);
    // hallway north
    L.room({ x0: -2, z0: -20, x1: 2, z1: -3, y: 0, h: 3.2, floor: 'carpetRed', wall: 'wallpaper', wallOut: 'brick', walls: { s: false }, doors: { n: [{ at: 2, w: 2, h: 2.6 }] } });
    L.light([0, 3, -10], 0xffd090, 9, 1.0);
    L.light([0, 3, -17], 0xff7030, 7, 1.0, { flicker: 1 });
    L.marker('item', [1.5, 0, -8], { id: 'pills' });
    L.marker('item', [-1.5, 0, -12], { id: 'pipebomb' });
    L.marker('item', [1.5, 0, -15], { id: 'molotov' });
    L.marker('item', [-1.5, 0, -18], { id: 'bilejar' });
    // big hall with pillars and stairs to a mezzanine
    L.room({ x0: -14, z0: -44, x1: 14, z1: -20, y: 0, h: 8, floor: 'tileMall', wall: 'plaster', wallOut: 'brick', doors: { s: [{ at: 14, w: 2, h: 2.6 }], n: [{ at: 24, w: 3, h: 3 }] } });
    for (const [x, z] of [[-7, -27], [7, -27], [-7, -37], [7, -37]]) L.box([x - 0.5, 0, z - 0.5], [x + 0.5, 8, z + 0.5], 'concrete');
    L.slab(-14, -44, -6, -36, 4, 0.3, 'concrete', 'ceiling', { edges: true });
    L.stairs([-10, 0, -30], 'n', 2, 4, 6, 18, 'concrete', { rails: true });
    L.wall(-6, -36, -6, -44, 4, 5, 'metalDark', { thick: 0.1 });
    L.light([0, 7, -32], 0xc8d0ff, 18, 1.0);
    L.light([-10, 7, -40], 0xffd090, 10, 1.0);
    L.marker('weapon', [-10, 4, -40], { id: 'm16' });
    L.marker('weapon', [-9, 4, -41], { id: 'auto_shotgun' });
    L.marker('weapon', [-11, 4, -42], { id: 'hunting_rifle' });
    L.marker('carry', [6, 0, -24], { id: 'gascan' });
    L.marker('carry', [8, 0, -24], { id: 'propane' });
    L.box([2, 0, -34], [5, 1.2, -32], 'metalRed');
    L.box([-3, 0, -28], [-1, 1, -27], 'woodLight');
    // outdoor yard
    L.floor(-20, -80, 20, -44, 0, 'asphalt');
    L.wall(-20, -80, -20, -44, 0, 4, 'brickDark', { thick: 0.4 });
    L.wall(20, -44, 20, -80, 0, 4, 'brickDark', { thick: 0.4 });
    L.wall(-20, -80, 20, -80, 0, 4, 'brickDark', { thick: 0.4, openings: [{ at: 20, w: 1.4, h: 2.3 }] });
    L.box([-6, 0, -60], [-2, 1.5, -56], 'metal', { tint: [0.6, 0.15, 0.1] });
    L.box([4, 0, -66], [9, 1.6, -63], 'metal', { tint: [0.15, 0.25, 0.5] });
    L.box([-14, 0, -72], [-10, 2.4, -68], 'concrete');
    // end saferoom
    L.room({ x0: -3, z0: -88, x1: 3, z1: -80.2, y: 0, h: 3, floor: 'tileWhite', wall: 'plasterGreen', wallOut: 'brick', walls: { s: false } });
    L.zone([-3, 0, -88], [3, 3, -80.2], { saferoom: 'end', skyRays: 0, sky: new THREE.Color(0.25, 0.26, 0.24) });
    L.doors.push({ pos: [-0.7, 0, -80], width: 1.4, height: 2.3, rotY: 0, type: 'saferoom', name: 'endDoor', open: true });
    L.light([0, 2.8, -84], 0xffe8c0, 8, 1.2);
    L.marker('goal', [0, 0, -85]);
    for (let i = 0; i < 4; i++) L.marker('item', [-2 + i * 0.5, 0, -87.5], { id: 'medkit' });
  },
};
