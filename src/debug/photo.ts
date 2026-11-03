import * as THREE from 'three';
import type { Game } from '../game';

/**
 * A still of her, for a screenshot (?photo=sitcross): a café chair in dark wood under the
 * warehouse's middle lamp, Scarlet on it with her legs crossed, a portrait's lights round her and a
 * fixed lens; the menus away, her eyes open.
 *
 * Tunables (all optional): seat (seat height, m), yaw (which way she faces, deg), ang (the lens's
 * angle off her front, deg; + is her left), dist, h (lens height), look (height looked at), fov.
 */
export function setupPhoto(game: Game, params: URLSearchParams) {
  const g = game;
  const p = g.player;
  const num = (k: string, d: number) => (params.has(k) ? Number(params.get(k)) : d);
  g.hud?.show(null);
  // (the full resolution asked for: a slow frame doesn't scale this one down)
  g.settings.dynamicResolution = false;

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
  p.scripted = true;
  p.x = rx;
  p.z = rz;
  p.yaw = yaw;
  p.vx = p.vz = 0;
  p.anim.initAt(rx, rz, yaw);
  p.play(params.get('clip') ?? 'st_sitcross', { halflife: 0.01, originYaw: yaw });
  // (eyes open for the picture; no gameplay rim glow round her edges - the lights here do that)
  p.model.face.nextBlink = 1e9;
  p.model.face.blinkT = -1;
  p.model.uniforms.uRim.value.w = 0;

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
  (window as unknown as { __photo: boolean }).__photo = true;
}
