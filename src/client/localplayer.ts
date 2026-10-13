import { MOVE_DT } from '../shared/constants';
import { CROUCH_EYE_HEIGHT, DEFAULT_MOVE, EYE_HEIGHT, newMoveState, stepMovement, type MoveInput, type MoveState, type MoveEvents } from '../shared/sim/movement';
import type { BlockAccess } from '../shared/world/chunk';

/**
 * Client-side prediction for the local player. Inputs are simulated
 * immediately with the shared movement code and also sent to the
 * simulation; when an authoritative state arrives, unacknowledged inputs
 * are replayed on top of it. Visual error is smoothed instead of snapping.
 */
export class LocalPlayer {
  state: MoveState = newMoveState(0, 0, 0);
  private prev: MoveState = newMoveState(0, 0, 0);
  private pending: MoveInput[] = [];
  private outbox: MoveInput[] = [];
  private seq = 0;
  private acc = 0;
  yaw = 0;
  pitch = 0;
  /** Smoothed correction offset added to the rendered position. */
  private offset = { x: 0, y: 0, z: 0 };
  corrections = 0;
  noSprint = false;

  teleport(x: number, y: number, z: number) {
    this.state = newMoveState(x, y, z);
    this.prev = { ...this.state };
    this.pending = [];
    this.offset = { x: 0, y: 0, z: 0 };
  }

  /** Advance prediction by real time `dt`. Returns movement events of the steps run. */
  update(dt: number, inp: Omit<MoveInput, 'seq' | 'yaw' | 'pitch'>, world: BlockAccess): MoveEvents[] {
    const events: MoveEvents[] = [];
    this.acc = Math.min(this.acc + dt, 0.25);
    while (this.acc >= MOVE_DT) {
      this.acc -= MOVE_DT;
      const cmd: MoveInput = { ...inp, sprint: inp.sprint && !this.noSprint, seq: ++this.seq, yaw: this.yaw, pitch: this.pitch };
      this.prev = { ...this.state };
      events.push(stepMovement(this.state, cmd, world, MOVE_DT, DEFAULT_MOVE));
      this.pending.push(cmd);
      this.outbox.push(cmd);
    }
    if (this.pending.length > 240) this.pending.splice(0, this.pending.length - 240);
    const k = Math.exp(-dt * 10);
    this.offset.x *= k; this.offset.y *= k; this.offset.z *= k;
    return events;
  }

  /** Inputs not yet sent. */
  takeOutbox(): MoveInput[] {
    const o = this.outbox;
    this.outbox = [];
    return o;
  }

  /** Authoritative state for input `ack`. */
  reconcile(ack: number, me: number[], world: BlockAccess) {
    const before = { x: this.state.x, y: this.state.y, z: this.state.z };
    const s = this.state;
    s.x = me[0]; s.y = me[1]; s.z = me[2]; s.vx = me[3]; s.vy = me[4]; s.vz = me[5];
    const f = me[6];
    s.onGround = (f & 1) !== 0; s.inWater = (f & 2) !== 0; s.crouching = (f & 4) !== 0;
    this.pending = this.pending.filter((c) => c.seq > ack);
    for (const c of this.pending) stepMovement(s, c, world, MOVE_DT, DEFAULT_MOVE);
    const ex = before.x - s.x, ey = before.y - s.y, ez = before.z - s.z;
    const err = Math.hypot(ex, ey, ez);
    if (err > 0.001) {
      this.corrections++;
      if (err < 3) {
        this.offset.x += ex; this.offset.y += ey; this.offset.z += ez;
      } else this.offset = { x: 0, y: 0, z: 0 };
    }
    this.prev = { ...s, x: s.x + 0, y: s.y, z: s.z };
  }

  /** Interpolated, smoothed eye position for rendering. */
  eye(): [number, number, number] {
    const a = this.acc / MOVE_DT;
    const p = this.prev, s = this.state;
    const eh = s.crouching ? CROUCH_EYE_HEIGHT : EYE_HEIGHT;
    return [p.x + (s.x - p.x) * a + this.offset.x, p.y + (s.y - p.y) * a + eh + this.offset.y, p.z + (s.z - p.z) * a + this.offset.z];
  }

  /** Exact (un-smoothed) eye for raycasts that must match the simulation. */
  simEye(): [number, number, number] {
    return [this.state.x, this.state.y + (this.state.crouching ? CROUCH_EYE_HEIGHT : EYE_HEIGHT), this.state.z];
  }
}
