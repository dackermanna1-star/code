// Dynamic resolution controller: steps down when GPU-bound, not when CPU-bound, recovers with headroom,
// and asks for a cheaper preset at the floor.
import { AutoScale } from '../src/render/autoscale';

let fails = 0;
const check = (ok: boolean, msg: string) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${msg}`); if (!ok) fails++; };
const run = (a: AutoScale, seconds: number, frameMs: number, cpuMs: number) => {
  for (let t = 0; t < seconds * 1000; t += frameMs) a.update(frameMs, cpuMs);
};

{
  const a = new AutoScale();
  run(a, 10, 16.7, 6);
  check(a.factor === 1, `holds full resolution at 60 fps (factor ${a.factor})`);
  run(a, 3, 28, 6);
  check(a.factor < 1, `GPU-bound at 36 fps lowers the resolution (factor ${a.factor})`);
  const low = a.factor;
  run(a, 20, 16.7, 6);
  check(a.factor > low, `recovers once frames are fast again (factor ${a.factor})`);
}
{
  const a = new AutoScale();
  run(a, 10, 30, 26);
  check(a.factor === 1, `CPU-bound frames leave the resolution alone (factor ${a.factor})`);
}
{
  const a = new AutoScale();
  let floors = 0;
  a.onFloor = () => { floors++; return floors === 1; };
  run(a, 30, 60, 5);
  check(floors >= 1 && a.factor >= 0.5, `very slow GPU reaches the floor and asks for a lower preset (${floors} requests, factor ${a.factor})`);
}
{
  const a = new AutoScale();
  run(a, 2, 16.7, 5);
  run(a, 1, 5000, 5); // a pause (background tab)
  check(a.factor === 1, `pauses are ignored (factor ${a.factor})`);
}
console.log(fails ? `${fails} FAILED` : 'ALL PASSED');
if (fails) process.exit(1);
