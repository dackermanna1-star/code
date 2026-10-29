// Push recovery: shoves of 30-80 N*s (0.15 s) at the chest from 6 directions. Score = cases in which
// the dummy never leaves balance mode for 6 s. Also counts recovery steps (fewer = more efficient).
import { scene, run, report, Vec3 } from './common.mjs';

const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [-1, -1]];
const impulses = (process.env.IMPULSES || '30,45,60,80').split(',').map(Number);
let ok = 0, tot = 0, steps = 0;
const rows = [];
for (const imp of impulses) {
  let line = `${String(imp).padStart(3)} N*s: `;
  for (const [x, z] of dirs) {
    const { sb, person } = scene(1);
    const chest = person.rd.segments.chest.body;
    sb.shove(chest, chest.pos.clone(), new Vec3(x, 0, z).normalize().scale(imp), 0.15);
    let fell = false, st = 0;
    run(sb, 6, () => {
      st += person.ctl.events.filter((e) => e.type === 'step').length;
      if (person.ctl.mode !== 'balance') {
        fell = true;
        return false;
      }
    });
    tot++;
    if (!fell) {
      ok++;
      steps += st;
    }
    line += `${x},${z}:${fell ? 'FALL' : 'ok'}(${st}) `;
  }
  rows.push(line);
  console.log(line);
}
report('push', { recovered: ok, total: tot, stepsWhenRecovered: steps });
