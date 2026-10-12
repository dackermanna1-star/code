// Every sound the audio system can play must exist in public/audio, and the
// manifest must match the folder exactly. Pure Node fs (no Web Audio).
import { beforeAll, describe, expect, it } from 'vitest';
import { SOUND_FILES } from '../../src/audio/manifest';
import {
  ENEMY_SOUNDS,
  EVENT_SOUNDS,
  SILENT_EVENTS,
  WEAPON_SOUNDS,
  allSoundRefs,
  groupMembers,
  groupPrefix,
  isGroup,
  reloadSchedule,
  weaponDir,
} from '../../src/audio/soundMap';
import { WEAPONS, WEAPON_ORDER } from '../../src/config/weapons';

interface FsLike {
  readdirSync(path: URL, opts: { recursive: true }): string[];
  existsSync(path: URL): boolean;
}

const AUDIO_DIR = new URL('../../public/audio/', import.meta.url);
let onDisk: string[] = [];

beforeAll(async () => {
  // Variable specifier: the project has no @types/node, and vitest runs in Node.
  const spec = 'node:fs';
  const fs = (await import(/* @vite-ignore */ spec)) as FsLike;
  onDisk = fs
    .readdirSync(AUDIO_DIR, { recursive: true })
    .map((p) => p.replace(/\\/g, '/'))
    .filter((p) => p.endsWith('.wav'))
    .map((p) => p.slice(0, -4))
    .sort();
});

const resolves = (ref: string) => (isGroup(ref) ? groupMembers(groupPrefix(ref), onDisk).length > 0 : onDisk.includes(ref));

describe('audio mapping', () => {
  it('manifest lists exactly the files in public/audio', () => {
    expect(onDisk.length).toBeGreaterThan(150);
    expect([...SOUND_FILES].sort()).toEqual(onDisk);
  });

  it('every referenced sound exists', () => {
    const refs = allSoundRefs();
    expect(refs.length).toBeGreaterThan(40);
    const missing = refs.filter((r) => !resolves(r));
    expect(missing).toEqual([]);
  });

  it('random groups expand to the numbered files only', () => {
    expect(groupMembers('misc/gib', onDisk)).toEqual(['misc/gib1', 'misc/gib2', 'misc/gib3', 'misc/gib4', 'misc/gib5', 'misc/gib6', 'misc/gib7']);
    expect(groupMembers('weapons/1/fire', onDisk)).toEqual(['weapons/1/fire1', 'weapons/1/fire2']);
    // 'weapons/shell' must not swallow sshell/shshell, and pingvin/quack10 sorts last.
    expect(groupMembers('weapons/shell', onDisk)).toHaveLength(6);
    expect(groupMembers('pingvin/quack', onDisk).at(-1)).toBe('pingvin/quack10');
  });

  it('weapon sounds come from weapons/<WEAPON_NAMES index>', () => {
    WEAPON_ORDER.forEach((id, i) => {
      expect(weaponDir(id)).toBe(`weapons/${i}`);
      const d = WEAPON_SOUNDS[id];
      expect(groupPrefix(d.fire).startsWith(`weapons/${i}/fire`)).toBe(true);
      // Reload list = sorted reload*.wav (+ AWP boltpull first); Flunk pulls its insert sound out.
      const globbed = onDisk.filter((n) => n.startsWith(`weapons/${i}/reload`)).sort();
      const expected = [...(id === 'awp' ? ['weapons/8/boltpull'] : []), ...globbed.filter((n) => id !== 'flunk' || n !== d.insert?.name)];
      expect(d.reload).toEqual(expected);
    });
  });

  it('reload sounds are spread like weapons.py', () => {
    const at = (id: keyof typeof WEAPONS) => reloadSchedule(id, WEAPONS[id].reloadTicks).map((s) => `${s.tick}:${s.name.split('/').pop()}`);
    expect(at('pistol')).toEqual(['0:reload1', '50:reload2', '100:reloadfinished']);
    expect(at('awp')).toEqual(['0:boltpull', '36:reload1', '72:reload2', '108:reloadfinished']);
    expect(at('minigun')).toEqual(['0:reload1', '30:reload2', '60:reload3', '90:reload4', '120:reloadfinished']);
    expect(at('shotgun')).toEqual(['0:reload1', '20:reload1', '40:reload1', '60:reload1', '80:reload1', '100:reload1', '120:reload1', '125:reloadfinished']);
    expect(at('flunk')).toEqual(['0:reload1', '30:reload2', '60:reload2', '90:reload2', '120:reload2', '150:reloadfinished']);
    expect(at('grenades')).toEqual(['0:reloadfinished']);
  });

  it('per-enemy sounds point at the original directories', () => {
    expect(ENEMY_SOUNDS.seal.death).toBe('brunsal/death*');
    expect(ENEMY_SOUNDS.fatseal.death).toBe('vitsal/death*');
    expect(ENEMY_SOUNDS.bear.spawn).toBe('isbjorn/spawn*');
    expect(ENEMY_SOUNDS.walrus.death).toBe('valross/death1');
    for (const def of Object.values(ENEMY_SOUNDS)) {
      for (const ref of Object.values(def)) if (typeof ref === 'string') expect(resolves(ref), ref).toBe(true);
    }
  });

  it('no event is both mapped and declared silent', () => {
    const mapped = Object.keys(EVENT_SOUNDS);
    const silent = Object.keys(SILENT_EVENTS);
    expect(mapped.filter((e) => silent.includes(e))).toEqual([]);
    expect(mapped).toContain('shot');
    expect(mapped).toContain('enemyDeath');
  });
});
