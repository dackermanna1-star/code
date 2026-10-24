import { World } from '../src/world/world';
import { generateFactory, MAP } from '../src/map/factory';
import { Stress } from '../src/world/stress';
const world = new World(MAP.sx, MAP.sy, MAP.sz, MAP.G);
generateFactory(world);
const stress = new Stress(world);
const t0 = performance.now();
for (let k = 0; k < 3; k++) for (const [x, z] of [[1216, 704], [1344, 704], [1088, 576], [320, 704], [1600, 2048]]) stress.analyze(x, z);
console.log('15 heavy analyses', (performance.now() - t0).toFixed(0), 'ms');
