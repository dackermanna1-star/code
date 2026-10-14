// Breakable lines (special 903, tools/ct/SPEC.md section 5): two-sided lines
// flagged ML_BLOCKING with a masked middle texture (a chained gate, boards
// over a doorway, a shop window). Hitscan shots and melee that hit the
// texture (map.js lineAttack) and explosions nearby (radiusAttack) wear
// down their hit points; at zero the line stops blocking, its texture turns
// into the broken variant (or nothing), debris flies and the map script is
// told. Hit points and material come from the map script's table, keyed by
// the line's tag; per-line damage is kept in CtLevel state (saved).

import { ML } from '../mapdata.js';
import { lineOpening, opening } from '../maputl.js';

export const BREAKABLE = 903;

// Broken look of each intact texture; anything else just disappears.
const BROKEN_TEXTURE = { CTGATE1: 'CTGATE2', CTGLAS1: 'CTGLAS2', CTBORD1: 'CTBORD3', CTBORD2: 'CTBORD3' };
const BREAK_SOUND = { glass: 'glasbk', wood: 'woodbk', metal: 'chainb' };
// A breakable the script has no entry for.
const DEFAULT_INFO = { hp: 30, material: 'wood' };

function guessMaterial(name) {
  if (/^CTGLAS/.test(name)) return 'glass';
  if (/^CT(GATE|FENC|METL|SCAF)/.test(name)) return 'metal';
  return 'wood';
}

function midSide(line) {
  if (line.front && line.front.midtexture) return line.front;
  if (line.back && line.back.midtexture) return line.back;
  return line.front;
}

export class Breakables {
  constructor(ct) {
    this.ct = ct;
    this.w = ct.w;
    this.lines = this.w.level.lines.filter((l) => l.special === BREAKABLE);
  }

  // { hp, material } for a line: the script's table entry, else a default
  // with the material guessed from the texture.
  info(line) {
    const script = this.ct.script;
    const entry = script && script.breakable ? script.breakable(line.tag) : null;
    const side = midSide(line);
    const tex = side && this.w.res.textures[side.midtexture];
    const material = (entry && entry.material) || (tex ? guessMaterial(tex.name) : DEFAULT_INFO.material);
    return { hp: entry ? entry.hp : DEFAULT_INFO.hp, material };
  }

  hp(line) {
    const v = this.ct.s.lineHp[line.index];
    return v === undefined ? this.info(line).hp : v;
  }

  intact(line) {
    return line.special === BREAKABLE && this.hp(line) > 0;
  }

  // Height range covered by the middle texture (drawn once, not tiled, at
  // the top of the opening, or at its bottom when lower-unpegged), clipped
  // to the opening.
  span(line) {
    lineOpening(line);
    const bottom = opening.bottom, top = opening.top;
    const side = midSide(line);
    const tex = side && this.w.res.textures[side.midtexture];
    if (!tex || !side.midtexture) return [bottom, top];
    let t = (line.flags & ML.DONTPEGBOTTOM) ? bottom + tex.height : top;
    t += side.rowoffset;
    return [Math.max(bottom, t - tex.height), Math.min(top, t)];
  }

  blocksShot(line, z) {
    if (!this.intact(line)) return false;
    const [b, t] = this.span(line);
    return z >= b - 1 && z <= t + 1;
  }

  damage(line, amount, source, at = null) {
    if (!this.intact(line) || !(amount > 0)) return;
    const hp = this.hp(line) - amount;
    this.ct.s.lineHp[line.index] = Math.max(0, hp);
    if (hp <= 0) this.break(line, source, at);
  }

  // Explosion at `spot` (a thing): every intact breakable within reach takes
  // damage falling off with distance, like things in radiusAttack.
  radius(spot, source, damage) {
    for (const line of this.lines) {
      if (!this.intact(line)) continue;
      const len = line.length || 1;
      let t = ((spot.x - line.v1.x) * line.dx + (spot.y - line.v1.y) * line.dy) / (len * len);
      t = Math.max(0, Math.min(1, t));
      const px = line.v1.x + line.dx * t, py = line.v1.y + line.dy * t;
      const d = Math.floor(Math.hypot(spot.x - px, spot.y - py));
      if (d >= damage) continue;
      const [b, top] = this.span(line);
      if (spot.z + (spot.height || 0) < b - damage || spot.z > top + damage) continue;
      this.damage(line, damage - d, source, { x: px, y: py, z: Math.max(b, Math.min(top, spot.z)) });
    }
  }

  break(line, source, at) {
    const w = this.w;
    const { material } = this.info(line);
    const [b, t] = this.span(line);
    line.flags &= ~(ML.BLOCKING | ML.BLOCKMONSTERS);
    for (const side of [line.front, line.back]) {
      if (!side || !side.midtexture) continue;
      const name = w.res.textures[side.midtexture] ? w.res.textures[side.midtexture].name : '';
      side.midtexture = BROKEN_TEXTURE[name] ? w.res.textureNum(BROKEN_TEXTURE[name]) : 0;
      w.sideChanged(side);
    }
    const mid = { x: (line.v1.x + line.v2.x) / 2, y: (line.v1.y + line.v2.y) / 2, z: (b + t) / 2 };
    w.sound(at || mid, BREAK_SOUND[material] || 'woodbk');
    if (w.fx && w.fx.breakLine) w.fx.breakLine(line, material, b, t);
    if (this.ct.script && this.ct.script.broken) this.ct.script.broken(line, source);
  }
}
