import { boot, snap } from './ch4_util.mjs';
// Chapter 4 route connectivity: progress along the intended path.
export const ROUTE = [
  ['start', 75.5, 0, 55.6], ['safeDoorOut', 70, 0, 55.4], ['lobby', 56, 0, 47], ['erCheckpt', 36, 0, 45.5], ['erMid', 20, 0, 47], ['erExit', 1.9, 0, 31],
  ['f1corr', 1.8, 0, 20], ['stairA_bot', 1.9, 0, 8.5], ['stairA_mid', 3.4, 2, 1.2], ['stairA_top', 4.9, 4, 8.5], ['f2corr', 10, 4, 10.6], ['f2room3', 20, 4, 17],
  ['f2room4', 28, 4, 17], ['f2corrE', 30, 4, 10.6], ['hub', 44, 4, 12], ['southCorr', 43.5, 4, 26], ['balconyN', 50, 4, 32], ['balconyE', 70, 4, 40],
  ['icuCorr', 80, 4, 42.4], ['stairB_bot', 91.1, 4, 45], ['stairB_mid', 92.6, 6, 52], ['stairB_top', 94.1, 8, 44.8], ['f3east', 94, 8, 38], ['or1', 86, 8, 34],
  ['or2', 86, 8, 24], ['f3eastN', 94, 8, 18], ['f3north', 80, 8, 13.6], ['f3mid', 45, 8, 13.6], ['maint', 35, 8, 10], ['maintW', 20, 8, 11], ['f3west', 14, 8, 13.6],
  ['stairC_bot', 10.5, 8, 16], ['stairC_top', 7.5, 12, 15.8], ['admin', 20, 12, 13.6], ['farm', 24, 12, 25], ['westHall', 39, 12, 32.4], ['elevLobby', 54, 12, 30],
  ['lowerCar', 54, 12, 22], ['upperCar', 54, 108, 22], ['f28lobby', 54, 108, 27], ['southFloor', 60, 108, 35], ['eastStrip', 72, 108, 24], ['scaffold', 77.3, 108, 26],
  ['scaffoldN', 77.3, 108, 8], ['neRoom', 72, 108, 12], ['stairEntry', 65.5, 108, 12.5], ['stairTop', 68.5, 112, 10], ['f29', 70, 112, 20], ['ledge', 54, 112, 25],
  ['f29west', 43, 112, 20], ['safeDoor', 43, 112, 8.6], ['end', 38, 112, 6.8],
];
export default async ({ page, evalg, wait }) => {
  await boot(page, evalg, wait);
  const r = await evalg((pts) => {
    const g = window.game, L = g.level, nav = L.nav;
    const out = [`nav nodes ${nav.N}, boxes ${L.col.n}, lights ${L.lights.length}, meshes ${L.meshes.length}, loadMs ${Math.round(g.loadMs)}`];
    for (const [k, x, y, z] of pts) {
      const n = nav.nearestNode(x, y, z, 1.5);
      out.push(k.padEnd(14) + (n < 0 ? 'NO NODE' : (L.progressAt(nav.nodeX(n), nav.nodeY[n], nav.nodeZ(n)).toFixed(3) + ' y=' + nav.nodeY[n].toFixed(2) + ' toExit=' + nav.fields.toExit[n].toFixed(0))));
    }
    return out;
  }, ROUTE);
  console.log(r.join('\n'));
};
