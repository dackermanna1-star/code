import * as THREE from 'three';
import type { Game } from '../game';
import { B } from '../anim/skeleton';
import { softGlowTexture } from '../world/textures';

/**
 * A still of her, for a screenshot: ?photo=sitcross (on a café chair in the warehouse, legs crossed)
 * or ?photo=smoke (with &map=alley: leant on the graffiti wall, smoking). Each sets its own lights
 * and a fixed lens; the menus go, her eyes stay open, and window.__photo turns true once she has
 * settled into the pose. The tunables (all optional, from the URL) are on each shot's function.
 */
export function setupPhoto(game: Game, params: URLSearchParams) {
  const g = game;
  const num = (k: string, d: number) => (params.has(k) ? Number(params.get(k)) : d);
  g.hud?.show(null);
  // (the full resolution asked for: a slow frame doesn't scale this one down)
  g.settings.dynamicResolution = false;
  if (params.get('photo') === 'smoke') smokePhoto(g, num);
  else chairPhoto(g, params, num);
  // (ready for the shutter once she's settled into the pose: its first half second carries a raised
  // foot up off the floor on a step's arc, and at 4K a frame can take seconds, so a fixed wait
  // could catch her mid-step)
  const settled = () => {
    const c = g.player.anim.clip;
    if (c && c.time >= 0.6) (window as unknown as { __photo: boolean }).__photo = true;
    else requestAnimationFrame(settled);
  };
  settled();
}

/** Her, put somewhere, in a pose that holds, eyes open, no gameplay rim glow (the lights here do that). */
function pose(g: Game, x: number, z: number, yaw: number, clip: string) {
  const p = g.player;
  p.scripted = true;
  p.x = x;
  p.z = z;
  p.yaw = yaw;
  p.vx = p.vz = 0;
  p.anim.initAt(x, z, yaw);
  p.play(clip, { halflife: 0.01, originYaw: yaw });
  p.model.face.nextBlink = 1e9;
  p.model.face.blinkT = -1;
  p.model.uniforms.uRim.value.w = 0;
}

/**
 * ?photo=smoke: the alley at night, leant on the tenement's wall by its back door under the lamp, the
 * big piece sprayed beside her, a cigarette between drags - its ember, a thread of smoke going up.
 * Tunables: x, z, yaw (deg), ang (the lens off her front, deg), dist, h, look, fov, pan (the lens
 * turned along her right, m), key, keyA (its cone, rad), rim, fill, face, faceA, ember, amb (the
 * alley's own lights, x), smoke (its opacity), cigUp, clear (junk moved out of the shot, m).
 */
function smokePhoto(g: Game, num: (k: string, d: number) => number) {
  const p = g.player;
  const x = num('x', -0.7), z = num('z', -10.68), yaw = (num('yaw', 0) * Math.PI) / 180;
  pose(g, x, z, yaw, 'st_smoke');
  const fx = Math.sin(yaw), fz = Math.cos(yaw);
  // (her right, as she faces)
  const rx = -fz, rz = fx;
  // (the loose junk in front of her - bags, a can - out of the shot)
  for (const [i, pr] of g.props.list.entries()) {
    const t = pr.body.translation();
    if (Math.hypot(t.x - x, t.z - z) < num('clear', 3.6)) pr.body.setTranslation({ x: 300 + i * 2, y: 0.6, z: 300 }, true);
  }
  // (the alley's own lights - the floodlight up on the wall, the moon on it, the sky - turned down:
  // the bricks round her fall off into the night and she's what's lit. Done before the shot's own
  // lights go in, the ember's among them)
  const amb = num('amb', 0.42);
  g.scene.traverse((o) => {
    if ((o as THREE.Light).isLight) (o as THREE.Light).intensity *= amb;
  });

  // ---- the cigarette, between the index and middle fingers, across the hand
  const hand = p.model.bones[B.handR];
  const u = p.def.restDir[B.handR].clone().normalize();
  const v = p.def.restUp[B.handR].clone().normalize();
  const thumb = new THREE.Vector3().crossVectors(u, v).multiplyScalar(-1).normalize();
  const cig = new THREE.Group();
  const paper = new THREE.Mesh(new THREE.CylinderGeometry(0.0042, 0.0042, 0.062, 12), new THREE.MeshStandardMaterial({ color: 0xf1ede4, roughness: 0.75 }));
  paper.position.y = 0.011;
  const filter = new THREE.Mesh(new THREE.CylinderGeometry(0.0044, 0.0044, 0.022, 12), new THREE.MeshStandardMaterial({ color: 0xc98a4a, roughness: 0.7 }));
  filter.position.y = -0.031;
  const ash = new THREE.Mesh(new THREE.CylinderGeometry(0.0041, 0.0043, 0.006, 12), new THREE.MeshStandardMaterial({ color: 0x5a5550, roughness: 0.95 }));
  ash.position.y = 0.045;
  const ember = new THREE.Mesh(new THREE.SphereGeometry(0.0046, 10, 8), new THREE.MeshBasicMaterial({ color: 0xff6a1a, toneMapped: false }));
  ember.position.y = 0.0435;
  ember.scale.y = 0.55;
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: softGlowTexture(), color: 0xff7a2a, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false }));
  glow.scale.setScalar(0.06);
  glow.position.y = 0.044;
  // (a touch of warmth on the fingers and the chin, gone before the wall: a light on the bricks a
  // foot behind would be a hot spot no ember makes)
  const emberLight = new THREE.PointLight(0xff7a2a, num('ember', 0.02), 0.28, 2);
  emberLight.position.y = 0.05;
  cig.add(paper, filter, ash, ember, glow, emberLight);
  // (held at the fingers' middle joints, its length across the hand: the lit end out past the
  // knuckles and tipped up with the fingers, away from her face, the filter in toward the palm)
  const along = v.clone().addScaledVector(u, num('cigUp', 0.45)).normalize();
  cig.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), along);
  cig.position.copy(u).multiplyScalar(0.088 * p.scale).addScaledVector(thumb, 0.01 * p.scale);
  hand.add(cig);

  // ---- the smoke: a thread up off the ember, curling and spreading as it goes, thinning out
  const smokeTex = softGlowTexture();
  const puffs: THREE.Sprite[] = [];
  // (many small sprites low down make the thread; fewer, wider ones higher up the curl it opens into)
  const N = 56;
  for (let i = 0; i < N; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, color: 0xcfcac4, transparent: true, depthWrite: false, opacity: 0 }));
    g.scene.add(s);
    puffs.push(s);
  }
  const tip = new THREE.Vector3();
  const place = () => {
    ember.getWorldPosition(tip);
    for (const [i, s] of puffs.entries()) {
      const k = (i / (N - 1)) ** 1.2;
      const rise = 0.006 + k * 0.85;
      // (it wanders more and curls as it goes up)
      const wob = 0.004 + k * k * 0.08;
      // (a draught along the wall takes it off to her right and back toward the bricks from the
      // first inch: up beside her head, not across her face)
      const drift = 0.015 + k * 0.22 + k * k * 0.15;
      const dx = rx * 0.82 - fx * 0.57, dz = rz * 0.82 - fz * 0.57;
      s.position.set(
        tip.x + dx * drift + Math.sin(k * 13 + 1) * wob * 0.6,
        tip.y + rise + Math.cos(k * 9.1) * wob * 0.3,
        tip.z + dz * drift + Math.cos(k * 8.3) * wob * 0.6,
      );
      s.scale.setScalar(0.01 + k * 0.05 + k * k * 0.28);
      (s.material as THREE.SpriteMaterial).opacity = Math.min(1, k / 0.05) * num('smoke', 0.5) * (1 - k) ** 1.3;
      s.material.rotation = i * 0.7;
    }
  };
  const tick = () => {
    place();
    requestAnimationFrame(tick);
  };
  tick();

  // ---- the lights: a warm key from above and in front of her right (the lamp over the door), a
  // magenta neon down her left edge, a cool wash from the street behind the lens
  const key = new THREE.SpotLight(0xffc98e, num('key', 20), 9, num('keyA', 0.38), 1, 1.6);
  key.position.set(x + rx * 1.1 + fx * 2.3, 3.1, z + rz * 1.1 + fz * 2.3);
  key.target.position.set(x, 0.9, z);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.02;
  g.scene.add(key, key.target);
  // (the neon rakes along the bricks from her left: it casts, so her own shadow is thrown along them
  // the other way, and the wall right behind her head is in it)
  const rim = new THREE.SpotLight(0xff3d9a, num('rim', 14), 8, 0.7, 0.8, 1.6);
  rim.position.set(x - rx * 2.1 + fx * 0.35, 2.0, z - rz * 2.1 + fz * 0.35);
  rim.target.position.set(x, 1.1, z);
  rim.castShadow = true;
  rim.shadow.mapSize.set(2048, 2048);
  rim.shadow.bias = -0.0004;
  rim.shadow.normalBias = 0.02;
  g.scene.add(rim, rim.target);
  const fill = new THREE.PointLight(0x7fa6ff, num('fill', 2.6), 9, 1.8);
  fill.position.set(x + fx * 3.2 + rx * 0.8, 1.6, z + fz * 3.2 + rz * 0.8);
  g.scene.add(fill);
  // (a narrow soft light on her face from over the lens: the face is what the eye goes to. It
  // casts, so what of it gets past her head lands in her shadow on the wall, not as a hot spot)
  const faceL = new THREE.SpotLight(0xffe4cc, num('face', 7), 7, num('faceA', 0.1), 1, 1.6);
  faceL.castShadow = true;
  faceL.shadow.mapSize.set(1024, 1024);
  faceL.shadow.bias = -0.0004;
  faceL.shadow.normalBias = 0.02;
  g.scene.add(faceL, faceL.target);

  // ---- the lens: low, from her right front, the whole of her and the piece sprayed behind
  const ang = (num('ang', -42) * Math.PI) / 180;
  const ca = yaw + ang;
  const dist = num('dist', 3.55), h = num('h', 0.72), lookY = num('look', 0.84), fov = num('fov', 34);
  const pos = new THREE.Vector3(x + Math.sin(ca) * dist, h, z + Math.cos(ca) * dist);
  // (pan: the lens turned that far along her right, putting her off the middle of the frame)
  const pan = num('pan', 0.55);
  const look = new THREE.Vector3(x + fx * 0.1 + rx * pan, lookY, z + fz * 0.1 + rz * pan);
  g.cam.sceneShot({ pos, look, fov, dur: 1e6, drift: 0 });
  faceL.position.copy(pos).add(new THREE.Vector3(0, 0.9, 0));
  faceL.target.position.set(x + fx * 0.05, 1.58, z + fz * 0.05);
}

/**
 * ?photo=sitcross: a café chair in dark wood under the warehouse's middle lamp, her on it with her
 * legs crossed, a portrait's lights round her.
 * Tunables: seat (seat height, m), yaw (which way she faces, deg), ang (the lens's angle off her
 * front, deg; + is her left), dist, h (lens height), look (height looked at), fov, key, fill, rim,
 * cx, cz (where the chair stands), fwd, clip.
 */
function chairPhoto(g: Game, params: URLSearchParams, num: (k: string, d: number) => number) {

  // ---- the chair
  const seatY = num('seat', 0.44);
  const yaw = (num('yaw', 0) * Math.PI) / 180;
  const wood = new THREE.MeshStandardMaterial({ color: 0x3b2417, roughness: 0.42, metalness: 0.04 });
  const chair = new THREE.Group();
  const part = (geo: THREE.BufferGeometry, x: number, y: number, z: number, rx = 0) => {
    const m = new THREE.Mesh(geo, wood);
    m.position.set(x, y, z);
    m.rotation.x = rx;
    m.castShadow = m.receiveShadow = true;
    chair.add(m);
  };
  const W = 0.46, D = 0.44, inset = 0.032;
  // the seat: a slab with its edges eased
  const seat = new THREE.Shape();
  const r = 0.04;
  seat.moveTo(-W / 2 + r, -D / 2);
  seat.lineTo(W / 2 - r, -D / 2);
  seat.quadraticCurveTo(W / 2, -D / 2, W / 2, -D / 2 + r);
  seat.lineTo(W / 2, D / 2 - r);
  seat.quadraticCurveTo(W / 2, D / 2, W / 2 - r, D / 2);
  seat.lineTo(-W / 2 + r, D / 2);
  seat.quadraticCurveTo(-W / 2, D / 2, -W / 2, D / 2 - r);
  seat.lineTo(-W / 2, -D / 2 + r);
  seat.quadraticCurveTo(-W / 2, -D / 2, -W / 2 + r, -D / 2);
  const seatGeo = new THREE.ExtrudeGeometry(seat, { depth: 0.032, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 2, curveSegments: 6 });
  seatGeo.rotateX(Math.PI / 2);
  part(seatGeo, 0, seatY, 0);
  // the legs, a little splayed and tapered; the back two run on up into the back
  const legH = seatY - 0.03;
  for (const sx of [-1, 1]) {
    part(new THREE.CylinderGeometry(0.016, 0.013, legH, 12), sx * (W / 2 - inset), legH / 2, D / 2 - inset);
    const post = new THREE.CylinderGeometry(0.017, 0.014, legH + 0.5, 12);
    part(post, sx * (W / 2 - inset), (legH + 0.5) / 2, -D / 2 + inset - 0.02, -0.06);
  }
  // the back: a deep top rail and a slat between the posts (leaning back with them); stretchers
  // between the legs
  const postZ = -D / 2 + inset - 0.02, postMid = (legH + 0.5) / 2;
  for (const [y, h, t] of [[seatY + 0.43, 0.085, 0.026], [seatY + 0.24, 0.045, 0.02]] as [number, number, number][])
    part(new THREE.BoxGeometry(W - 2 * inset + 0.034, h, t), 0, y, postZ - Math.sin(0.06) * (y - postMid), -0.06);
  for (const sz of [-1, 1]) part(new THREE.BoxGeometry(W - 2 * inset, 0.018, 0.018), 0, 0.16, sz * (D / 2 - inset));
  for (const sx of [-1, 1]) part(new THREE.BoxGeometry(0.018, 0.018, D - 2 * inset), sx * (W / 2 - inset), 0.22, 0);
  // where it stands: under the middle lamp, facing her way
  const cx = num('cx', 0), cz = num('cz', 0);
  chair.position.set(cx, 0, cz);
  chair.rotation.y = yaw;
  g.scene.add(chair);

  // ---- her, sat on it: the pelvis over the seat's middle (the pose puts it 0.12 behind her root)
  const fx = Math.sin(yaw), fz = Math.cos(yaw);
  const rx = cx + fx * num('fwd', 0.12), rz = cz + fz * num('fwd', 0.12);
  pose(g, rx, rz, yaw, params.get('clip') ?? 'st_sitcross');

  // ---- the lights: a soft key from the lens's side and above, a warm fill low on the other
  // side, a cool rim behind her for the leather's edge
  const ang = (num('ang', 35) * Math.PI) / 180;
  const ca = yaw + ang;
  const key = new THREE.SpotLight(0xffe6cf, num('key', 26), 9, 0.55, 0.85, 1.6);
  key.position.set(rx + Math.sin(ca + 0.45) * 2.6, 2.7, rz + Math.cos(ca + 0.45) * 2.6);
  key.target.position.set(rx, 0.75, rz);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.02;
  g.scene.add(key, key.target);
  const fill = new THREE.PointLight(0xffc9a0, num('fill', 3.2), 7, 1.8);
  fill.position.set(rx + Math.sin(ca - 1.1) * 2.2, 1.1, rz + Math.cos(ca - 1.1) * 2.2);
  g.scene.add(fill);
  const rim = new THREE.SpotLight(0xa8c4ff, num('rim', 18), 8, 0.6, 0.7, 1.6);
  rim.position.set(rx - Math.sin(ca) * 2.4 + fz * 0.8, 2.4, rz - Math.cos(ca) * 2.4 - fx * 0.8);
  rim.target.position.set(rx, 1.0, rz);
  g.scene.add(rim, rim.target);

  // ---- the lens
  const dist = num('dist', 2.75), h = num('h', 1.0), lookY = num('look', 0.72), fov = num('fov', 32);
  const pos = new THREE.Vector3(rx + Math.sin(ca) * dist, h, rz + Math.cos(ca) * dist);
  const look = new THREE.Vector3(rx + fx * 0.12, lookY, rz + fz * 0.12);
  g.cam.sceneShot({ pos, look, fov, dur: 1e6, drift: 0 });
}
