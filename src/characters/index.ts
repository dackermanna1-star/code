// STUB — replaced by the Characters agent.
import type { GameContext } from '../core/GameContext';
import type { ICharacter, ICharacters } from '../core/contracts';

export async function installCharacters(ctx: GameContext): Promise<void> {
  const list: ICharacter[] = [];
  const chars: ICharacters = {
    spawn: () => { throw new Error('characters stub'); },
    remove: (c) => { const i = list.indexOf(c); if (i >= 0) list.splice(i, 1); },
    all: () => list,
    byId: (id) => list.find((c) => c.id === id),
    queryRadius: (p, r, out = []) => { out.length = 0; for (const c of list) if (c.position.distanceTo(p) <= r) out.push(c); return out; },
  };
  ctx.characters = chars;
}
