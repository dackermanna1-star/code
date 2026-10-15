// Six dummy bots driven by scripted intents (no AI): circles, crouch-walk, prone crawl, strafing aim,
// sprint laps and an idle leaner. They exercise the exact same Character pipeline as real bots.
import * as THREE from 'three';
import type { GameContext } from '../core/GameContext';
import { Priority } from '../core/Engine';
import { registerDebug } from '../core/Debug';
import type { Character } from '../characters/Character';

type Script = (c: Character, t: number) => void;

const circle = (cx: number, cz: number, r: number, speedRad: number, run: boolean, stance: 'stand' | 'crouch'): Script => (c, t) => {
  const i = c.intent;
  const a = t * speedRad;
  // Face the tangent of a circle and walk forward.
  const tx = Math.cos(a), tz = -Math.sin(a);
  i.yaw = Math.atan2(-tx, -tz);
  i.pitch = 0;
  i.moveX = 0;
  i.moveY = 1;
  i.walk = !run;
  i.sprint = false;
  i.stance = c.stance !== stance ? stance : null;
  void cx;
  void cz;
  void r;
};

export function installScriptedBots(ctx: GameContext, origin: THREE.Vector3): Character[] {
  const bots: { c: Character; script: Script }[] = [];
  const spawn = (dx: number, dz: number, yaw: number, variant: number, script: Script) => {
    const p = new THREE.Vector3(origin.x + dx, origin.y + 0.05, origin.z + dz);
    const c = ctx.characters.spawn({ name: `Dummy${bots.length + 1}`, teamId: 10 + bots.length, isPlayer: false, position: p, yaw, variant }) as Character;
    bots.push({ c, script });
    return c;
  };
  spawn(-6, 8, 0, 1, circle(0, 0, 4, 0.9, true, 'stand'));
  spawn(6, 8, 0, 2, circle(0, 0, 2, 0.6, false, 'crouch'));
  spawn(-3, 14, 0, 3, (c, t) => {
    const i = c.intent;
    i.stance = c.stance !== 'prone' ? 'prone' : null;
    const phase = Math.floor(t / 4) % 2;
    i.yaw = phase ? Math.PI : 0;
    i.moveY = c.stanceProgress >= 1 ? 1 : 0;
    i.moveX = 0;
  });
  spawn(3, 14, 0, 4, (c, t) => {
    const i = c.intent;
    i.yaw = Math.PI / 2;
    i.pitch = 0.05;
    i.moveY = 0;
    i.moveX = Math.sin(t * 0.8) > 0 ? 1 : -1;
    i.aim = true;
  });
  spawn(0, 22, 0, 5, (c, t) => {
    const i = c.intent;
    const a = t * 0.5;
    i.yaw = Math.atan2(-Math.cos(a), Math.sin(a));
    i.moveY = 1;
    i.sprint = true;
  });
  spawn(9, 3, Math.PI, 6, (c, t) => {
    const i = c.intent;
    i.moveX = i.moveY = 0;
    i.lean = Math.sin(t * 0.7) > 0.3 ? 1 : Math.sin(t * 0.7) < -0.3 ? -1 : 0;
    i.stance = Math.floor(t / 6) % 2 ? (c.stance !== 'crouch' ? 'crouch' : null) : c.stance !== 'stand' ? 'stand' : null;
  });

  let paused = false;
  ctx.engine.addSystem({
    name: 'scriptedBots',
    priority: Priority.AI,
    fixedUpdate: () => {
      if (paused) return;
      const t = ctx.engine.simTime;
      for (const b of bots) if (b.c.lifeState !== 'dead') b.script(b.c, t);
    },
  });
  registerDebug('pauseBots', (p = true) => (paused = p));
  registerDebug('bots', bots.map((b) => b.c));
  return bots.map((b) => b.c);
}
