// The other passengers: people who get on at one floor and off at another,
// stand facing the doors and never react to anything. A businessman who's
// late, a skeleton, a man who is on fire (it's fine), a grandmother, the
// pizza guy, a noob, a tourist, a robot, the janitor.
import * as THREE from 'three';
import { Character } from '../../engine/Character.js';
import { FACES, blocks, pick, rnd, V } from './kit.js';

const look = (head, torso, arms, legs, o = {}) => ({ colors: { head, torso, leftArm: arms, rightArm: arms, leftLeg: legs, rightLeg: legs, ...(o.colors || {}) }, face: 'Smile', hats: o.hats || [], shirt: null, pants: null, tshirt: null });

export const PASSENGERS = [
  { id: 'business', name: 'Businessman', app: look(24, 26, 26, 26), lines: ["I'm going to be late.", 'Is this thing even moving?', 'Could we speed this up?', "I've got a call on forty.", '*checks watch*', 'Busy day.'], prop: 'briefcase', watch: true },
  { id: 'skeleton', name: 'Skeleton', app: look(1, 1, 1, 1), face: 'skull', lines: ['...', '*rattle*', "I've been waiting a long time for this elevator.", "Don't mind me.", 'Nice day for it.'] },
  { id: 'fire', name: 'Man on Fire', app: look(24, 21, 24, 26), lines: ["It's fine.", "Don't worry about it.", 'Is it warm in here or is it me?', "No, no, I'm used to it.", 'Could somebody press 3? Thanks.'], fire: true },
  { id: 'granny', name: 'Grandma', app: look(24, 22, 24, 22), face: 'glasses', lines: ['In my day we took the stairs.', 'Lovely music, isn\'t it?', 'Has anyone seen my cat?', 'Young people today...', 'Is this the floor with the bingo?'], hair: 'bun' },
  { id: 'pizza', name: 'Pizza Guy', app: look(24, 21, 24, 26, { hats: ['RedBaseballCap'] }), lines: ['Pizza for... floor twelve?', 'Anybody order a large pepperoni?', "It's getting cold...", 'Thirty minutes or it\'s free. It has been forty.'], prop: 'pizza' },
  { id: 'noob', name: 'Noob', app: look(24, 23, 24, 37), lines: ['hi', 'how do i jump', 'where am i', 'lol', 'can someone give me tix', 'how do u get out'] },
  { id: 'tourist', name: 'Tourist', app: look(24, 106, 24, 102), lines: ['Is this the beach floor?', '*click* Smile!', 'What a lovely hotel!', 'Excuse me, where is the gift shop?'], prop: 'camera' },
  { id: 'robot', name: 'Robot', app: look(199, 131, 199, 199), face: 'robot', lines: ['BEEP.', 'FLOOR. DETECTED.', 'I AM ALSO A PASSENGER.', 'DESTINATION: UNKNOWN.', 'ELEVATOR MUSIC: ACCEPTABLE.'] },
  { id: 'janitor', name: 'Janitor', app: look(24, 102, 24, 199, { hats: ['BlueBaseballCap'] }), face: 'sleepy', lines: ["Don't step on the wet floor.", 'Somebody spilled lava on thirty-three again.', 'I just mopped in here.', 'Long shift.'], prop: 'mop' },
];

/** A passenger: a real (physics) character steered round the car. */
export class Passenger {
  constructor(E, def, at) {
    this.E = E; this.def = def; this.name = def.name;
    const ch = new Character(E.world, { name: def.name, appearance: def.app });
    this.ch = ch; ch.npc = this;
    const m = ch.model;
    if (def.face) m.head.children[0].material = new THREE.MeshPhongMaterial({ map: FACES[def.face](), transparent: true, depthWrite: false, shininess: 10 });
    if (def.hair === 'bun') { const g = blocks([[1.3, 0.5, 1.3, 0, 0.62, 0.05, 2, { shape: 'ball' }], [0.7, 0.7, 0.7, 0, 0.95, 0.35, 2, { shape: 'ball' }]]); m.head.add(g); }
    if (def.prop === 'briefcase') m.rightGrip.add(blocks([[0.3, 1.1, 1.4, 0, -0.45, 0, 26], [0.1, 0.25, 0.5, 0, 0.18, 0, 199]]));
    if (def.prop === 'pizza') { const p = blocks([[2.2, 0.35, 2.2, 0, 0, 0, 1], [1.4, 0.36, 0.5, 0, 0.01, 0, 21]]); p.position.set(0, 0.9, -1.1); m.root.add(p); }
    if (def.prop === 'camera') { const c = blocks([[0.9, 0.6, 0.4, 0, 0, 0, 26], [0.35, 0.35, 0.3, 0, 0, -0.3, 199, { shape: 'cyl', rx: 90 }]]); c.position.set(0, 0.2, -0.65); m.root.add(c); }
    if (def.prop === 'mop') m.rightGrip.add(blocks([[0.15, 5, 0.15, 0, 0.6, 0, 192], [1.2, 0.3, 0.6, 0, -1.95, 0, 1]]));
    if (E.world.shadows) m.root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    ch.spawn(at, 0);
    ch.walkSpeed = def.id === 'granny' ? 9 : 13;
    if (def.fire) this.flame = E.flames.add(() => (ch.alive ? ch.rootPosition.clone().add(V(0, -0.5, 0)) : null), 3.2);
    this.target = null; this.mode = 'board'; this.ridesLeft = 2 + Math.floor(Math.random() * 4);
    this.chatT = rnd(6, 16); this.watchT = rnd(4, 12);
    ch.on('died', () => this.died());
    ch.pose = (c, des, M, pose) => {
      if (def.watch && this.watchT < 1.2 && pose === 'Standing') { des.ls = 1.6; M.ls = 0.25; }
      if (def.prop === 'pizza' && pose !== 'Seated') { des.rs = 1.5; des.ls = 1.5; M.rs = M.ls = 0.3; }
      if (def.prop === 'camera' && pose !== 'Seated') { des.rs = 1.3; des.ls = 1.3; }
    };
  }
  get alive() { return this.ch.alive; }
  head() { return this.ch.alive ? this.ch.headPosition : null; }
  say(text) { this.E.say(this.name, text, () => this.head()); }
  died() {
    const msg = this.ch.lastCause || 'had a bad day';
    this.E.game.systemChat(`The ${this.name} ${msg}.`);
    this.flame?.stop();
    this.gone = true;
    this.E.world.delay(4, () => this.ch.destroy());
  }
  /** Leave at this floor: walk out and away. */
  leave(F) {
    this.mode = 'leave';
    const out = F.def.bots?.spots;
    const s = out?.length ? pick(out) : [rnd(-12, 12), -26];
    this.target = V(s[0], 0, s[1]);
    this.say(pick(['This is my floor.', 'Excuse me.', 'My stop.', 'Bye now.', ...(this.def.id === 'robot' ? ['EXITING.'] : [])]));
  }
  update(dt) {
    const ch = this.ch;
    if (!ch.alive) return;
    const E = this.E;
    if (this.mode === 'board' || this.mode === 'ride') {
      if (!this.home || Math.random() < 0.002) this.home = E.car.spot();
      this.target = this.home;
      if (this.mode === 'board' && E.car.inside(ch.rootPosition)) this.mode = 'ride';
    }
    const p = ch.rootPosition;
    if (this.target) {
      const d = V(this.target.x - p.x, 0, this.target.z - p.z), L = d.length();
      if (L > 0.8) ch.input.move.copy(d.normalize()); else { ch.input.move.set(0, 0, 0); if (this.mode === 'leave') this.target = null; }
    } else ch.input.move.set(0, 0, 0);
    // standing in the car: face the doors
    if (this.mode === 'ride' && ch.input.move.lengthSq() < 0.01) { let d = 0 - ch.facing; d = Math.atan2(Math.sin(d), Math.cos(d)); ch.facing += d * Math.min(1, dt * 3); }
    this.watchT -= dt; if (this.watchT < 0) this.watchT = rnd(6, 14);
    this.chatT -= dt;
    if (this.chatT <= 0) { this.chatT = rnd(10, 25); if (this.mode === 'ride' && Math.random() < 0.6) this.say(pick(this.def.lines)); }
  }
  destroy() { this.flame?.stop(); this.gone = true; if (this.ch.alive) this.ch.destroy(); }
}
