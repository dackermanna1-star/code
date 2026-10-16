// Dogs (6.25 cm voxels): a mongrel stray (дворняга) with a curled tail, and the smaller dark dog
// that walks on a leash. drawDog() rasterizes a dog facing local +Z with its ground centre at o.
// Poses: trot frames 0..3 (diagonal pairs), 'stand', 'sniff' (nose to the snow), 'bark'.

import { M } from '../../core/materials.js'
import { capsule, ellip, defineFine, F4, VoxelModel, snowTop } from './vox.js'

const TAU = Math.PI * 2

/**
 * o: [x, y, z] ground centre (model voxels). opts: { pose: 'trot'|'stand'|'sniff'|'bark', frame,
 *   s (size), body, pale, dark (materials), ears: 'up'|'flop', tail: 'curl'|'low' }
 */
export function drawDog(m, o, opts = {}) {
  const s = opts.s ?? 1
  const body = opts.body ?? M('life_dog')
  const pale = opts.pale ?? M('life_dog_pale')
  const dark = opts.dark ?? M('rubber')
  const pose = opts.pose ?? 'trot'
  const f = opts.frame ?? 0
  const P = (x, y, z) => [o[0] + x * s, o[1] + y * s, o[2] + z * s]

  // ---- legs (drawn first so the body overlaps their tops)
  const legR = 0.55 * Math.max(1, s * 0.9)
  const legs = [
    { x: 1.5, z: 2.7, front: true, pair: 0 }, { x: -1.5, z: 2.7, front: true, pair: 1 },
    { x: 1.5, z: -3.0, front: false, pair: 1 }, { x: -1.5, z: -3.0, front: false, pair: 0 },
  ]
  for (const L of legs) {
    let th = 0, lift = 0
    if (pose === 'trot') {
      const ph = (f / 4 + L.pair * 0.5) % 1
      th = 0.36 * Math.cos(TAU * ph)
      lift = ph > 0.5 ? Math.sin(Math.PI * (ph - 0.5) / 0.5) * 1.3 : 0
    } else if (pose === 'sniff' && L.front) th = 0.12
    else if (pose === 'bark' && L.front) th = 0.18
    const jy = L.front ? 5.4 : 5.6
    const len = jy - 0.55 - lift
    const paw = [L.x, 0.55 + lift, L.z + Math.sin(th) * len]
    if (L.front) {
      capsule(m, P(L.x, jy, L.z), P(...paw), legR * 1.25, legR, body)
    } else {
      // hind leg with a hock: thigh back-down, shank forward-down
      const hock = [L.x, 2.1 + lift * 0.6, L.z - 0.9 + Math.sin(th) * len * 0.6]
      capsule(m, P(L.x, jy, L.z), P(...hock), legR * 1.5, legR, body)
      capsule(m, P(...hock), P(...paw), legR, legR, body)
    }
    ellip(m, ...P(paw[0], paw[1] - 0.05, paw[2] + 0.35), 0.62 * s, 0.55 * s, 0.85 * s, pale)
  }

  // ---- body: barrel, deeper chest, pale belly
  ellip(m, ...P(0, 5.75, -0.4), 1.72 * s, 1.5 * s, 4.25 * s, body)
  ellip(m, ...P(0, 5.45, 2.3), 1.78 * s, 1.95 * s, 2.0 * s, body)
  // belly / chest underside
  for (let y = Math.floor(P(0, 3.6, 0)[1]); y < P(0, 4.75, 0)[1]; y++)
    for (let z = 0; z < m.sz; z++)
      for (let x = 0; x < m.sx; x++) if (m.get(x, y, z) === body && z + 0.5 > P(0, 0, -2.5)[2]) m.set(x, y, z, pale)

  // ---- neck & head
  let head, snoutA, snoutB
  if (pose === 'sniff') { head = [0, 3.4, 6.4]; snoutA = [0, 2.8, 7.2]; snoutB = [0, 1.6, 8.0] }
  else if (pose === 'bark') { head = [0, 9.2, 5.5]; snoutA = [0, 9.2, 6.6]; snoutB = [0, 9.6, 8.0] }
  else { head = [0, 8.5, 5.3]; snoutA = [0, 8.1, 6.3]; snoutB = [0, 7.85, 7.6] }
  capsule(m, P(0, 6.5, 3.2), P(head[0], head[1] - 0.4, head[2] - 0.6), 1.25 * s, 1.1 * s, body)
  ellip(m, ...P(...head), 1.3 * s, 1.25 * s, 1.45 * s, body)
  capsule(m, P(...snoutA), P(...snoutB), 0.8 * s, 0.62 * s, pale)
  ellip(m, ...P(snoutB[0], snoutB[1] + 0.15, snoutB[2] + 0.25), 0.55 * s, 0.5 * s, 0.45 * s, dark)
  if (pose === 'bark') {
    // lower jaw dropped open
    capsule(m, P(0, 8.5, 6.4), P(0, 7.6, 7.6), 0.55 * s, 0.45 * s, pale)
  }
  // ears: half-erect mongrel ears with dark tips
  const ears = opts.ears ?? 'up'
  for (const sx of [-1, 1]) {
    const base = [sx * 0.85, head[1] + 1.0, head[2] - 0.35]
    const tip = ears === 'up' ? [sx * 1.05, head[1] + 2.0, head[2] - 0.15] : [sx * 1.45, head[1] + 0.3, head[2] + 0.2]
    capsule(m, P(...base), P(...tip), 0.55 * s, 0.4 * s, body)
    ellip(m, ...P(...tip), 0.45 * s, 0.45 * s, 0.45 * s, dark)
  }
  // ---- tail
  if ((opts.tail ?? 'curl') === 'curl') {
    const wag = pose === 'trot' ? (f % 2 ? 0.35 : -0.35) : 0
    const pts = [[0, 6.6, -4.3], [0.1 + wag, 8.3, -5.0], [0.4 + wag, 9.4, -4.2], [0.7 + wag, 9.0, -3.2]]
    for (let i = 0; i < pts.length - 1; i++) capsule(m, P(...pts[i]), P(...pts[i + 1]), 0.75 * s, 0.6 * s, i === pts.length - 2 ? pale : body)
  } else {
    const wag = pose === 'trot' ? (f % 2 ? 0.5 : -0.5) : 0
    capsule(m, P(0, 6.4, -4.3), P(wag, 4.2, -5.6), 0.6 * s, 0.45 * s, body)
  }
}

// ---- the stray (дворняга): ginger-brown, pale socks and muzzle -------------------------------
const STRAY = { body: () => M('life_dog'), pale: () => M('life_dog_pale') }
function strayModel(pose, frame) {
  const m = new VoxelModel(8, 13, 20)
  drawDog(m, [4, 0, 10], { pose, frame, body: STRAY.body(), pale: STRAY.pale(), ears: 'up' })
  // frost on the back: a few snow crystals caught in the fur
  snowTop(m, { chance: 0.18, seed: 41 + frame, onlyAbove: 6 })
  m.setPivot(4, 0, 10)
  return m
}
const DOG_OPTS = { maxDistance: 150, dynamic: true }
for (let f = 0; f < 4; f++) defineFine(`life_dog_trot_${f}`, F4, () => strayModel('trot', f), DOG_OPTS)
defineFine('life_dog_stand', F4, () => strayModel('stand', 0), DOG_OPTS)
defineFine('life_dog_sniff', F4, () => strayModel('sniff', 0), DOG_OPTS)
defineFine('life_dog_bark', F4, () => strayModel('bark', 0), DOG_OPTS)

export const DOG_MODELS = {
  trot: [0, 1, 2, 3].map(f => `life_dog_trot_${f}`),
  stand: 'life_dog_stand', sniff: 'life_dog_sniff', bark: 'life_dog_bark',
}
