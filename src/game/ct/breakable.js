// Breakable lines (special 903, tools/ct/SPEC.md section 5): two-sided lines
// flagged ML_BLOCKING with a masked middle texture (a chained gate, boards
// over a doorway, a shop window). Hitscan shots and melee that hit the
// texture (map.js lineAttack) and explosions nearby (radiusAttack) wear
// down their hit points; at zero the line stops blocking, its texture turns
// into the broken variant (or nothing), debris flies and the map script is
// told. Hit points and material come from the map script's table, keyed by
// the line's tag. A map draws one opening (a gate, a boarded doorway, a
// window) as several segments: lines of one tag in a straight run, end to
// end or across a post (a gap of at most POST_GAP), are one breakable, with
// one pool of hit points (kept in CtLevel state under the run's first line,
// saved) that breaks as a whole.

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

const POST_GAP = 16;

// Distance of point p from the infinite line through `l`.
function offLine(l, p) {
  const len = l.length || Math.hypot(l.dx, l.dy) || 1;
  return Math.abs((p.x - l.v1.x) * l.dy - (p.y - l.v1.y) * l.dx) / len;
}

// Runs of one opening: 903 lines with the same tag along one straight line,
// touching or a post's width apart. Two windows with one tag, a wall apart,
// stay two.
function groupLines(lines) {
  const parent = new Map(lines.map((l) => [l, l]));
  const find = (l) => {
    while (parent.get(l) !== l) l = parent.get(l);
    return l;
  };
  const dir = (l) => {
    const len = l.length || Math.hypot(l.dx, l.dy) || 1;
    return [l.dx / len, l.dy / len];
  };
  for (let i = 0; i < lines.length; i++) {
    for (let j = i + 1; j < lines.length; j++) {
      const a = lines[i], b = lines[j];
      if (a.tag !== b.tag) continue;
      const [ax, ay] = dir(a), [bx, by] = dir(b);
      if (Math.abs(ax * by - ay * bx) > 0.02 || offLine(a, b.v1) > 0.5 || offLine(a, b.v2) > 0.5) continue;
      const gap = Math.min(...[[a.v1, b.v1], [a.v1, b.v2], [a.v2, b.v1], [a.v2, b.v2]].map(([p, q]) => Math.hypot(p.x - q.x, p.y - q.y)));
      if (gap > POST_GAP) continue;
      const ra = find(a), rb = find(b);
      // The run's first line (lowest index) holds its hit points.
      if (ra !== rb) {
        if (ra.index < rb.index) parent.set(rb, ra);
        else parent.set(ra, rb);
      }
    }
  }
  const leader = new Map();
  const members = new Map();
  for (const l of lines) {
    const r = find(l);
    leader.set(l, r);
    if (!members.has(r)) members.set(r, []);
    members.get(r).push(l);
  }
  return { leader, members };
}

export class Breakables {
  constructor(ct) {
    this.ct = ct;
    this.w = ct.w;
    this.lines = this.w.level.lines.filter((l) => l.special === BREAKABLE);
    // Static map data, rebuilt on load like the portal pairs.
    const { leader, members } = groupLines(this.lines);
    this.leader = leader;
    this.members = members;
  }

  // The line holding the hit points of `line`'s opening.
  head(line) { return this.leader.get(line) || line; }

  // Every segment of `line`'s opening.
  group(line) { return this.members.get(this.head(line)) || [line]; }

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
    const head = this.head(line);
    const v = this.ct.s.lineHp[head.index];
    return v === undefined ? this.info(head).hp : v;
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
    this.ct.s.lineHp[this.head(line).index] = Math.max(0, hp);
    if (hp <= 0) this.break(line, source, at);
  }

  // Explosion at `spot` (a thing): every intact breakable within reach takes
  // damage falling off with distance, like things in radiusAttack; an
  // opening drawn in segments is hit once, at its nearest one.
  radius(spot, source, damage) {
    for (const [head, group] of this.members) {
      if (!this.intact(head)) continue;
      let best = null;
      for (const line of group) {
        const len = line.length || 1;
        let t = ((spot.x - line.v1.x) * line.dx + (spot.y - line.v1.y) * line.dy) / (len * len);
        t = Math.max(0, Math.min(1, t));
        const px = line.v1.x + line.dx * t, py = line.v1.y + line.dy * t;
        const d = Math.floor(Math.hypot(spot.x - px, spot.y - py));
        if (d >= damage) continue;
        const [b, top] = this.span(line);
        if (spot.z + (spot.height || 0) < b - damage || spot.z > top + damage) continue;
        if (!best || d < best.d) best = { line, d, at: { x: px, y: py, z: Math.max(b, Math.min(top, spot.z)) } };
      }
      if (best) this.damage(best.line, damage - best.d, source, best.at);
    }
  }

  // Breaks `line`'s whole opening: every segment stops blocking and turns
  // to its broken look; one sound, debris along each segment.
  break(line, source, at) {
    const w = this.w;
    const head = this.head(line);
    const group = this.group(line);
    const { material } = this.info(head);
    const [lb, lt] = this.span(line);
    this.ct.s.lineHp[head.index] = 0;
    for (const seg of group) {
      const [b, t] = this.span(seg);
      seg.flags &= ~(ML.BLOCKING | ML.BLOCKMONSTERS);
      for (const side of [seg.front, seg.back]) {
        if (!side || !side.midtexture) continue;
        const name = w.res.textures[side.midtexture] ? w.res.textures[side.midtexture].name : '';
        side.midtexture = BROKEN_TEXTURE[name] ? w.res.textureNum(BROKEN_TEXTURE[name]) : 0;
        w.sideChanged(side);
      }
      if (w.fx && w.fx.breakLine) w.fx.breakLine(seg, material, b, t);
    }
    const mid = { x: (line.v1.x + line.v2.x) / 2, y: (line.v1.y + line.v2.y) / 2, z: (lb + lt) / 2 };
    w.sound(at || mid, BREAK_SOUND[material] || 'woodbk');
    if (this.ct.script && this.ct.script.broken) this.ct.script.broken(head, source);
  }
}
