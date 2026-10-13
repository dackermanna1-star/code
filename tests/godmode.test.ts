import { describe, expect, it } from 'vitest';
import { MAX_CALORIES, MAX_HEALTH, MAX_HYDRATION } from '../src/shared/sim/vitals';
import { errors, flatStorage, makeGame, seconds, spawnPlayer } from './helpers';

describe('god mode', () => {
  it('is refused while the world does not allow cheats', () => {
    const game = makeGame();
    const { p, link } = spawnPlayer(game, 'mortal', 0.5, 0.5);
    game.handle(p, { t: 'god' });
    expect(p.god).toBe(false);
    expect(errors(link).some((m) => /needs cheats/.test(m))).toBe(true);
  });

  it('toggles with the god request and blocks all damage', () => {
    const game = makeGame({ cheats: true });
    const { p } = spawnPlayer(game, 'immortal', 0.5, 0.5);
    game.handle(p, { t: 'god' });
    expect(p.god).toBe(true);
    game.combat.damagePlayer(p, 1000, 'bullet', null);
    game.combat.damagePlayer(p, 1000, 'fall', null);
    expect(p.alive).toBe(true);
    expect(p.vitals.hp).toBe(MAX_HEALTH);
    game.handle(p, { t: 'god' });
    expect(p.god).toBe(false);
    game.combat.damagePlayer(p, 1000, 'bullet', null);
    expect(p.alive).toBe(false);
  });

  it('keeps health, food and water full and clears bleeding and radiation', () => {
    const game = makeGame({ cheats: true });
    const { p } = spawnPlayer(game, 'immortal', 0.5, 0.5);
    game.handle(p, { t: 'god', on: true });
    Object.assign(p.vitals, { cal: 0, hyd: 0, bleed: 50, rad: 300 });
    seconds(game, 3);
    expect(p.vitals).toMatchObject({ hp: MAX_HEALTH, cal: MAX_CALORIES, hyd: MAX_HYDRATION, bleed: 0, rad: 0 });
    expect(p.flags).toContain('god');
  });

  it('cheats can be allowed in an existing world; turning them off ends god mode', () => {
    const game = makeGame();
    const { p, link } = spawnPlayer(game, 'owner', 0.5, 0.5);
    game.handle(p, { t: 'cheats', on: true });
    expect(game.config.cheats).toBe(true);
    expect(link.of('rules').at(-1)?.rules.cheats).toBe(true);
    game.handle(p, { t: 'god' });
    expect(p.god).toBe(true);
    game.handle(p, { t: 'cheats', on: false });
    expect(p.god).toBe(false);
    expect(link.of('rules').at(-1)?.rules.cheats).toBe(false);
  });

  it('/god and the allowed-cheats flag survive save and reload', async () => {
    const st = flatStorage();
    const game = makeGame({}, st);
    const { p } = spawnPlayer(game, 'owner', 0.5, 0.5);
    game.handle(p, { t: 'cheats', on: true });
    game.commands.chat(p, '/god');
    expect(p.god).toBe(true);
    await game.save();
    const g2 = makeGame({}, st);
    // makeGame passes the test config, so check the saved flag the worker would merge
    expect(JSON.parse(st.getMeta('config')!).cheats).toBe(true);
    const { p: p2 } = spawnPlayer(makeGame({ cheats: true }, st), 'owner', 0.5, 0.5);
    expect(p2.god).toBe(true);
    // a world whose cheats are off never restores god mode
    const { p: p3 } = spawnPlayer(g2, 'owner', 0.5, 0.5);
    expect(p3.god).toBe(false);
  });
});
