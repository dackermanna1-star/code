// Voxel people (6.25 cm voxels): rare distant pedestrians in winter clothes, each type built as
// four walk-cycle frames (frame-swapped dynamic placements, see walkers.js).
//
// Model conventions: front = local +Z, pivot = the walker's ground centre (between the feet).
// The main garment (coat / jacket) is `paint_matte`, so every placement takes its colour from
// `tint` (dark navy, black, brown, grey, burgundy…, see PEOPLE[type].tints).

import { M } from '../../core/materials.js'
import { VoxelModel, defineFine, F4, capsule, ellip, obox, rope, line, boxF, rowEllipse } from './vox.js'
import { drawPerson, DEFAULT_BODY } from './human.js'
import { drawDog } from './dog.js'

const body = over => ({ ...DEFAULT_BODY, ...over })
// frame 0..3 walk cycle, 4 = standing

// period winter palette (coats are dark; colour only in small doses)
const COATS_MEN = [0x26272b, 0x2a3040, 0x3b3129, 0x45464b, 0x2e3830, 0x332a26]
const COATS_WOMEN = [0x2b2b31, 0x4a2a30, 0x5c4a3c, 0x3a3f50, 0x6f6152, 0x283244, 0x4d3b45]
const PUFFERS = [0x2a3852, 0x222326, 0x4a2b2b, 0x51523f, 0x3c4a5c, 0x5a3530, 0x2f3b33]
const JACKETS = [0x1f1e1f, 0x2b2420, 0x262a33]

/** Person types: model frames, gait speed (m/s), stride (m per step), tints, size in model voxels. */
export const PEOPLE = {}

function defPerson(type, o) {
  const frames = []
  for (let f = 0; f < 5; f++) {
    const name = f < 4 ? `life_${type}_${f}` : `life_${type}_stand`
    frames.push(name)
    defineFine(name, F4, () => {
      const m = new VoxelModel(o.sx ?? 16, o.sy ?? 32, o.sz ?? 16)
      o.draw(m, f)
      m.setPivot(o.px ?? 8, 0, o.pz ?? 8)
      return m
    }, { maxDistance: o.maxDistance ?? 175, dynamic: true })
  }
  PEOPLE[type] = { type, frames: frames.slice(0, 4), stand: frames[4], speed: o.speed, stride: o.stride, tints: o.tints, weight: o.weight ?? 1, hours: o.hours ?? null, label: o.label }
}

// ---- 1. man in a long dark coat and an ушанка, with a «дипломат» briefcase ----------------------
const MAN = body({})
defPerson('man_coat', {
  label: 'man, long coat, ushanka, briefcase', speed: 1.35, stride: 0.74, tints: COATS_MEN, weight: 1.2,
  draw(m, f) {
    const flaps = 'ushanka'
    const J = drawPerson(m, MAN, {
      coat: 'long', hem: 8.2, flare: 0.45, collar: M('life_fur'), trousers: M('plastic_dark'), boots: M('rubber'),
      hat: flaps, hatMat: M('life_fur'), hands: M('rubber'), armR: 'carry', scarf: M('life_knit'),
    }, f, [8, 0, 8])
    // briefcase hanging from the right hand
    const h = J.arms.R.H
    obox(m, [h[0] - 0.3, h[1] - 2.6, h[2]], [1, 0, 0], [0, 1, 0], [0, 0, 1], 0.6, 2.1, 3.0, M('plastic_dark'))
    boxF(m, h[0] - 0.9, h[1] - 0.8, h[2] - 0.6, h[0] + 0.3, h[1] - 0.3, h[2] + 0.6, M('chrome'))
  },
})

// ---- 2. young man in a пуховик, knit cap, jeans, hands in pockets -----------------------------
const GUY = body({ L1: 6.9, L2: 6.4, torsoLen: 9.2, lean: 0.09, stride: 0.46, rx: [2.55, 2.55, 2.6, 2.55], rz: [1.8, 1.8, 1.9, 1.7] })
defPerson('man_puffer', {
  label: 'young man, puffer jacket, knit cap, hands in pockets', speed: 1.45, stride: 0.8, tints: PUFFERS, weight: 1,
  draw(m, f) {
    drawPerson(m, GUY, {
      coat: 'puffer', hem: 12.6, trousers: M('life_jeans'), boots: M('rubber'), bootTop: 1.4,
      hat: 'knit', hatMat: M('life_knit_dark'), armL: 'pocket', armR: 'pocket',
    }, f, [8, 0, 8])
  },
})

// ---- 3. man in a short leather jacket and кепка, smoking ----------------------------------------
const SMOKER = body({ L1: 6.7, L2: 6.3, torsoLen: 9.0, lean: 0.05, rx: [2.5, 2.5, 2.6, 2.55], rz: [1.75, 1.65, 1.85, 1.6] })
defPerson('man_jacket', {
  label: 'man, short leather jacket, flat cap, cigarette', speed: 1.3, stride: 0.74, tints: JACKETS, weight: 0.7,
  draw(m, f) {
    const J = drawPerson(m, SMOKER, {
      coat: 'jacket', hem: 12.4, trousers: M('life_jeans'), boots: M('rubber'), bootTop: 1.4,
      hat: 'cap', hatMat: M('life_knit'), scarf: M('life_knit'), hands: M('life_skin'), armR: 'smoke',
    }, f, [8, 0, 8])
    // cigarette ember between the fingers of the right hand
    const h = J.arms.R.H, d = J.arms.R.dir
    m.set(Math.floor(h[0] - 0.2), Math.floor(h[1] + d[1] * 1.1), Math.floor(h[2] + d[2] * 1.1 + 0.4), M('life_ember'))
  },
})

// ---- 4. woman in a long fitted coat with a fur collar and fur hat, handbag on the shoulder ----
const WOMAN = body({ L1: 6.3, L2: 6.0, torsoLen: 8.5, stride: 0.38, hipHalf: 1.0, rx: [2.6, 2.1, 2.5, 2.5], rz: [1.8, 1.6, 1.85, 1.55], headRy: 1.95, U: 4.4, Fa: 3.9 })
defPerson('woman_coat', {
  label: 'woman, long coat, fur collar and hat, shoulder bag', speed: 1.25, stride: 0.66, tints: COATS_WOMEN, weight: 1.3,
  draw(m, f) {
    const J = drawPerson(m, WOMAN, {
      coat: 'long', hem: 5.2, flare: 1.15, collar: M('life_fur'), trousers: M('rubber'), boots: M('rubber'), bootTop: 4.5,
      hat: 'furhat', hatMat: M('life_fur'), hands: M('rubber'), hair: M('bark'), armL: 'strap',
    }, f, [8, 0, 8])
    // handbag hanging at the left hip on a strap from the left shoulder
    const sh = J.shoulder
    const bag = [sh[0] + 3.4, J.hipY - 0.4, sh[2] + 0.2]
    obox(m, bag, [1, 0, 0], [0, 1, 0], [0, 0, 1], 0.9, 1.9, 2.4, M('leatherette'))
    line(m, [sh[0] + 2.6, sh[1] + 0.6, sh[2] + 0.3], [bag[0] + 0.2, bag[1] + 1.9, bag[2]], M('leatherette'))
  },
})

// ---- 5. woman in a пуховик with a long scarf, red knit hat, a shopping bag in hand -------------
const WOMAN2 = body({ L1: 6.2, L2: 5.9, torsoLen: 8.4, stride: 0.38, rx: [2.55, 2.4, 2.5, 2.5], rz: [1.8, 1.7, 1.85, 1.6], headRy: 1.95, U: 4.4, Fa: 3.9 })
defPerson('woman_puffer', {
  label: 'woman, long puffer, scarf, knit hat, carrier bag', speed: 1.2, stride: 0.64, tints: PUFFERS, weight: 1.1,
  draw(m, f) {
    const J = drawPerson(m, WOMAN2, {
      coat: 'puffer', hem: 7.4, flare: 0.4, trousers: M('rubber'), boots: M('rubber'), bootTop: 3.5,
      hat: 'knit', hatMat: M('fabric_red'), pompom: M('fabric_red'), scarf: M('life_knit'), scarfTail: true,
      hands: M('life_knit'), hair: M('bark'), armR: 'carry',
    }, f, [8, 0, 8])
    // white «маечка» carrier bag with groceries, a loaf sticking out
    const h = J.arms.R.H
    ellip(m, h[0] - 0.3, h[1] - 3.0, h[2], 1.3, 2.2, 1.9, M('plastic_white'))
    capsule(m, [h[0] - 0.3, h[1] - 1.0, h[2] - 0.8], [h[0] - 0.3, h[1] - 0.4, h[2] - 0.2], 0.4, 0.4, M('plastic_white'))
    capsule(m, [h[0] - 0.3, h[1] - 1.0, h[2] + 0.8], [h[0] - 0.3, h[1] - 0.4, h[2] + 0.2], 0.4, 0.4, M('plastic_white'))
    capsule(m, [h[0] - 0.3, h[1] - 2.0, h[2] + 0.7], [h[0] - 0.4, h[1] - 0.1, h[2] + 1.9], 0.7, 0.65, M('life_bread'))
  },
})

// ---- 6. бабушка with a tartan shopping trolley ---------------------------------------------------
const GRAN = body({ L1: 5.8, L2: 5.5, torsoLen: 8.1, lean: 0.22, stride: 0.26, kneeLift: 0.6, armSwing: 0.2, rx: [2.7, 2.6, 2.6, 2.5], rz: [1.9, 1.9, 1.9, 1.7], headRy: 1.9, U: 4.2, Fa: 3.7, headFwd: 0.9 })
defPerson('babushka_cart', {
  label: 'old woman (бабушка) with a tartan shopping trolley', speed: 0.75, stride: 0.42, tints: [0x2e2b2c, 0x3a332e, 0x2b303a, 0x45403a], weight: 0.9,
  sz: 28, pz: 18, hours: [7, 20],
  draw(m, f) {
    const J = drawPerson(m, GRAN, {
      coat: 'long', hem: 3.2, flare: 1.0, collar: M('life_fur_light'), trousers: M('life_knit'), boots: M('life_knit'), bootTop: 2.5,
      hat: 'shawl', hatMat: M('life_shawl'), hands: M('life_knit'), armR: 'pull', armL: 'swing',
    }, f, [8, 0, 18])
    // trolley pulled behind on the right: handle in the hand, frame down to two wheels
    const h = J.arms.R.H
    const wheelZ = h[2] - 6.2, axleY = 1.6
    const cx = h[0] - 0.4
    capsule(m, [cx - 2.0, h[1] - 0.2, h[2] - 0.2], [cx + 1.4, h[1] - 0.2, h[2] - 0.2], 0.45, 0.45, M('metal_dark'))
    for (const sx of [-1.7, 1.1]) capsule(m, [cx + sx, h[1] - 0.2, h[2] - 0.3], [cx + sx, axleY, wheelZ], 0.4, 0.4, M('metal_gray'))
    // the bag: tartan box leaning on the frame, checks in two colours
    const bc = [cx - 0.3, (h[1] + axleY) / 2 + 0.6, (h[2] + wheelZ) / 2 - 0.4]
    const ang = Math.atan2(h[2] - wheelZ, h[1] - axleY)
    const v = [0, Math.cos(ang), Math.sin(ang)], w = [0, -Math.sin(ang), Math.cos(ang)]
    obox(m, bc, [1, 0, 0], v, w, 2.2, 3.4, 1.6, M('life_tartan'))
    for (let y = 0; y < m.sy; y++) for (let z = 0; z < m.sz; z++) for (let x = 0; x < m.sx; x++)
      if (m.get(x, y, z) === M('life_tartan') && ((x + y) % 4 < 2) !== ((z + y) % 4 < 2)) m.set(x, y, z, M('life_tartan_b'))
    for (const sx of [-2.6, 1.9]) {
      for (let a = 0; a < 16; a++) {
        const t = a / 16 * Math.PI * 2
        m.set(Math.floor(cx + sx), Math.floor(axleY + Math.sin(t) * 1.25), Math.floor(wheelZ + Math.cos(t) * 1.25), M('rubber'))
      }
      boxF(m, cx + sx - 0.5, axleY - 0.5, wheelZ - 0.5, cx + sx + 0.5, axleY + 0.5, wheelZ + 0.5, M('plastic_dark'))
    }
    capsule(m, [cx - 2.6, axleY, wheelZ], [cx + 1.9, axleY, wheelZ], 0.3, 0.3, M('metal_dark'))
  },
})

// ---- 7. man walking a dog on a leash ------------------------------------------------------------
const WALKER = body({ L1: 6.6, L2: 6.2, torsoLen: 9.0, rx: [2.55, 2.5, 2.6, 2.55], rz: [1.8, 1.75, 1.9, 1.65] })
defPerson('man_dog', {
  label: 'man walking a dog on a leash', speed: 1.15, stride: 0.66, tints: [...PUFFERS.slice(0, 4), ...COATS_MEN.slice(0, 3)], weight: 0.9,
  sx: 24, sz: 40, px: 8, pz: 12, hours: [6, 24],
  draw(m, f) {
    const J = drawPerson(m, WALKER, {
      coat: 'short', hem: 11.6, trousers: M('plastic_dark'), boots: M('rubber'), bootTop: 1.6,
      hat: 'knit', hatMat: M('life_knit'), hands: M('rubber'), armL: 'leash', collar: M('life_knit_dark'),
    }, f, [8, 0, 12])
    // the dog trots ahead and a little to the left; leash from the left hand to its collar
    const dz = 12 + 19, dx = 8 + 7
    drawDog(m, [dx, 0, dz], { pose: f < 4 ? 'trot' : 'stand', frame: (f + 1) % 4, s: 0.9, body: M('plastic_dark'), pale: M('life_dog_pale'), ears: 'flop', tail: 'low' })
    const h = J.arms.L.H
    rope(m, [h[0] + 0.3, h[1] - 0.3, h[2] + 0.5], [dx, 6.6, dz + 3.4], 1.6, M('leatherette'))
  },
})

// ---- 8. parent pulling a child on a sled -------------------------------------------------------
const PARENT = body({ L1: 6.3, L2: 6.0, torsoLen: 8.6, lean: 0.12, stride: 0.38, rx: [2.6, 2.3, 2.5, 2.5], rz: [1.8, 1.65, 1.85, 1.6], headRy: 1.95, U: 4.4, Fa: 3.9 })
defPerson('parent_sled', {
  label: 'parent pulling a child on a sled', speed: 1.05, stride: 0.6, tints: COATS_WOMEN, weight: 0.8,
  sz: 44, pz: 36, hours: [9, 20],
  draw(m, f) {
    const J = drawPerson(m, PARENT, {
      coat: 'long', hem: 6.0, flare: 0.8, collar: M('life_fur'), trousers: M('rubber'), boots: M('rubber'), bootTop: 3.5,
      hat: 'furhat', hatMat: M('life_fur_light'), hands: M('rubber'), hair: M('bark'), armR: 'pull',
    }, f, [8, 0, 36])
    const h = J.arms.R.H
    // sled ~0.9 m behind the hand
    const front = 36 - 15, back = front - 13
    drawSledBody(m, 8, front, back)
    rope(m, [h[0], h[1] - 0.3, h[2] - 0.3], [8, 2.6, front + 1.2], 2.4, M('life_knit'))
    drawKid(m, [8, 3.5, back + 4.2], f)
  },
})

/**
 * Child sled (санки): two steel runners curling up at the front, slats, a low backrest.
 * xf (optional) = { T(p) → p, R(v) → v } transforms points / directions (e.g. a sled leaning on a wall).
 */
export function drawSledBody(m, cx, zFront, zBack, frameMat = M('metal_red'), xf = null, back = true) {
  const T = xf ? xf.T : p => p
  const R = xf ? xf.R : v => v
  const wood = M('wood')
  const cap = (a, b, r) => capsule(m, T(a), T(b), r + 0.12, r + 0.12, frameMat)
  for (const sx of [-2.6, 2.6]) {
    cap([cx + sx, 0.5, zBack], [cx + sx, 0.5, zFront - 1.2], 0.45)
    cap([cx + sx, 0.5, zFront - 1.2], [cx + sx, 2.4, zFront + 0.6], 0.45)
    // uprights under the seat
    for (const z of [zBack + 2, zFront - 3.5]) cap([cx + sx, 0.6, z], [cx + sx, 2.6, z], 0.4)
  }
  for (let z = Math.ceil(zBack + 0.5); z <= zFront - 1.5; z += 2) obox(m, T([cx, 2.95, z]), R([1, 0, 0]), R([0, 1, 0]), R([0, 0, 1]), 3.1, 0.45, 0.5, wood)
  // backrest
  if (!back) return
  for (const sx of [-2.4, 2.4]) cap([cx + sx, 3.0, zBack + 0.4], [cx + sx, 5.8, zBack - 0.6], 0.4)
  cap([cx - 2.4, 5.8, zBack - 0.6], [cx + 2.4, 5.8, zBack - 0.6], 0.4)
}

/** A small child sitting on a sled: snowsuit, knit hat with pompom, scarf, legs forward. */
function drawKid(m, o, f) {
  const suit = M('life_kid')
  const [x, y, z] = o
  const sway = f % 2 ? 0.25 : -0.25
  // legs forward along the sled
  for (const sx of [-0.9, 0.9]) {
    capsule(m, [x + sx, y + 0.9, z], [x + sx, y + 1.0, z + 4.5], 0.95, 0.9, suit)
    ellip(m, x + sx, y + 1.0, z + 5.1, 0.85, 1.0, 0.9, M('rubber'))
  }
  // torso and arms
  for (let yy = Math.floor(y + 0.5); yy + 0.5 <= y + 5.6; yy++) rowEllipse(m, yy, x + sway * (yy - y) / 6, z + 0.2, 2.0, 1.7, suit)
  for (const sx of [-1, 1]) capsule(m, [x + sx * 2.1, y + 4.8, z + 0.2], [x + sx * 2.0, y + 2.6, z + 2.0], 0.85, 0.8, suit)
  // scarf, head, hat
  for (let yy = Math.floor(y + 5.2); yy + 0.5 <= y + 6.4; yy++) rowEllipse(m, yy, x, z + 0.2, 1.5, 1.4, M('life_knit'))
  ellip(m, x + 0.5, y + 7.6, z + 0.5, 1.25, 1.6, 1.25, M('life_skin'))
  ellip(m, x + 0.5, y + 8.3, z + 0.3, 1.65, 1.5, 1.6, M('life_knit_dark'), (xx, yy, zz) => yy + 0.5 > y + 7.6 || zz + 0.5 < z)
  ellip(m, x + 0.5, y + 10.1, z + 0.1, 0.8, 0.8, 0.8, M('plastic_white'))
}

export const PERSON_TYPES = Object.keys(PEOPLE)
