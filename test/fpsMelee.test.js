// The first-person melee pipeline without rendering: the arsenal's move state machine, the poses
// of the first-person sandbox mode and the sandbox's melee striker, as the game drives them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Vec3, makeRng } from '../src/physics/math.js';
import { World } from '../src/physics/world.js';
import { Ragdoll } from '../src/human/ragdoll.js';
import { BodyShape } from '../src/human/bodyShape.js';
import { Sandbox } from '../src/game/sandbox.js';
import { FpsPlayer } from '../src/fps/player.js';
import { Arsenal, SANDBOX_LOADOUT } from '../src/fps/arsenal.js';
import { FpsSandboxMode } from '../src/modes/fpsSandbox.js';

const shape = new BodyShape(new Ragdoll(new World()).segList.map((s) => s.name));
const FIXED = 1 / 60;

/** A dummy at the origin facing the player, who stands `dist` m away on +z looking at its `aim`. */
function setup(seed, dist, aim) {
  const sb = new Sandbox({ shape, rng: makeRng(seed) });
  const p = sb.spawnPerson(new Vec3(0, 0, 0), 0);
  for (let i = 0; i < 60; i++) sb.step(FIXED);
  const m = Object.create(FpsSandboxMode.prototype);
  m.host = { sandbox: () => sb };
  m.player = new FpsPlayer({ z: dist });
  m.arsenal = new Arsenal(SANDBOX_LOADOUT, { infinite: true });
  m.view = {};
  m.shake = 0;
  m.strike = null;
  const t = p.rd.segments[aim].body.pos, e = m.player.eye();
  m.player.pitch = Math.atan2(t.y - e.y, Math.hypot(t.x - e.x, t.z - e.z));
  return { sb, p, m };
}

/** Run the game loop for `seconds` with the trigger held while hold(t) is true. */
function play(sb, m, seconds, hold, key = null) {
  const fx = [];
  for (let i = 0, n = Math.round(seconds / FIXED); i < n; i++) {
    const t = i * FIXED;
    if (key && i === 0) key(m);
    m.arsenal.update(FIXED, hold(t), false, false);
    m.arsenal.events.length = 0;
    if (m.arsenal.melee && m.arsenal.melee.phase === 'strike') m.meleeStep();
    else m.endStrike();
    sb.step(FIXED);
    fx.push(...sb.drainFx());
  }
  return fx;
}

test('first person: a wound-up bat swing to the ribs lands and breaks ribs', () => {
  let broke = 0;
  for (const seed of [1, 2, 3]) {
    const { sb, p, m } = setup(seed, 1.05, 'chest');
    m.arsenal.select(SANDBOX_LOADOUT.findIndex((g) => g.type === 'bat'));
    play(sb, m, 1.5, () => false); // (holster the pistol, draw the bat)
    assert.equal(m.arsenal.gun.type, 'bat');
    const fx = play(sb, m, 2.2, (t) => t < 1.0);
    const hits = fx.filter((e) => e.type === 'meleeHit' && e.person === p);
    assert.ok(hits.length >= 1, `seed ${seed}: the swing missed`);
    if (p.injury.fractures.some((f) => f.label === 'ribs')) broke++;
  }
  assert.ok(broke >= 2, `ribs broken in ${broke}/3 full swings`);
});

test('first person: a quick jab lands without breaking anything; a stomp on a downed head lands', () => {
  const { sb, p, m } = setup(4, 0.75, 'head');
  m.arsenal.select(SANDBOX_LOADOUT.findIndex((g) => g.type === 'fists'));
  play(sb, m, 1.5, () => false);
  const fx = play(sb, m, 0.8, (t) => t < 0.05);
  const jab = fx.filter((e) => e.type === 'meleeHit' && e.person === p);
  assert.ok(jab.length === 1 && jab[0].weapon === 'fists', 'the jab landed once');
  assert.equal(p.injury.fractures.length, 0);
  // knock it down and stamp on its head
  p.injury.knockOut(30, 0.9);
  play(sb, m, 3, () => false);
  const head = p.rd.segments.head.body.pos;
  m.player.pos.set(head.x, 0, head.z + 0.55);
  m.player.yaw = 0;
  const target = m.stompTarget();
  assert.ok(target && target.person === p, 'the dummy on the floor is a stomp target');
  m.arsenal.kick(true);
  const st = play(sb, m, 1, () => false);
  assert.ok(st.some((e) => e.type === 'meleeHit' && e.weapon === 'boot' && e.person === p), 'the stomp landed');
});
