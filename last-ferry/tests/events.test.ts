// The event bus (handler isolation) and event payloads the presentation relies on.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EventBus } from '../src/core/events';
import { aimLane, arm, hold, quiet, record, run, shoot, until } from './helpers';

afterEach(() => vi.restoreAllMocks());

describe('EventBus', () => {
  it('a throwing subscriber is isolated: the others still run, the error is counted and logged once', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const bus = new EventBus();
    const seen: string[] = [];
    bus.on('horn', () => seen.push('a'));
    bus.on('horn', () => {
      throw new Error('view bug');
    });
    bus.on('horn', () => seen.push('c'));
    expect(() => bus.emit('horn', {})).not.toThrow();
    bus.emit('horn', {});
    expect(seen).toEqual(['a', 'c', 'a', 'c']);
    expect(bus.errors.horn).toBe(2);
    expect(err).toHaveBeenCalledTimes(1);
  });

  it('unsubscribing (or subscribing) during an emit neither skips nor adds a handler for that emit', () => {
    const bus = new EventBus();
    const seen: string[] = [];
    const offA = bus.on('horn', () => {
      seen.push('a');
      offA();
      bus.on('horn', () => seen.push('late'));
    });
    bus.on('horn', () => seen.push('b'));
    bus.emit('horn', {});
    expect(seen).toEqual(['a', 'b']);
    bus.emit('horn', {});
    expect(seen).toEqual(['a', 'b', 'b', 'late']);
    // Unsubscribing twice is harmless.
    offA();
    bus.emit('horn', {});
    expect(seen).toEqual(['a', 'b', 'b', 'late', 'b', 'late']);
  });

  it('a presentation bug in a zombieDeath subscriber cannot corrupt the logic: the zombie is removed and the bounty paid', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const w = quiet();
    w.events.on('zombieDeath', () => {
      throw new Error('a rig bone is missing');
    });
    aimLane(w, 0, 14);
    const z = hold(w.spawn('shambler', 2, 0));
    z.life = 1;
    const money0 = w.player.money;
    const deaths = record(w, 'zombieDeath');
    expect(shoot(w)).toBe(true);
    run(w, 0.2);
    expect(deaths).toHaveLength(1);
    expect(z.removed).toBe(true);
    expect(w.zombies.includes(z)).toBe(false);
    expect(w.player.money).toBeGreaterThan(money0);
    expect(w.player.stats.kills).toBe(1);
    expect(w.events.errors.zombieDeath).toBe(1);
  });
});

describe('projectileEnd', () => {
  it('says what ended and on what: a flare on a zombie, a flare on the deck, a deck-gun shell', () => {
    const w = quiet();
    arm(w, 'flare');
    aimLane(w, 0, 14);
    hold(w.spawn('riot', 2, 0));
    const end = record(w, 'projectileEnd');
    w.player.input.fire = true;
    w.step();
    w.player.input.fire = false;
    expect(until(w, () => end.length > 0, 2)).toBe(true);
    expect(end[0]).toMatchObject({ kind: 'flare', reason: 'target' });

    const w2 = quiet();
    arm(w2, 'flare');
    aimLane(w2, 0, 20);
    const end2 = record(w2, 'projectileEnd');
    w2.player.input.fire = true;
    w2.step();
    w2.player.input.fire = false;
    expect(until(w2, () => end2.length > 0, 3)).toBe(true);
    expect(end2[0]).toMatchObject({ kind: 'flare', reason: 'deck' });

    const w3 = quiet();
    const end3 = record(w3, 'projectileEnd');
    w3.combat.launchShell(w3.player, { x: -6, y: 0, z: 0 }, []);
    expect(until(w3, () => end3.length > 0, 5)).toBe(true);
    expect(end3[0]).toMatchObject({ kind: 'shell', reason: 'deck' });
  });
});
