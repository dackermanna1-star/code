// Chapter 2 — THE SUBWAY (placeholder until authored)
import { safeRoom, supplies } from './kit.js';

export default {
  id: 'subway',
  title: 'The Subway',
  def: { director: { wanderers: 10 } },
  build(L, game) {
    L.env = Object.assign(L.env, { skyOpts: { none: true }, fog: 0x080808, fogDensity: 0.03 });
    safeRoom(L, { x0: 0, z0: 0, x1: 8, z1: 8, y: 0, h: 3, doorWall: 's', doorAt: 4 });
    L.floor(-10, 8, 18, 40, 0, 'concrete');
    L.box(-10, 0, 8, -9.8, 4, 40, 'concrete'); L.box(17.8, 0, 8, 18, 4, 40, 'concrete');
    safeRoom(L, { x0: 0, z0: 40, x1: 8, z1: 48, y: 0, h: 3, doorWall: 'n', doorAt: 4, end: true });
    supplies(L, 4, 0, 1, 0, ['medkit', 'smg']);
    for (let i = 0; i < 4; i++) L.survivorStart.push({ x: 2 + i * 1.3, y: 0, z: 5, yaw: Math.PI });
    L.flowStart = [4, 0, 5];
    L.flowEnd = [4, 0, 44];
  },
};
