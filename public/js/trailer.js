// The front page showcase. In 2008 this box held a Flash movie
// (PlayTrailer.swf, 400x326) whose contents were not archived, so this is a
// stand-in made with the game engine: three short shots captioned with the
// three points from the 2008 front page.
import * as THREE from 'three';
import { World } from './engine/World.js';
import { CharacterModel } from './engine/CharacterModel.js';
import { loadPlace } from './places/index.js';

const canvas = document.getElementById('TrailerCanvas');
const caption = document.querySelector('#Trailer .TrailerCaption');
if (canvas) start().catch((e) => console.warn('trailer:', e));

const LOOKS = [
  { colors: { head: 24, torso: 23, leftArm: 24, rightArm: 24, leftLeg: 119, rightLeg: 119 }, hats: ['RedBaseballCap'], shirt: null, pants: null, tshirt: { style: 'design', design: 'bloxxer' } },
  { colors: { head: 24, torso: 21, leftArm: 24, rightArm: 24, leftLeg: 26, rightLeg: 26 }, hats: ['TrafficCone'], shirt: null, pants: null, tshirt: null },
  { colors: { head: 24, torso: 194, leftArm: 24, rightArm: 24, leftLeg: 26, rightLeg: 26 }, hats: ['Fedora'], shirt: { style: 'suit', color: '#151515' }, pants: { style: 'plain', color: '#151515', shoes: '#000000' }, tshirt: null },
  { colors: { head: 24, torso: 37, leftArm: 24, rightArm: 24, leftLeg: 23, rightLeg: 23 }, hats: ['VikingHelm'], shirt: null, pants: null, tshirt: { style: 'design', design: 'viking' } },
  { colors: { head: 24, torso: 106, leftArm: 24, rightArm: 24, leftLeg: 102, rightLeg: 102 }, hats: ['TeapotHat'], shirt: null, pants: { style: 'jeans', shoes: '#2a2a2a' }, tshirt: null },
];

const SHOTS = [
  { text: 'Build your personal Place', cam: [10, 9, 86], look: [2, 2, 72] },
  { text: 'Meet new friends online', cam: [-14, 6, 26], look: [0, 2, 12] },
  { text: 'Battle in the Brick Arenas', cam: [56, 16, -26], look: [72, 3, -2] },
];
const SHOT_LEN = 6;

function person(world, look, x, z, yaw) {
  const m = new CharacterModel({ face: 'Smile', ...look });
  m.root.position.set(x, 3, z);
  m.root.rotation.y = yaw;
  world.scene.add(m.root);
  return { m, x, z, yaw, t: Math.random() * 10 };
}

async function start() {
  const world = new World(canvas);
  world.renderer.setPixelRatio(1);
  world.resize(canvas.width, canvas.height);
  const place = await loadPlace('crossroads');
  place.build(world, { thumbnail: true });

  // the builder on the playground, adding a brick every so often
  const builder = person(world, LOOKS[0], 0, 78, Math.PI * 0.85);
  const wall = { n: 0, timer: 0 };
  // friends hanging out on the bridge
  const friends = [person(world, LOOKS[1], -2, 12, Math.PI / 2), person(world, LOOKS[2], 2.5, 13, -Math.PI / 2), person(world, LOOKS[4], 0, 9, 0)];
  // a sword fight at Blackrock Castle
  const a = person(world, LOOKS[3], 70, -4, -Math.PI / 2), b = person(world, LOOKS[1], 66, -4, Math.PI / 2);
  for (const f of [a, b]) {
    const sword = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.12, 3.2), new THREE.MeshPhongMaterial({ color: 0xd8d8d8, shininess: 90 }));
    sword.position.z = -2;
    const holder = new THREE.Group(); holder.add(sword); holder.rotation.x = -Math.PI / 2;
    f.m.rightGrip.add(holder);
  }

  let shot = -1, clock = 0, last = performance.now(), visible = true;
  const setShot = (i) => {
    shot = i;
    const s = SHOTS[i];
    world.camera.position.set(...s.cam);
    world.camera.lookAt(new THREE.Vector3(...s.look));
    if (caption) caption.textContent = s.text;
  };
  setShot(0);
  new IntersectionObserver((e) => { visible = e[0].isIntersecting; }).observe(canvas);

  const frame = (now) => {
    requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - last) / 1000);
    if (dt < 1 / 31 || !visible || document.hidden) return; // the 2008 client ran at 30 FPS
    last = now;
    clock += dt;
    if (clock > SHOT_LEN) { clock = 0; setShot((shot + 1) % SHOTS.length); }
    const t = now / 1000;
    // a slow push-in on every shot
    const s = SHOTS[shot];
    const k = clock / SHOT_LEN;
    world.camera.position.set(s.cam[0] + (s.look[0] - s.cam[0]) * k * 0.15, s.cam[1] - k * 1.5, s.cam[2] + (s.look[2] - s.cam[2]) * k * 0.15);
    world.camera.lookAt(new THREE.Vector3(...s.look));

    // builder: arm up, a brick appears on the growing wall
    builder.m.setAngles(1.57 * (0.5 + 0.5 * Math.sin(t * 3)), 0, 0, 0);
    wall.timer += dt;
    if (wall.timer > 0.8 && wall.n < 24) {
      wall.timer = 0;
      const i = wall.n++;
      world.brick([4, 1.2, 2], [-6 + (i % 4) * 4 + (Math.floor(i / 4) % 2) * 2, 0.6 + Math.floor(i / 4) * 1.2, 72], [21, 23, 24, 37, 1][i % 5]);
    }
    if (wall.n >= 24 && wall.timer > 4) { // start over
      for (const p of [...world.parts]) if (p.position.z === 72 && p.size.x === 4 && p.size.z === 2) world.remove(p);
      wall.n = 0;
    }
    // friends idle (the classic 0.1 sin(t) idle sway) and turn to each other
    for (const f of friends) {
      const sw = 0.1 * Math.sin(t + f.t);
      f.m.setAngles(sw, sw, -sw, -sw);
    }
    // the sword fight: lunge and slash
    for (const [f, ph] of [[a, 0], [b, Math.PI]]) {
      const swing = Math.sin(t * 4 + ph);
      f.m.setAngles(swing > 0.6 ? 0 : 1.57, Math.sin(t * 9 + ph), Math.sin(t * 9 + ph) * 0.6, -Math.sin(t * 9 + ph) * 0.6);
      f.m.root.position.x = f.x + Math.sin(t * 1.3 + ph) * 1.2;
    }
    world.render();
  };
  requestAnimationFrame(frame);
}
