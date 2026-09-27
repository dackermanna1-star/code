// Small sandbox used for engine testing (not part of the campaign).
export function buildTestLevel(L) {
  L.env = Object.assign(L.env, { fog: 0x0b0e14, fogDensity: 0.025, hemiSky: 0x3a4458, hemiGround: 0x18140f, hemiIntensity: 0.5, moon: { dir: [0.4, 1, 0.25], intensity: 0.5 }, sky: true, hospitalAz: 0.6 });
  // street
  L.floor(-40, -60, 40, 60, 0, 'asphalt', 0.5);
  L.box(-40, 0, -60, -12, 0.15, 60, 'sidewalk');
  L.box(12, 0, -60, 40, 0.15, 60, 'sidewalk');
  // buildings
  L.box(-40, 0, -60, -18, 22, -10, 'brick');
  L.box(-40, 0, 10, -18, 18, 60, 'brickDark');
  L.box(18, 0, -60, 40, 26, -20, 'brickTan');
  L.box(18, 0, 20, 40, 14, 60, 'concrete');
  // room with door on the left side
  const x0 = -18, x1 = -8, z0 = -10, z1 = 10;
  L.floor(x0, z0, x1, z1, 0.15, 'woodFloor', 0.2);
  L.ceiling(x0, z0, x1, z1, 3.2, 'ceiling');
  L.wallZ(z0, z1, x1, 0.15, 3.2, 'wallpaper', 0.2, [{ a: -1, b: 1, y1: 2.3 }]);
  L.wallX(x0, x1, z0, 0.15, 3.2, 'plaster', 0.2);
  L.wallX(x0, x1, z1, 0.15, 3.2, 'plaster', 0.2, [{ a: -14, b: -12.5, y0: 1.0, y1: 2.3 }]);
  L.box(-16, 0.15, -8, -14, 0.9, -7, 'wood');
  L.light(-13, 3.0, 0, 0xffd9a0, 12, 10, { flicker: 0.3 });
  L.box(-13.2, 3.1, -0.2, -12.8, 3.2, 0.2, 'emissiveWarm', { collide: false });
  // crates & ledge for climbing
  L.box(2, 0, 5, 4, 1.2, 7, 'wood');
  L.box(-4, 0, 20, 4, 2.5, 22, 'concrete');
  L.stairs(6, 25, 9, 32, 0, 3, '+z', 'concrete');
  L.box(6, 0, 32, 14, 3, 40, 'concrete');
  // street lights
  for (let z = -50; z <= 50; z += 20) {
    L.box(10.8, 0, z - 0.1, 11, 6, z + 0.1, 'metalDark');
    L.box(9.5, 5.9, z - 0.2, 11, 6.05, z + 0.2, 'metalDark');
    L.box(9.6, 5.85, z - 0.15, 10.2, 5.9, z + 0.15, 'emissiveWarm', { collide: false });
    L.light(9.9, 5.6, z, 0xffc880, 30, 18, { flicker: z === -10 ? 0.8 : 0 });
  }
  L.survivorStart.push({ x: 0, y: 0, z: -20, yaw: Math.PI }, { x: 1.2, y: 0, z: -21, yaw: Math.PI }, { x: -1.2, y: 0, z: -21, yaw: Math.PI }, { x: 0, y: 0, z: -22, yaw: Math.PI });
  L.flowStart = [0, 0, -20];
  L.flowEnd = [0, 0, 50];
}
