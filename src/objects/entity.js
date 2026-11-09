// Base class for level objects (hazards, props, triggers). The entity instance is used as
// the planck body userData so it receives contact callbacks from Physics.

import { Vec2, Box, Circle, Polygon } from 'planck';
import { CAT, MASK } from '../config.js';

export function partFrom(fixture) {
  const u = fixture.getBody().getUserData();
  return u && u.kind === 'part' ? u : null;
}

export function characterFrom(fixture) {
  const u = fixture.getBody().getUserData();
  if (!u) return null;
  if (u.kind === 'part' || u.kind === 'vehicle') return u.character || null;
  return null;
}

export function filterFor(cat, group = 0) {
  const key = Object.keys(CAT).find((k) => CAT[k] === cat);
  return { filterCategoryBits: cat, filterMaskBits: MASK[key], filterGroupIndex: group };
}

export class Entity {
  constructor(game, def = {}) {
    this.game = game;
    this.phys = game.phys;
    this.def = def;
    this.kind = 'object';
    this.material = 'metal';
    this.dead = false;
    this.bodies = [];
    this.layer = 'mid'; // 'back' | 'mid' | 'front'
    this.x = def.x ?? 0;
    this.y = def.y ?? 0;
  }

  makeBody(def) {
    const b = this.phys.body(def, this);
    this.bodies.push(b);
    return b;
  }

  fixture(body, shape, opts = {}, cat = CAT.OBJECT) {
    const f = body.createFixture(shape, {
      density: opts.density ?? 1,
      friction: opts.friction ?? 0.6,
      restitution: opts.restitution ?? 0.1,
      isSensor: !!opts.sensor,
      ...filterFor(opts.sensor ? CAT.SENSOR : cat, opts.group ?? 0),
    });
    if (opts.tag) f.setUserData({ owner: this, tag: opts.tag, noBlood: !!opts.noBlood });
    else if (opts.noBlood) f.setUserData({ owner: this, noBlood: true });
    return f;
  }

  remove() {
    if (this.dead) return;
    this.dead = true;
    for (const b of this.bodies) this.phys.destroyBody(b);
    this.bodies.length = 0;
    this.onRemove();
  }

  onRemove() {}
  preStep(dt) {}
  postStep(dt) {}
  update(dt) {}
  draw(ctx, view) {}

  inView(view, x, y, m = 4) {
    return x > view.x0 - m && x < view.x1 + m && y > view.y0 - m && y < view.y1 + m;
  }

  withBody(ctx, body, fn) {
    const p = body.getPosition();
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(body.getAngle());
    fn();
    if (this.game.particles.bodyDecals.has(body)) this.game.particles.drawBodyDecals(ctx, body);
    ctx.restore();
  }

  get player() {
    return this.game.player;
  }

  /** Is this fixture part of the current player character? */
  isPlayer(fixture) {
    const c = characterFrom(fixture);
    return !!c && c === this.game.player;
  }

  playerFocus() {
    const p = this.game.player;
    return p ? p.focus() : null;
  }
}

export { Vec2, Box, Circle, Polygon, CAT, MASK };
