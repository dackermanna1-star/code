// Uncommon common infected (L4D2-style): CEDA hazmat workers (sealed suits,
// immune to fire) and riot police (armoured front: bullets from the front
// spark off the vest and helmet; kill them from behind, with melee or blasts).
// Plugs two outfit archetypes into the crowd renderer and wraps the common
// infected's ignite / takeHit / onShoved; the Director mixes them into
// wanderer and horde spawns (see Director cfg.uncommon).
import { Common } from './infected.js';
import { OUTFIT_SETS, CROWD_ARCH, CROWD_TOP, CROWD_BOT, CROWD_OUT, CROWD_SHOE } from './crowd.js';
import { ACC } from './partgeo.js';
import * as THREE from 'three';

const L = (hex) => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };
const _v = new THREE.Vector3();

CROWD_ARCH.ceda = (o, r) => {
  const suit = r() < 0.7 ? L(0xc8b830) : L(0x9aa84a); // yellow / olive hazmat
  o.top = CROWD_TOP.UNIFORM; o.topC = suit; o.pat = 0; o.pat2 = [suit[0] * 0.7, suit[1] * 0.7, suit[2] * 0.7]; o.sleeve = 1.95;
  o.bot = CROWD_BOT.WORK; o.botC = suit; o.pants = 2;
  o.out = CROWD_OUT.PARKA; o.outC = suit; o.bulk = 0.018; o.acc |= 1 << ACC.HOOD; o.acc &= ~(1 << ACC.LONGHAIR);
  o.mask = 2; o.glove = L(0x1a1a1c); o.gloveKind = 2; o.shoe = CROWD_SHOE.BOOT; o.shoeC = L(0x1a1a1a);
  o.badge = 1; o.workStripe = 0; o.hair = 6; o.hairC = suit;
};
CROWD_ARCH.riot = (o, r) => {
  const navy = r() < 0.5 ? L(0x14182a) : L(0x1c1e24);
  o.top = CROWD_TOP.UNIFORM; o.topC = navy; o.pat2 = L(0x0c0c10); o.badge = 1; o.sleeve = 1.95;
  o.bot = CROWD_BOT.WORK; o.botC = L(0x121418); o.pants = 2;
  o.out = CROWD_OUT.TACTICAL; o.outC = L(0x0e0f12); o.bulk = 0.02;
  o.acc |= 1 << ACC.HARDHAT; o.hatC = L(0x101114); o.acc &= ~(1 << ACC.LONGHAIR);
  o.glove = L(0x0c0c0e); o.gloveKind = 1; o.shoe = CROWD_SHOE.BOOT; o.shoeC = L(0x0c0c0c); o.female = false;
};
OUTFIT_SETS.ceda = [['ceda', 1]];
OUTFIT_SETS.riot = [['riot', 1]];

const P = Common.prototype;
const ignite0 = P.ignite, takeHit0 = P.takeHit, onShoved0 = P.onShoved;
P.ignite = function (owner) {
  if (this.outfit === 'ceda' && !this.dead) { // sealed suit: walks straight through fire
    if (owner && owner.pos && this.alert) this.alert(0, owner);
    return;
  }
  return ignite0.call(this, owner);
};
// Riot armour: a bullet travelling against the way the cop faces hits the vest/helmet.
function armoured(c, h) {
  if (c.outfit !== 'riot' || c.dead || h.kind !== 'bullet' || !h.dir) return false;
  const fx = -Math.sin(c.yaw), fz = -Math.cos(c.yaw);
  return h.dir.x * fx + h.dir.z * fz < -0.25;
}
P.takeHit = function (h) {
  if (armoured(this, h)) {
    const g = this.game;
    g.fx.sparks(h.x, h.y, h.z, -h.dir.x, -h.dir.y, -h.dir.z, 5, [1, 0.8, 0.5], 4);
    g.audio.play('impactMetal', { pos: _v.set(h.x, h.y, h.z), vol: 0.7 });
    this.pushReaction(h.dir.x, h.dir.z, 0.6);
    if (this.state === 0 || this.state === 1) return takeHit0.call(this, Object.assign({}, h, { damage: 0 })); // still wakes up
    return;
  }
  return takeHit0.call(this, h);
};
P.onShoved = function (s, fx, fz) {
  // a shove spins a riot cop half round, exposing the back
  if (this.outfit === 'riot' && !this.dead) this.yaw += Math.PI * 0.6 * (Math.random() < 0.5 ? 1 : -1);
  return onShoved0.call(this, s, fx, fz);
};

export const UNCOMMON = ['ceda', 'riot'];
