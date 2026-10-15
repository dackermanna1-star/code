// Footstep cadence (simulation side, so culled bots still make AI-audible noise).
// Steps are emitted by distance travelled with stride lengths that match the animation cadence.
import { ctx } from '../../core/GameContext';
import type { Character } from '../Character';
import { FOOTSTEP_NOISE, STEP_LENGTH } from '../constants';

export function stepLengthFor(c: Character): number {
  if (c.lifeState === 'knocked') return STEP_LENGTH.knocked;
  if (c.mode === 'swim') return STEP_LENGTH.swim;
  if (c.stance === 'prone') return STEP_LENGTH.prone;
  if (c.stance === 'crouch') return STEP_LENGTH.crouch * (c.isSprinting ? 1.3 : c.gait === 'run' ? 1.1 : 1);
  if (c.isSprinting) return STEP_LENGTH.sprint;
  if (c.gait === 'walk') return STEP_LENGTH.walk;
  return STEP_LENGTH.run;
}

export function noiseRadiusFor(c: Character): number {
  if (c.mode === 'swim') return FOOTSTEP_NOISE.swim;
  if (c.stance === 'prone' || c.lifeState === 'knocked') return FOOTSTEP_NOISE.prone;
  if (c.stance === 'crouch') return c.isSprinting ? FOOTSTEP_NOISE.run : FOOTSTEP_NOISE.crouch;
  if (c.isSprinting) return FOOTSTEP_NOISE.sprint;
  if (c.gait === 'walk') return FOOTSTEP_NOISE.walk;
  return FOOTSTEP_NOISE.run;
}

export function emitFootsteps(c: Character, speed: number, dt: number): void {
  if (speed < 0.3) {
    // Settle the stride so the next step starts after half a stride.
    c.footstepDist = Math.min(c.footstepDist, stepLengthFor(c) * 0.5);
    return;
  }
  c.footstepDist += speed * dt;
  const len = stepLengthFor(c);
  if (c.footstepDist < len) return;
  c.footstepDist -= len;
  c.footstepIndex++;
  const pos = c.position.clone();
  if (c.mode === 'swim') {
    ctx.events.emit('character:swim', { character: c, position: pos });
  } else {
    ctx.events.emit('character:footstep', { character: c, surface: c.groundSurface, speed, position: pos });
  }
  ctx.events.emit('noise', { kind: 'footstep', position: pos, radius: noiseRadiusFor(c), sourceId: c.id, teamId: c.teamId });
}
