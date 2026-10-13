import { describe, expect, it } from 'vitest';
import { MOVE_DT } from '../src/shared/constants';
import { DEFAULT_MOVE, fallDamage, isStuck, newMoveState, stepMovement, type MoveInput, type MoveState } from '../src/shared/sim/movement';
import { B } from '../src/shared/world/blocks';
import { Chunk, VoxelWorld } from '../src/shared/world/chunk';
import { drive, makeGame, spawnPlayer, ticks } from './helpers';

const FLOOR = 10; // top solid block; players stand at y = FLOOR + 1

function flatWorld(): VoxelWorld {
  const w = new VoxelWorld(0);
  for (let cz = -2; cz < 2; cz++) for (let cx = -2; cx < 2; cx++) {
    const c = new Chunk(cx, cz);
    for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) for (let y = 0; y <= FLOOR; y++) c.set(x, y, z, y === 0 ? B.bedrock : B.stone);
    w.addChunk(c);
  }
  return w;
}

function fill(w: VoxelWorld, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, id: number) {
  for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) w.setBlock(x, y, z, id);
}

/** yaw that faces +X (forward = (-sin yaw, -cos yaw)). */
const FACE_PLUS_X = -Math.PI / 2;

function input(over: Partial<MoveInput> = {}): MoveInput {
  return { seq: 0, f: 0, s: 0, jump: false, sprint: false, crouch: false, yaw: FACE_PLUS_X, pitch: 0, ...over };
}

function run(w: VoxelWorld, s: MoveState, inp: Partial<MoveInput>, secs: number, speedMul = 1) {
  let landed = 0;
  const n = Math.round(secs / MOVE_DT);
  for (let i = 0; i < n; i++) {
    const ev = stepMovement(s, input({ ...inp, seq: i + 1 }), w, MOVE_DT, DEFAULT_MOVE, speedMul);
    if (ev.landedSpeed > 0) landed = ev.landedSpeed;
  }
  return { landed };
}

/** Land a fresh player on the floor at (x, z). */
function standing(w: VoxelWorld, x: number, z: number): MoveState {
  const s = newMoveState(x, FLOOR + 1, z);
  run(w, s, {}, 0.1);
  return s;
}

describe('movement: ground & gravity', () => {
  it('a player standing on the ground stays exactly put with no input', () => {
    const w = flatWorld();
    const s = standing(w, 0.5, 0.5);
    expect(s.onGround).toBe(true);
    run(w, s, {}, 5);
    expect(s.x).toBe(0.5);
    expect(s.z).toBe(0.5);
    expect(s.y).toBeCloseTo(FLOOR + 1, 6);
    expect(s.vy).toBe(0);
    expect(isStuck(w, s)).toBe(false);
  });

  it('gravity accelerates a falling player and they land flush on the floor', () => {
    const w = flatWorld();
    const s = newMoveState(0.5, FLOOR + 21, 0.5);
    run(w, s, {}, 0.5);
    // after 0.5 s of free fall: v ~ g t = 15, drop ~ g t^2 / 2 = 3.75
    expect(s.vy).toBeCloseTo(-DEFAULT_MOVE.gravity * 0.5, 0);
    expect(FLOOR + 21 - s.y).toBeGreaterThan(3.5);
    expect(FLOOR + 21 - s.y).toBeLessThan(4.1);
    expect(s.onGround).toBe(false);
    const { landed } = run(w, s, {}, 3);
    expect(s.onGround).toBe(true);
    expect(s.y).toBeCloseTo(FLOOR + 1, 6);
    expect(landed).toBeGreaterThan(30); // ~sqrt(2 g h) = sqrt(1200) ~ 34.6
    expect(landed).toBeLessThan(36);
  });

  it('terminal velocity caps the fall speed', () => {
    const w = new VoxelWorld(0); // nothing to land on
    const s = newMoveState(0.5, 2000, 0.5);
    run(w, s, {}, 5);
    expect(s.vy).toBe(-DEFAULT_MOVE.terminalVelocity);
  });
});

describe('movement: collisions', () => {
  it('cannot walk through a 2-high wall', () => {
    const w = flatWorld();
    fill(w, 5, FLOOR + 1, -3, 5, FLOOR + 2, 3, B.stone);
    const s = standing(w, 2.5, 0.5);
    run(w, s, { f: 1, sprint: true }, 3);
    expect(s.x).toBeLessThanOrEqual(5 - 0.3 + 1e-6);
    expect(s.x).toBeGreaterThan(4.6); // walked up to it
    expect(isStuck(w, s)).toBe(false);
  });

  it('walking into a 1-block step without jumping does not climb it (no auto-step)', () => {
    const w = flatWorld();
    fill(w, 5, FLOOR + 1, -3, 8, FLOOR + 1, 3, B.stone);
    const s = standing(w, 2.5, 0.5);
    run(w, s, { f: 1 }, 2);
    expect(s.x).toBeLessThanOrEqual(4.7 + 1e-6);
    expect(s.y).toBeCloseTo(FLOOR + 1, 6);
  });

  it('cannot tunnel through a 1-block-thick wall at very high speed', () => {
    const w = flatWorld();
    fill(w, 5, FLOOR + 1, -3, 5, FLOOR + 2, 3, B.stone);
    for (const mul of [5, 20, 60]) {
      const s = standing(w, 2.5, 0.5);
      run(w, s, { f: 1 }, 1, mul); // up to 4.3 * 60 = 258 blocks/s = 4.3 blocks per step
      expect(s.x, `speed x${mul}`).toBeLessThan(5);
      expect(isStuck(w, s)).toBe(false);
    }
    // a single huge step (e.g. a lag spike with a big dt) is also swept in sub-block increments
    const s = standing(w, 2.5, 0.5);
    s.vx = 400;
    stepMovement(s, input(), w, 0.25, DEFAULT_MOVE);
    expect(s.x).toBeLessThan(5);
  });

  it('cannot fall through a 1-block floor at terminal velocity', () => {
    const w = new VoxelWorld(0);
    const c = new Chunk(0, 0);
    c.set(4, 20, 4, B.stone);
    w.addChunk(c);
    const s = newMoveState(4.5, 120, 4.5);
    run(w, s, {}, 6);
    expect(s.y).toBeCloseTo(21, 6);
    expect(s.onGround).toBe(true);
  });

  it('a jump clears a 1-block step but not a 2-block one', () => {
    const w = flatWorld();
    fill(w, 5, FLOOR + 1, -3, 8, FLOOR + 1, -1, B.stone); // 1-high ledge on z<0
    fill(w, 5, FLOOR + 1, 1, 8, FLOOR + 2, 3, B.stone); //   2-high ledge on z>0
    const a = standing(w, 3.5, -2.5);
    run(w, a, { f: 1, jump: true }, 2);
    expect(a.x).toBeGreaterThan(5.3);
    expect(a.y).toBeGreaterThanOrEqual(FLOOR + 2 - 1e-6);
    const b = standing(w, 3.5, 2.5);
    run(w, b, { f: 1, jump: true }, 2);
    expect(b.x).toBeLessThanOrEqual(4.7 + 1e-6);
    // jump apex v^2 / 2g ~ 1.41 blocks: enough for 1, not for 2
    expect(DEFAULT_MOVE.jumpVelocity ** 2 / (2 * DEFAULT_MOVE.gravity)).toBeGreaterThan(1.05);
    expect(DEFAULT_MOVE.jumpVelocity ** 2 / (2 * DEFAULT_MOVE.gravity)).toBeLessThan(2);
  });

  it('cannot jump through a ceiling', () => {
    const w = flatWorld();
    fill(w, -3, FLOOR + 3, -3, 3, FLOOR + 3, 3, B.stone); // 2-high room
    const s = standing(w, 0.5, 0.5);
    run(w, s, { jump: true }, 2);
    expect(s.y + 1.8).toBeLessThanOrEqual(FLOOR + 3 + 1e-6);
    expect(isStuck(w, s)).toBe(false);
  });
});

describe('movement: crouch, water', () => {
  it('crouching stops the player at a ledge; walking does not', () => {
    const w = flatWorld();
    // raised platform x in [0, 6) at FLOOR+1 .. FLOOR+4, open drop beyond x = 6
    fill(w, -4, FLOOR + 1, -4, 5, FLOOR + 4, 4, B.stone);
    const top = FLOOR + 5;
    const crouched = newMoveState(3.5, top, 0.5);
    run(w, crouched, { crouch: true }, 0.2);
    run(w, crouched, { f: 1, crouch: true }, 4);
    expect(crouched.y).toBeCloseTo(top, 6);
    expect(crouched.onGround).toBe(true);
    expect(crouched.x).toBeLessThan(6 + 0.3);
    expect(crouched.x).toBeGreaterThan(5.5); // shuffled right up to the edge

    const walker = newMoveState(3.5, top, 0.5);
    run(w, walker, { f: 1 }, 2);
    expect(walker.y).toBeLessThan(top - 1);
  });

  it('a crouched player cannot stand up where a standing body would hit the ceiling', () => {
    const w = flatWorld();
    fill(w, -3, FLOOR + 3, -3, 3, FLOOR + 3, 3, B.stone); // 2-block-high room
    // crouched (1.5 tall) and lifted 0.4 (e.g. mid-jump): head at 2.9 fits, standing (1.8) would reach 3.2
    const s = newMoveState(0.5, FLOOR + 1.4, 0.5);
    s.crouching = true;
    stepMovement(s, input({ crouch: false }), w, MOVE_DT, DEFAULT_MOVE);
    expect(s.crouching).toBe(true);
    expect(isStuck(w, s)).toBe(false);
    // once back on the floor there is room again
    run(w, s, { crouch: false }, 1);
    expect(s.y).toBeCloseTo(FLOOR + 1, 6);
    expect(s.crouching).toBe(false);
  });

  it('water slows horizontal movement and sinking', () => {
    const w = flatWorld();
    // 3-deep pool on x >= 0 (floor lowered to FLOOR - 3)
    fill(w, 0, FLOOR - 2, -8, 15, FLOOR, 8, B.water);
    fill(w, 0, FLOOR + 1, -8, 15, FLOOR + 1, 8, B.water);
    const swim = newMoveState(2.5, FLOOR - 2, 0.5);
    run(w, swim, {}, 0.5);
    expect(swim.inWater).toBe(true);
    const x0 = swim.x;
    run(w, swim, { f: 1, sprint: true }, 2);
    const swimDist = swim.x - x0;

    const land = standing(w, -14.5, 0.5);
    const l0 = land.x;
    run(w, land, { f: 1 }, 2);
    const walkDist = land.x - l0;
    expect(swimDist).toBeGreaterThan(1);
    expect(swimDist).toBeLessThan(walkDist * 0.75);
    expect(swimDist / 2).toBeLessThanOrEqual(DEFAULT_MOVE.swimSpeed + 0.01);

    // sinking is slow and capped: 3 blocks of water take far longer than 3 blocks of air
    const sink = newMoveState(8.5, FLOOR + 0.9, 0.5);
    let minVy = 0, steps = 0;
    while (sink.y > FLOOR - 2 + 1e-6 && steps < 600) {
      stepMovement(sink, input({ seq: ++steps }), w, MOVE_DT, DEFAULT_MOVE);
      minVy = Math.min(minVy, sink.vy);
    }
    expect(minVy).toBeGreaterThanOrEqual(-4);
    expect(steps * MOVE_DT).toBeGreaterThan(Math.sqrt((2 * 3) / DEFAULT_MOVE.gravity) * 2);
  });
});

describe('fall damage', () => {
  it('follows the documented curve: ~4-block falls are free, then grows steadily', () => {
    expect(fallDamage(0)).toBe(0);
    expect(fallDamage(15.5)).toBe(0);
    expect(fallDamage(16)).toBeGreaterThan(0);
    let prev = 0;
    for (let v = 15.5; v <= 60; v += 0.5) {
      const d = fallDamage(v);
      expect(d).toBeGreaterThanOrEqual(prev);
      prev = d;
    }
    // a fall at terminal velocity is lethal
    expect(fallDamage(DEFAULT_MOVE.terminalVelocity)).toBeGreaterThanOrEqual(100);
  });

  it('simulated falls: 3-4 blocks free, 6 blocks hurts, 15 blocks kills', () => {
    const dmgFor = (h: number) => {
      const w = flatWorld();
      fill(w, -3, FLOOR + 1, -3, 3, FLOOR + h, 3, B.stone);
      const s = newMoveState(0.5, FLOOR + h + 1, 0.5);
      run(w, s, {}, 0.1); // land on the tower
      const { landed } = run(w, s, { f: 1 }, 4); // walk off the edge
      expect(s.y).toBeCloseTo(FLOOR + 1, 6);
      return fallDamage(landed);
    };
    expect(dmgFor(3)).toBe(0);
    expect(dmgFor(4)).toBe(0);
    const six = dmgFor(6);
    expect(six).toBeGreaterThan(0);
    expect(six).toBeLessThan(50);
    expect(dmgFor(15)).toBeGreaterThanOrEqual(100);
  });
});

describe('server-authoritative movement', () => {
  it('flooding the server with input commands does not make a player faster (speed-hack guard)', () => {
    const game = makeGame();
    const { p } = spawnPlayer(game, 'Speedy', -40.5, 8.5);
    const x0 = p.x;
    let seq = p.lastSeq;
    for (let t = 0; t < 40; t++) {
      // 3 messages x 30 commands per tick = 30x real time
      for (let m = 0; m < 3; m++) {
        const cmds: MoveInput[] = [];
        for (let k = 0; k < 30; k++) cmds.push(input({ seq: ++seq, f: 1, sprint: true }));
        game.handle(p, { t: 'in', cmds });
      }
      game.tick();
    }
    // 2 s of sprinting at most, plus the 0.25 s catch-up budget the server allows for network jitter
    expect(p.x - x0).toBeLessThanOrEqual(DEFAULT_MOVE.sprintSpeed * (2 + 0.25) + 0.01);
    expect(p.x - x0).toBeGreaterThan(5);
  });

  it('out-of-range and non-numeric input values are sanitized', () => {
    const game = makeGame();
    const { p } = spawnPlayer(game, 'Glitchy', -40.5, 8.5);
    const x0 = p.x;
    const cmds = Array.from({ length: 30 }, (_, i) => ({ seq: p.lastSeq + 1 + i, f: 1e9, s: Number.NaN, jump: 'yes', sprint: false, crouch: false, yaw: -Math.PI / 2, pitch: 99 }));
    game.handle(p, { t: 'in', cmds: cmds as unknown as MoveInput[] });
    ticks(game, 10);
    expect(Number.isFinite(p.x) && Number.isFinite(p.z)).toBe(true);
    expect(p.x - x0).toBeLessThanOrEqual(DEFAULT_MOVE.walkSpeed * 0.5 + 0.01);
    // replayed (old) sequence numbers are ignored
    const x1 = p.x;
    game.handle(p, { t: 'in', cmds: cmds.slice(0, 10) as unknown as MoveInput[] });
    ticks(game, 5);
    expect(p.x).toBeCloseTo(x1, 6);
  });

  it('the server replays the same physics as the shared step function', () => {
    const game = makeGame();
    const { p } = spawnPlayer(game, 'Twin', -40.5, 8.5);
    const local = { ...p.move };
    drive(game, p, 1.5, { f: 1, s: 0.5, yaw: 0.3, jump: true });
    for (let i = 0; i < 90; i++) stepMovement(local, input({ f: 1, s: 0.5, yaw: 0.3, jump: true }), game.world, MOVE_DT);
    expect(p.x).toBeCloseTo(local.x, 9);
    expect(p.y).toBeCloseTo(local.y, 9);
    expect(p.z).toBeCloseTo(local.z, 9);
  });
});
