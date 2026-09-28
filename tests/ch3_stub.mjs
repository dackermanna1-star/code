// Isolate chapter-3 tests from other chapters being edited in parallel:
// serve minimal placeholder modules for ch2/ch4/ch5.
const STUB = (id) => `import { safeRoom } from './kit.js';
export default { id: '${id}', title: '${id}', def: { director: { wanderers: 4 } },
  build(L) { L.env = Object.assign(L.env, { skyOpts: { none: true } }); L.floor(-10, -10, 20, 40, 0, 'concrete');
    safeRoom(L, { x0: 0, z0: 0, x1: 8, z1: 8, y: 0, h: 3, doorWall: 's', doorAt: 4 });
    safeRoom(L, { x0: 0, z0: 30, x1: 8, z1: 38, y: 0, h: 3, doorWall: 'n', doorAt: 4, end: true });
    for (let i = 0; i < 4; i++) L.survivorStart.push({ x: 2 + i * 1.3, y: 0, z: 5, yaw: Math.PI });
    L.flowStart = [4, 0, 5]; L.flowEnd = [4, 0, 34]; } };`;
export async function stubOthers(page) {
  if (process.env.NOSTUB) return;
  for (const [file, id] of [['ch2_subway', 'subway'], ['ch4_hospital', 'hospital'], ['ch5_rooftop', 'rooftop']]) {
    await page.route(new RegExp(`/src/levels/${file}\\.js`), (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: STUB(id) }));
  }
}
