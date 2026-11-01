// Pose representation and the clip library (pure data/math, engine-free).
//
// A pose is a Float32Array: 17 bones x 3 Euler channels (Babylon's x=pitch, y=yaw, z=roll,
// applied roll -> pitch -> yaw) followed by 5 root channels [y, z, x, pitch, roll] that move
// and tilt the whole body around the hips. Character faces +z, its right side is +x.
//
// Poses are authored semantically and converted by setters:
//   spine/chest/neck/head: [pitch(+fwd), twist(+right), lean(+right)]
//   arm{L,R}: [raise(+forward), abduct(+out), swingIn(+across body)]
//   fore{L,R}: bend(+flex)          hand{L,R}: [pitch, twist, roll]
//   thigh{L,R}: [raise(+forward), abduct(+out), twist]   shin: bend(+flex)   foot: pitch(+toes up)
//   root: {y, z, x, pitch(+fwd), roll(+right)}

export const BONES = ['hips', 'spine', 'chest', 'neck', 'head', 'armL', 'foreL', 'handL', 'armR', 'foreR', 'handR', 'thighL', 'shinL', 'footL', 'thighR', 'shinR', 'footR'];
export const BONE_PARENT = [-1, 0, 1, 2, 3, 2, 5, 6, 2, 8, 9, 0, 11, 12, 0, 14, 15];
export const B = Object.fromEntries(BONES.map((n, i) => [n, i]));
export const ROOT = BONES.length * 3; // offset of root channels
export const POSE_LEN = ROOT + 5;
export const UPPER_BONES = [B.spine, B.chest, B.neck, B.head, B.armL, B.foreL, B.handL, B.armR, B.foreR, B.handR];
export const ARM_BONES = [B.armL, B.foreL, B.handL, B.armR, B.foreR, B.handR];

const SIDE = { L: -1, R: 1 };

export function newPose() { return new Float32Array(POSE_LEN); }

/** Semantic writers (all angles in radians). They overwrite the given channels. */
export const P = {
  torso(p, bone, pitch = 0, twist = 0, lean = 0) { const o = B[bone] * 3; p[o] = pitch; p[o + 1] = twist; p[o + 2] = -lean; },
  arm(p, s, raise = 0, abduct = 0, swingIn = 0) { const o = B['arm' + s] * 3, k = SIDE[s]; p[o] = -raise; p[o + 1] = -k * swingIn; p[o + 2] = k * abduct; },
  fore(p, s, bend = 0, twist = 0) { const o = B['fore' + s] * 3; p[o] = -bend; p[o + 1] = SIDE[s] * twist; p[o + 2] = 0; },
  hand(p, s, pitch = 0, twist = 0, roll = 0) { const o = B['hand' + s] * 3, k = SIDE[s]; p[o] = -pitch; p[o + 1] = k * twist; p[o + 2] = k * roll; },
  thigh(p, s, raise = 0, abduct = 0, twist = 0) { const o = B['thigh' + s] * 3, k = SIDE[s]; p[o] = -raise; p[o + 1] = k * twist; p[o + 2] = k * abduct; },
  shin(p, s, bend = 0) { const o = B['shin' + s] * 3; p[o] = bend; p[o + 1] = 0; p[o + 2] = 0; },
  foot(p, s, pitch = 0) { const o = B['foot' + s] * 3; p[o] = -pitch; p[o + 1] = 0; p[o + 2] = 0; },
  root(p, y = 0, z = 0, x = 0, pitch = 0, roll = 0) { p[ROOT] = y; p[ROOT + 1] = z; p[ROOT + 2] = x; p[ROOT + 3] = pitch; p[ROOT + 4] = -roll; },
};

/**
 * Build a sparse pose from a semantic description. Returns {pose, mask} where mask lists the
 * channel indices that the description touches (used for partial blending).
 * desc: { spine:[..], chest:[..], neck, head, armL:[raise,abduct,swingIn], foreL: bend | [bend,twist], handL:[..],
 *         thighL:[..], shinL: bend, footL: pitch, root:{y,z,x,pitch,roll}, mirror?: bool }
 */
export function compile(desc) {
  const pose = newPose();
  const mask = new Set();
  const touch = (bone) => { const o = B[bone] * 3; mask.add(o); mask.add(o + 1); mask.add(o + 2); };
  const d = desc.mirror ? mirrorDesc(desc) : desc;
  for (const [k, v] of Object.entries(d)) {
    if (k === 'mirror') continue;
    if (k === 'root') { const r = v; P.root(pose, r.y || 0, r.z || 0, r.x || 0, r.pitch || 0, r.roll || 0); for (let i = 0; i < 5; i++) mask.add(ROOT + i); continue; }
    if (['hips', 'spine', 'chest', 'neck', 'head'].includes(k)) { P.torso(pose, k, ...(v)); touch(k); continue; }
    const s = k.slice(-1), part = k.slice(0, -1);
    const vals = Array.isArray(v) ? v : [v];
    if (part === 'arm') P.arm(pose, s, ...vals);
    else if (part === 'fore') P.fore(pose, s, ...vals);
    else if (part === 'hand') P.hand(pose, s, ...vals);
    else if (part === 'thigh') P.thigh(pose, s, ...vals);
    else if (part === 'shin') P.shin(pose, s, ...vals);
    else if (part === 'foot') P.foot(pose, s, ...vals);
    else continue;
    touch(k);
  }
  return { pose, mask: [...mask].sort((a, b) => a - b) };
}
function mirrorDesc(desc) {
  const out = {};
  for (const [k, v] of Object.entries(desc)) {
    if (k === 'mirror') continue;
    if (k.endsWith('L') || k.endsWith('R')) { out[k.slice(0, -1) + (k.endsWith('L') ? 'R' : 'L')] = v; continue; }
    if (['spine', 'chest', 'neck', 'head', 'hips'].includes(k)) { out[k] = [v[0] || 0, -(v[1] || 0), -(v[2] || 0)]; continue; }
    if (k === 'root') { out.root = { ...v, x: -(v.x || 0), roll: -(v.roll || 0) }; continue; }
    out[k] = v;
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Clip library. Each clip: { dur (nominal seconds), loop?, full? (overrides legs/root),
//   keys: [[t(0..1), desc, ease?]], events: {name: t} }
// Poses are sparse; untouched channels fall through to locomotion / stance layers.
const guardArms = { armL: [0.75, 0.3, 0.35], foreL: 2.0, armR: [0.6, 0.35, 0.3], foreR: 2.1, handL: [0.3, 0, 0], handR: [0.3, 0, 0] };
const neutralArms = { armL: [0.05, 0.12, 0], foreL: 0.15, armR: [0.05, 0.12, 0], foreR: 0.15 };
const k = (t, desc, ease) => [t, desc, ease];

const CLIPS_SRC = {
  // --- Strikes (hit event = when the strike lands) -----------------------------------------
  jab: { dur: 0.36, events: { hit: 0.36 }, keys: [
    k(0, { ...guardArms, chest: [0.1, -0.15, 0] }),
    k(0.25, { ...guardArms, armL: [1.0, 0.25, 0.25], foreL: 1.6, chest: [0.12, -0.25, 0] }),
    k(0.42, { armL: [1.45, 0.1, 0.12], foreL: 0.08, handL: [0, 0, 0], armR: [0.6, 0.35, 0.3], foreR: 2.1, chest: [0.15, 0.3, 0], head: [0.05, -0.1, 0] }, 'out'),
    k(0.6, { armL: [1.4, 0.12, 0.12], foreL: 0.15, armR: [0.6, 0.35, 0.3], foreR: 2.1, chest: [0.15, 0.28, 0] }),
    k(1, { ...guardArms, chest: [0.1, -0.1, 0] }) ] },
  cross: { dur: 0.42, events: { hit: 0.4 }, keys: [
    k(0, { ...guardArms, chest: [0.1, 0.1, 0] }),
    k(0.28, { ...guardArms, armR: [0.8, 0.45, 0.2], foreR: 1.9, chest: [0.1, 0.25, 0], spine: [0.05, 0.15, 0] }),
    k(0.45, { armR: [1.5, 0.05, 0.2], foreR: 0.06, armL: [0.8, 0.3, 0.4], foreL: 2.1, chest: [0.18, -0.45, 0], spine: [0.08, -0.25, 0], head: [0.05, 0.1, 0] }, 'out'),
    k(0.62, { armR: [1.45, 0.08, 0.2], foreR: 0.15, armL: [0.8, 0.3, 0.4], foreL: 2.1, chest: [0.16, -0.4, 0], spine: [0.06, -0.2, 0] }),
    k(1, { ...guardArms, chest: [0.1, 0, 0] }) ] },
  hook: { dur: 0.48, events: { hit: 0.42 }, keys: [
    k(0, { ...guardArms }),
    k(0.3, { ...guardArms, armL: [0.9, 1.2, -0.3], foreL: 1.7, chest: [0.1, 0.35, 0.05] }),
    k(0.48, { armL: [1.35, 0.9, 0.9], foreL: 1.35, armR: [0.7, 0.35, 0.3], foreR: 2.1, chest: [0.12, -0.55, -0.08], spine: [0.05, -0.2, 0] }, 'out'),
    k(0.66, { armL: [1.2, 0.6, 1.0], foreL: 1.4, armR: [0.7, 0.35, 0.3], foreR: 2.1, chest: [0.12, -0.5, -0.05] }),
    k(1, { ...guardArms }) ] },
  uppercut: { dur: 0.55, events: { hit: 0.45 }, keys: [
    k(0, { ...guardArms }),
    k(0.32, { ...guardArms, armR: [0.1, 0.2, 0.1], foreR: 1.9, chest: [0.3, 0.25, 0], root: { y: -0.12 }, thighL: [0.3, 0, 0], shinL: 0.5, thighR: [0.2, 0, 0], shinR: 0.4 }),
    k(0.5, { armR: [2.1, 0.1, 0.15], foreR: 1.4, armL: [0.8, 0.3, 0.4], foreL: 2.1, chest: [-0.15, -0.35, 0], head: [-0.15, 0, 0], root: { y: 0.03 } }, 'out'),
    k(0.7, { armR: [1.9, 0.1, 0.15], foreR: 1.4, armL: [0.8, 0.3, 0.4], foreL: 2.1, chest: [-0.1, -0.3, 0] }),
    k(1, { ...guardArms }) ] },
  haymaker: { dur: 0.75, events: { hit: 0.55 }, keys: [
    k(0, { ...guardArms }),
    k(0.4, { armR: [0.2, 1.4, -0.6], foreR: 1.2, armL: [0.9, 0.3, 0.3], foreL: 1.8, chest: [0.0, 0.7, 0.1], spine: [0, 0.3, 0], head: [0, -0.4, 0] }),
    k(0.58, { armR: [1.4, 0.6, 1.0], foreR: 0.35, armL: [0.5, 0.3, 0], foreL: 1.0, chest: [0.25, -0.8, -0.1], spine: [0.15, -0.35, 0], root: { z: 0.12 } }, 'out'),
    k(0.78, { armR: [1.1, 0.3, 1.2], foreR: 0.5, chest: [0.25, -0.75, -0.05], spine: [0.15, -0.3, 0] }),
    k(1, { ...guardArms }) ] },
  kick: { dur: 0.62, full: true, events: { hit: 0.42 }, keys: [
    k(0, { ...guardArms, thighR: [0, 0, 0], shinR: 0.1 }),
    k(0.3, { ...guardArms, thighR: [1.3, 0.05, 0], shinR: 1.9, footR: 0.2, spine: [-0.15, 0, 0], thighL: [0, 0, 0], shinL: 0.15 }),
    k(0.45, { ...guardArms, armL: [0.5, 0.5, 0.2], armR: [0.2, 0.6, 0], thighR: [1.45, 0.05, 0], shinR: 0.1, footR: -0.4, spine: [-0.3, 0, 0], chest: [-0.1, 0, 0], thighL: [-0.05, 0, 0], shinL: 0.2, root: { pitch: -0.15 } }, 'out'),
    k(0.62, { ...guardArms, thighR: [1.2, 0.05, 0], shinR: 1.2, spine: [-0.2, 0, 0], root: { pitch: -0.08 } }),
    k(1, { ...guardArms, thighR: [0, 0, 0], shinR: 0.1 }) ] },
  stomp: { dur: 0.6, full: true, events: { hit: 0.45 }, keys: [
    k(0, { ...guardArms }),
    k(0.35, { armL: [0.4, 0.6, 0], foreL: 1.0, armR: [0.4, 0.6, 0], foreR: 1.0, thighR: [1.4, 0.1, 0], shinR: 1.7, spine: [0.2, 0, 0], thighL: [0.1, 0, 0], shinL: 0.3 }),
    k(0.5, { armL: [0.3, 0.5, 0], foreL: 0.8, armR: [0.3, 0.5, 0], foreR: 0.8, thighR: [0.5, 0.1, 0], shinR: 0.2, footR: -0.2, spine: [0.45, 0, 0], head: [0.35, 0, 0], thighL: [0.2, 0, 0], shinL: 0.5, root: { y: -0.12 } }, 'out'),
    k(1, { ...guardArms }) ] },
  // --- Weapons --------------------------------------------------------------------------------
  swing: { dur: 0.55, events: { hit: 0.48 }, keys: [
    k(0, { armR: [0.6, 0.3, 0], foreR: 1.0, armL: [0.6, 0.3, 0.3], foreL: 1.4 }),
    k(0.35, { armR: [1.4, 1.5, -0.6], foreR: 1.4, handR: [0, 0, 0.3], armL: [0.8, 0.2, 0.4], foreL: 1.6, chest: [0, 0.7, 0], spine: [0, 0.3, 0] }),
    k(0.52, { armR: [1.4, 0.4, 1.1], foreR: 0.3, handR: [0, 0, -0.2], armL: [0.6, 0.4, 0], foreL: 1.0, chest: [0.2, -0.75, 0], spine: [0.1, -0.3, 0] }, 'out'),
    k(0.75, { armR: [1.0, 0.2, 1.2], foreR: 0.4, chest: [0.2, -0.7, 0], spine: [0.1, -0.25, 0] }),
    k(1, { armR: [0.6, 0.3, 0], foreR: 1.0 }) ] },
  overhead: { dur: 0.85, events: { hit: 0.62 }, keys: [
    k(0, { armR: [0.6, 0.3, 0], foreR: 1.0, armL: [0.6, 0.3, 0], foreL: 1.0 }),
    k(0.45, { armR: [2.9, 0.2, 0.15], foreR: 1.4, armL: [2.9, 0.2, 0.15], foreL: 1.4, chest: [-0.35, 0, 0], spine: [-0.15, 0, 0], head: [-0.1, 0, 0] }),
    k(0.64, { armR: [1.2, 0.15, 0.2], foreR: 0.2, armL: [1.2, 0.15, 0.2], foreL: 0.2, chest: [0.45, 0, 0], spine: [0.3, 0, 0], root: { y: -0.08, z: 0.1 } }, 'out'),
    k(0.85, { armR: [1.0, 0.15, 0.2], foreR: 0.3, armL: [1.0, 0.15, 0.2], foreL: 0.3, chest: [0.4, 0, 0], spine: [0.25, 0, 0], root: { y: -0.06 } }),
    k(1, { armR: [0.6, 0.3, 0], foreR: 1.0, armL: [0.6, 0.3, 0], foreL: 1.0 }) ] },
  swing2h: { dur: 0.75, events: { hit: 0.55 }, keys: [
    k(0, { armR: [0.8, 0.25, 0.1], foreR: 1.0, armL: [0.8, 0.25, 0.1], foreL: 1.0 }),
    k(0.4, { armR: [1.6, 1.4, -0.5], foreR: 0.8, armL: [1.5, 0.2, 0.9], foreL: 1.2, chest: [-0.05, 0.85, 0], spine: [0, 0.35, 0] }),
    k(0.6, { armR: [1.5, 0.3, 0.9], foreR: 0.3, armL: [1.3, -0.2, 0.5], foreL: 0.7, chest: [0.2, -0.85, 0], spine: [0.1, -0.35, 0] }, 'out'),
    k(1, { armR: [0.8, 0.25, 0.1], foreR: 1.0, armL: [0.8, 0.25, 0.1], foreL: 1.0 }) ] },
  // --- Grappling -------------------------------------------------------------------------------
  grabReach: { dur: 0.38, events: { hit: 0.5 }, keys: [
    k(0, { ...guardArms }),
    k(0.5, { armL: [1.4, 0.35, 0.3], foreL: 0.5, armR: [1.4, 0.35, 0.3], foreR: 0.5, chest: [0.25, 0, 0], spine: [0.1, 0, 0], root: { z: 0.12 } }, 'out'),
    k(1, { armL: [1.2, 0.3, 0.4], foreL: 0.9, armR: [1.2, 0.3, 0.4], foreR: 0.9, chest: [0.2, 0, 0] }) ] },
  grappleHold: { dur: 1, loop: true, keys: [
    k(0, { armL: [1.25, 0.25, 0.45], foreL: 1.1, armR: [1.25, 0.25, 0.45], foreR: 1.1, chest: [0.25, 0, 0], spine: [0.12, 0, 0], thighL: [0.25, 0.05, 0], shinL: 0.4, thighR: [-0.15, 0.05, 0], shinR: 0.25, root: { y: -0.05 } }),
    k(0.5, { armL: [1.3, 0.25, 0.45], foreL: 1.05, armR: [1.2, 0.25, 0.45], foreR: 1.15, chest: [0.27, 0.06, 0], spine: [0.12, 0, 0], thighL: [0.25, 0.05, 0], shinL: 0.4, thighR: [-0.15, 0.05, 0], shinR: 0.25, root: { y: -0.06 } }),
    k(1, { armL: [1.25, 0.25, 0.45], foreL: 1.1, armR: [1.25, 0.25, 0.45], foreR: 1.1, chest: [0.25, 0, 0], spine: [0.12, 0, 0], thighL: [0.25, 0.05, 0], shinL: 0.4, thighR: [-0.15, 0.05, 0], shinR: 0.25, root: { y: -0.05 } }) ] },
  grappled: { dur: 0.8, loop: true, full: true, keys: [
    k(0, { armL: [0.6, 0.7, 0], foreL: 1.4, armR: [0.5, 0.8, 0], foreR: 1.2, chest: [-0.15, 0, 0.05], head: [-0.25, 0, 0], thighL: [0.1, 0.1, 0], shinL: 0.2, thighR: [-0.1, 0.1, 0], shinR: 0.15 }),
    k(0.5, { armL: [0.7, 0.6, 0], foreL: 1.2, armR: [0.4, 0.9, 0], foreR: 1.4, chest: [-0.1, 0.1, -0.05], head: [-0.2, 0.1, 0], thighL: [0.1, 0.1, 0], shinL: 0.25, thighR: [-0.1, 0.1, 0], shinR: 0.1 }),
    k(1, { armL: [0.6, 0.7, 0], foreL: 1.4, armR: [0.5, 0.8, 0], foreR: 1.2, chest: [-0.15, 0, 0.05], head: [-0.25, 0, 0], thighL: [0.1, 0.1, 0], shinL: 0.2, thighR: [-0.1, 0.1, 0], shinR: 0.15 }) ] },
  knee: { dur: 0.5, full: true, events: { hit: 0.45 }, keys: [
    k(0, { armL: [1.25, 0.25, 0.45], foreL: 1.1, armR: [1.25, 0.25, 0.45], foreR: 1.1, chest: [0.25, 0, 0] }),
    k(0.45, { armL: [1.1, 0.25, 0.45], foreL: 1.3, armR: [1.1, 0.25, 0.45], foreR: 1.3, chest: [0.35, 0, 0], thighR: [1.4, 0.05, 0], shinR: 2.0, thighL: [-0.1, 0, 0], shinL: 0.2 }, 'out'),
    k(1, { armL: [1.25, 0.25, 0.45], foreL: 1.1, armR: [1.25, 0.25, 0.45], foreR: 1.1, chest: [0.25, 0, 0] }) ] },
  headbutt: { dur: 0.55, events: { hit: 0.5 }, keys: [
    k(0, { armL: [1.25, 0.25, 0.45], foreL: 1.1, armR: [1.25, 0.25, 0.45], foreR: 1.1, chest: [0.2, 0, 0] }),
    k(0.4, { armL: [1.25, 0.25, 0.45], foreL: 1.2, armR: [1.25, 0.25, 0.45], foreR: 1.2, chest: [-0.3, 0, 0], neck: [-0.3, 0, 0], head: [-0.2, 0, 0] }),
    k(0.52, { armL: [1.25, 0.25, 0.45], foreL: 1.0, armR: [1.25, 0.25, 0.45], foreR: 1.0, chest: [0.45, 0, 0], neck: [0.25, 0, 0], head: [0.2, 0, 0], root: { z: 0.08 } }, 'out'),
    k(1, { armL: [1.25, 0.25, 0.45], foreL: 1.1, armR: [1.25, 0.25, 0.45], foreR: 1.1, chest: [0.2, 0, 0] }) ] },
  throwToss: { dur: 0.6, full: true, events: { release: 0.5 }, keys: [
    k(0, { armL: [1.25, 0.25, 0.45], foreL: 1.1, armR: [1.25, 0.25, 0.45], foreR: 1.1, chest: [0.25, 0, 0] }),
    k(0.35, { armL: [1.0, 0.3, 0.3], foreL: 1.3, armR: [1.0, 0.3, 0.3], foreR: 1.3, chest: [0.1, 0.8, 0], spine: [0, 0.4, 0], thighL: [0.35, 0.2, 0], shinL: 0.6, root: { y: -0.1 } }),
    k(0.55, { armL: [1.5, 0.6, -0.2], foreL: 0.4, armR: [1.4, 0.2, 0.9], foreR: 0.3, chest: [0.25, -0.9, 0], spine: [0.1, -0.4, 0], thighR: [0.3, 0.1, 0], shinR: 0.4, root: { y: -0.05 } }, 'out'),
    k(1, { ...guardArms }) ] },
  shove: { dur: 0.45, events: { hit: 0.45 }, keys: [
    k(0, { armL: [1.0, 0.3, 0.3], foreL: 1.4, armR: [1.0, 0.3, 0.3], foreR: 1.4, chest: [0.1, 0, 0] }),
    k(0.45, { armL: [1.5, 0.25, 0.15], foreL: 0.15, armR: [1.5, 0.25, 0.15], foreR: 0.15, chest: [0.3, 0, 0], spine: [0.1, 0, 0], root: { z: 0.12 } }, 'out'),
    k(1, { ...guardArms }) ] },
  // --- Reactions ------------------------------------------------------------------------------
  flinch: { dur: 0.32, keys: [
    k(0, {}), k(0.25, { chest: [-0.25, 0.15, 0.1], neck: [-0.2, 0, 0], head: [-0.3, 0.2, 0], armL: [0.6, 0.6, 0.2], foreL: 1.6, armR: [0.4, 0.5, 0], foreR: 1.4 }, 'out'), k(1, {}) ] },
  flinchBody: { dur: 0.36, keys: [
    k(0, {}), k(0.25, { chest: [0.45, 0, 0], spine: [0.2, 0, 0], head: [0.2, 0, 0], armL: [0.7, 0.2, 0.5], foreL: 1.6, armR: [0.7, 0.2, 0.5], foreR: 1.6 }, 'out'), k(1, {}) ] },
  stagger: { dur: 0.7, full: true, keys: [
    k(0, {}),
    k(0.2, { chest: [-0.4, 0.3, 0.15], spine: [-0.2, 0, 0], head: [-0.35, 0.3, 0], armL: [0.9, 1.0, 0], foreL: 0.6, armR: [0.4, 1.1, 0], foreR: 0.5, thighL: [0.4, 0.1, 0], shinL: 0.5, thighR: [-0.3, 0.1, 0], shinR: 0.3, root: { y: -0.06, z: -0.1 } }, 'out'),
    k(0.6, { chest: [0.1, 0.1, 0.05], head: [0.1, 0, 0], armL: [0.3, 0.5, 0], foreL: 0.4, armR: [0.3, 0.5, 0], foreR: 0.4, thighL: [0.2, 0.05, 0], shinL: 0.3, root: { y: -0.04 } }),
    k(1, {}) ] },
  blockHit: { dur: 0.25, keys: [k(0, {}), k(0.3, { chest: [-0.15, 0, 0], head: [-0.1, 0, 0], root: { z: -0.05 } }, 'out'), k(1, {})] },
  fallBack: { dur: 0.6, full: true, keys: [
    k(0, { armL: [0.4, 0.8, 0], armR: [0.4, 0.8, 0] }),
    k(0.35, { chest: [-0.3, 0, 0], head: [-0.4, 0, 0], armL: [1.4, 1.0, 0], foreL: 0.5, armR: [1.4, 1.0, 0], foreR: 0.5, thighL: [0.7, 0.1, 0], shinL: 0.6, thighR: [0.9, 0.1, 0], shinR: 0.9, root: { y: -0.45, pitch: -0.9, z: -0.3 } }, 'in'),
    k(0.7, { chest: [0.1, 0, 0], head: [0.25, 0, 0], armL: [0.9, 1.2, 0], foreL: 0.4, armR: [0.8, 1.1, 0], foreR: 0.5, thighL: [0.3, 0.12, 0], shinL: 0.3, thighR: [0.45, 0.15, 0], shinR: 0.5, root: { y: -0.78, pitch: -1.57, z: -0.5 } }, 'out'),
    k(1, { chest: [0.0, 0, 0], head: [0.15, 0.2, 0], armL: [0.6, 1.2, 0], foreL: 0.3, armR: [0.4, 1.0, 0], foreR: 0.4, thighL: [0.15, 0.12, 0], shinL: 0.15, thighR: [0.3, 0.15, 0], shinR: 0.4, root: { y: -0.8, pitch: -1.57, z: -0.5 } }) ] },
  fallFront: { dur: 0.6, full: true, keys: [
    k(0, {}),
    k(0.4, { chest: [0.3, 0, 0], head: [0.1, 0, 0], armL: [1.6, 0.4, 0], foreL: 0.4, armR: [1.6, 0.4, 0], foreR: 0.4, thighL: [-0.2, 0, 0], shinL: 0.6, thighR: [0.1, 0, 0], shinR: 0.9, root: { y: -0.45, pitch: 0.9, z: 0.3 } }, 'in'),
    k(0.75, { chest: [0, 0, 0], head: [-0.6, 0.6, 0], armL: [2.6, 0.5, 0], foreL: 0.6, armR: [0.3, 0.5, 0], foreR: 0.2, thighL: [-0.05, 0.15, 0], shinL: 0.2, thighR: [-0.05, 0.1, 0], shinR: 0.4, root: { y: -0.8, pitch: 1.57, z: 0.45 } }, 'out'),
    k(1, { chest: [0, 0, 0], head: [-0.6, 0.6, 0], armL: [2.7, 0.5, 0], foreL: 0.6, armR: [0.2, 0.4, 0], foreR: 0.2, thighL: [0, 0.15, 0], shinL: 0.15, thighR: [0, 0.1, 0], shinR: 0.35, root: { y: -0.8, pitch: 1.57, z: 0.45 } }) ] },
  lieBack: { dur: 3, loop: true, full: true, keys: [
    k(0, { chest: [0.0, 0, 0], head: [0.15, 0.2, 0], armL: [0.6, 1.2, 0], foreL: 0.3, armR: [0.4, 1.0, 0], foreR: 0.4, thighL: [0.15, 0.12, 0], shinL: 0.15, thighR: [0.3, 0.15, 0], shinR: 0.4, root: { y: -0.8, pitch: -1.57, z: -0.5 } }),
    k(0.5, { chest: [0.03, 0, 0], head: [0.2, 0.15, 0], armL: [0.6, 1.25, 0], foreL: 0.35, armR: [0.4, 1.0, 0], foreR: 0.45, thighL: [0.15, 0.12, 0], shinL: 0.15, thighR: [0.3, 0.15, 0], shinR: 0.4, root: { y: -0.8, pitch: -1.57, z: -0.5 } }),
    k(1, { chest: [0.0, 0, 0], head: [0.15, 0.2, 0], armL: [0.6, 1.2, 0], foreL: 0.3, armR: [0.4, 1.0, 0], foreR: 0.4, thighL: [0.15, 0.12, 0], shinL: 0.15, thighR: [0.3, 0.15, 0], shinR: 0.4, root: { y: -0.8, pitch: -1.57, z: -0.5 } }) ] },
  lieFront: { dur: 3, loop: true, full: true, keys: [
    k(0, { chest: [0, 0, 0], head: [-0.6, 0.6, 0], armL: [2.7, 0.5, 0], foreL: 0.6, armR: [0.2, 0.4, 0], foreR: 0.2, thighL: [0, 0.15, 0], shinL: 0.15, thighR: [0, 0.1, 0], shinR: 0.35, root: { y: -0.8, pitch: 1.57, z: 0.45 } }),
    k(1, { chest: [0, 0, 0], head: [-0.6, 0.6, 0], armL: [2.7, 0.5, 0], foreL: 0.6, armR: [0.2, 0.4, 0], foreR: 0.2, thighL: [0, 0.15, 0], shinL: 0.15, thighR: [0, 0.1, 0], shinR: 0.35, root: { y: -0.8, pitch: 1.57, z: 0.45 } }) ] },
  getUpBack: { dur: 0.85, full: true, keys: [
    k(0, { chest: [0.0, 0, 0], head: [0.15, 0.2, 0], armL: [0.6, 1.2, 0], foreL: 0.3, armR: [0.4, 1.0, 0], foreR: 0.4, thighL: [0.15, 0.12, 0], shinL: 0.15, thighR: [0.3, 0.15, 0], shinR: 0.4, root: { y: -0.8, pitch: -1.57, z: -0.5 } }),
    k(0.35, { chest: [0.6, 0, 0], head: [0.3, 0, 0], armL: [-0.6, 0.4, 0], foreL: 0.2, armR: [-0.6, 0.4, 0], foreR: 0.2, thighL: [1.6, 0.1, 0], shinL: 2.2, thighR: [1.4, 0.1, 0], shinR: 2.0, root: { y: -0.62, pitch: -0.5, z: -0.35 } }),
    k(0.7, { chest: [0.5, 0, 0], head: [0.1, 0, 0], armL: [0.6, 0.4, 0], foreL: 0.6, armR: [0.6, 0.4, 0], foreR: 0.6, thighL: [1.2, 0.1, 0], shinL: 1.9, thighR: [0.5, 0.1, 0], shinR: 1.1, root: { y: -0.35, pitch: 0.25, z: -0.1 } }, 'out'),
    k(1, {}) ] },
  getUpFront: { dur: 0.85, full: true, keys: [
    k(0, { chest: [0, 0, 0], head: [-0.6, 0.6, 0], armL: [2.7, 0.5, 0], foreL: 0.6, armR: [0.2, 0.4, 0], foreR: 0.2, thighL: [0, 0.15, 0], shinL: 0.15, thighR: [0, 0.1, 0], shinR: 0.35, root: { y: -0.8, pitch: 1.57, z: 0.45 } }),
    k(0.35, { chest: [-0.2, 0, 0], head: [-0.5, 0, 0], armL: [1.4, 0.2, 0], foreL: 0.2, armR: [1.4, 0.2, 0], foreR: 0.2, thighL: [0.9, 0.1, 0], shinL: 1.8, thighR: [0.2, 0.1, 0], shinR: 1.2, root: { y: -0.55, pitch: 1.0, z: 0.3 } }),
    k(0.7, { chest: [0.4, 0, 0], head: [0, 0, 0], armL: [0.6, 0.4, 0], foreL: 0.6, armR: [0.6, 0.4, 0], foreR: 0.6, thighL: [1.2, 0.1, 0], shinL: 1.9, thighR: [0.4, 0.1, 0], shinR: 1.0, root: { y: -0.3, pitch: 0.3, z: 0.05 } }, 'out'),
    k(1, {}) ] },
  thrown: { dur: 0.7, full: true, keys: [
    k(0, { armL: [1.8, 1.2, 0], foreL: 0.3, armR: [1.8, 1.2, 0], foreR: 0.3, thighL: [0.8, 0.3, 0], shinL: 0.6, thighR: [0.4, 0.3, 0], shinR: 0.9, chest: [-0.3, 0, 0], head: [-0.4, 0, 0], root: { y: -0.1, pitch: -0.6 } }),
    k(0.6, { armL: [1.6, 1.4, 0], foreL: 0.2, armR: [1.9, 1.3, 0], foreR: 0.2, thighL: [0.9, 0.3, 0], shinL: 0.4, thighR: [0.6, 0.3, 0], shinR: 0.6, chest: [-0.2, 0, 0], head: [-0.2, 0, 0], root: { y: -0.4, pitch: -1.3, z: -0.3 } }),
    k(1, { chest: [0.1, 0, 0], head: [0.25, 0, 0], armL: [0.9, 1.2, 0], foreL: 0.4, armR: [0.8, 1.1, 0], foreR: 0.5, thighL: [0.3, 0.12, 0], shinL: 0.3, thighR: [0.45, 0.15, 0], shinR: 0.5, root: { y: -0.78, pitch: -1.57, z: -0.5 } }) ] },
  // --- Items & social --------------------------------------------------------------------------
  pickup: { dur: 0.5, full: true, events: { grab: 0.45 }, keys: [
    k(0, {}),
    k(0.45, { spine: [0.55, 0, 0], chest: [0.35, 0, 0], head: [0.2, 0, 0], armR: [1.3, 0.1, 0.1], foreR: 0.2, armL: [0.4, 0.2, 0], foreL: 0.4, thighL: [0.7, 0, 0], shinL: 1.2, thighR: [0.4, 0, 0], shinR: 0.9, footL: 0.4, root: { y: -0.32 } }, 'out'),
    k(1, {}) ] },
  dropItem: { dur: 0.35, keys: [k(0, {}), k(0.5, { armR: [0.9, 0.1, 0], foreR: 0.3, chest: [0.2, 0, 0] }, 'out'), k(1, {})] },
  throwItem: { dur: 0.5, events: { release: 0.5 }, keys: [
    k(0, {}),
    k(0.38, { armR: [2.7, 0.5, -0.2], foreR: 1.6, armL: [1.0, 0.4, 0.4], foreL: 0.5, chest: [-0.15, 0.6, 0], spine: [-0.1, 0.25, 0] }),
    k(0.55, { armR: [1.3, 0.1, 0.4], foreR: 0.2, armL: [0.4, 0.4, 0], foreL: 0.6, chest: [0.3, -0.5, 0], spine: [0.15, -0.2, 0] }, 'out'),
    k(1, {}) ] },
  eat: { dur: 1.2, keys: [k(0, {}), k(0.35, { armR: [1.2, 0.1, 0.9], foreR: 2.2, handR: [0.5, 0, 0], head: [0.15, 0, 0] }), k(0.55, { armR: [1.15, 0.1, 0.95], foreR: 2.3, head: [0.05, 0, 0] }), k(1, {})] },
  drink: { dur: 1.2, keys: [k(0, {}), k(0.4, { armR: [1.5, 0.1, 0.8], foreR: 2.0, handR: [0.7, 0, 0], head: [-0.35, 0, 0] }), k(0.7, { armR: [1.5, 0.1, 0.8], foreR: 2.0, head: [-0.35, 0, 0] }), k(1, {})] },
  read: { dur: 2.5, loop: true, keys: [k(0, { armL: [0.9, 0.1, 0.3], foreL: 1.4, armR: [0.9, 0.1, 0.3], foreR: 1.4, head: [0.4, 0, 0] }), k(0.5, { armL: [0.9, 0.1, 0.3], foreL: 1.4, armR: [0.95, 0.1, 0.25], foreR: 1.35, head: [0.42, 0.06, 0] }), k(1, { armL: [0.9, 0.1, 0.3], foreL: 1.4, armR: [0.9, 0.1, 0.3], foreR: 1.4, head: [0.4, 0, 0] })] },
  talk: { dur: 1.6, loop: true, keys: [
    k(0, { armR: [0.35, 0.2, 0.3], foreR: 1.3, handR: [0.2, 0, 0] }),
    k(0.3, { armR: [0.55, 0.35, 0.2], foreR: 1.1, handR: [-0.3, 0, 0], head: [0.05, 0.1, 0] }),
    k(0.6, { armR: [0.3, 0.2, 0.35], foreR: 1.4, armL: [0.3, 0.25, 0.2], foreL: 1.0, head: [-0.03, -0.08, 0] }),
    k(1, { armR: [0.35, 0.2, 0.3], foreR: 1.3, handR: [0.2, 0, 0] }) ] },
  threaten: { dur: 1.2, keys: [k(0, {}), k(0.3, { armR: [1.2, 0.2, 0.2], foreR: 0.4, handR: [0.2, 0, 0], chest: [0.15, 0.2, 0], head: [0.1, 0, 0] }, 'out'), k(0.7, { armR: [1.15, 0.2, 0.2], foreR: 0.5, chest: [0.15, 0.2, 0] }), k(1, {})] },
  shrug: { dur: 0.9, keys: [k(0, {}), k(0.4, { armL: [0.3, 0.5, 0], foreL: 1.4, handL: [-0.6, 0, 0], armR: [0.3, 0.5, 0], foreR: 1.4, handR: [-0.6, 0, 0], head: [0, 0, 0.2] }, 'out'), k(1, {})] },
  wave: { dur: 1.2, keys: [k(0, {}), k(0.25, { armR: [0.3, 2.4, 0], foreR: 0.6 }), k(0.45, { armR: [0.3, 2.3, 0], foreR: 1.0 }), k(0.65, { armR: [0.3, 2.4, 0], foreR: 0.5 }), k(1, {})] },
  cheer: { dur: 1.0, loop: true, keys: [k(0, { armL: [2.6, 0.3, 0], foreL: 0.4, armR: [2.6, 0.3, 0], foreR: 0.4, head: [-0.2, 0, 0] }), k(0.5, { armL: [2.9, 0.4, 0], foreL: 0.2, armR: [2.5, 0.2, 0], foreR: 0.6, head: [-0.25, 0, 0], root: { y: 0.05 } }), k(1, { armL: [2.6, 0.3, 0], foreL: 0.4, armR: [2.6, 0.3, 0], foreR: 0.4, head: [-0.2, 0, 0] })] },
  laugh: { dur: 1.2, keys: [k(0, {}), k(0.2, { chest: [-0.25, 0, 0], head: [-0.3, 0, 0], armL: [0.6, 0.2, 0.6], foreL: 1.6, armR: [0.6, 0.2, 0.6], foreR: 1.6 }), k(0.5, { chest: [0.25, 0, 0], head: [0.1, 0, 0], armL: [0.6, 0.2, 0.6], foreL: 1.6, armR: [0.6, 0.2, 0.6], foreR: 1.6 }), k(0.75, { chest: [-0.15, 0, 0], head: [-0.2, 0, 0] }), k(1, {})] },
  point: { dur: 1.0, keys: [k(0, {}), k(0.3, { armR: [1.55, 0.05, 0], foreR: 0.05, handR: [0, 0, 0] }, 'out'), k(0.75, { armR: [1.55, 0.05, 0], foreR: 0.05 }), k(1, {})] },
  surrender: { dur: 1, loop: true, keys: [k(0, { armL: [0.3, 2.5, 0], foreL: 1.5, armR: [0.3, 2.5, 0], foreR: 1.5 }), k(1, { armL: [0.3, 2.5, 0], foreL: 1.5, armR: [0.3, 2.5, 0], foreR: 1.5 })] },
  cuffed: { dur: 1, loop: true, keys: [k(0, { armL: [-0.5, 0.15, -0.5], foreL: 1.2, armR: [-0.5, 0.15, -0.5], foreR: 1.2, head: [0.2, 0, 0] }), k(1, { armL: [-0.5, 0.15, -0.5], foreL: 1.2, armR: [-0.5, 0.15, -0.5], foreR: 1.2, head: [0.2, 0, 0] })] },
  dodge: { dur: 0.42, full: true, keys: [
    k(0, {}),
    k(0.3, { ...guardArms, spine: [0.1, 0, 0.2], chest: [0.15, 0, 0.3], head: [0, 0, 0.2], thighL: [0.2, 0.4, 0], shinL: 0.6, thighR: [-0.1, 0.1, 0], shinR: 0.3, root: { y: -0.16, roll: 0.25 } }, 'out'),
    k(1, { ...guardArms }) ] },
  // --- Postures held while using spots ---------------------------------------------------------
  sit: { dur: 4, loop: true, full: true, keys: [
    k(0, { thighL: [1.5, 0.08, 0], shinL: 1.5, thighR: [1.5, 0.08, 0], shinR: 1.5, armL: [0.35, 0.1, 0.2], foreL: 0.9, armR: [0.35, 0.1, 0.2], foreR: 0.9, spine: [0.05, 0, 0], root: { y: 0 } }),
    k(0.5, { thighL: [1.5, 0.1, 0], shinL: 1.5, thighR: [1.5, 0.06, 0], shinR: 1.55, armL: [0.35, 0.1, 0.2], foreL: 0.95, armR: [0.4, 0.1, 0.2], foreR: 0.9, spine: [0.07, 0.03, 0], head: [0.05, 0.1, 0], root: { y: 0 } }),
    k(1, { thighL: [1.5, 0.08, 0], shinL: 1.5, thighR: [1.5, 0.08, 0], shinR: 1.5, armL: [0.35, 0.1, 0.2], foreL: 0.9, armR: [0.35, 0.1, 0.2], foreR: 0.9, spine: [0.05, 0, 0], root: { y: 0 } }) ] },
  lie: { dur: 5, loop: true, full: true, keys: [
    k(0, { chest: [0, 0, 0], head: [0.25, 0.15, 0], armL: [0.2, 0.25, 0], foreL: 0.6, armR: [2.6, 0.3, 0], foreR: 2.2, thighL: [0.05, 0.05, 0], shinL: 0.1, thighR: [0.3, 0.1, 0], shinR: 0.6, root: { y: -0.8, pitch: -1.57, z: 0 } }),
    k(0.5, { chest: [0.03, 0, 0], head: [0.25, 0.15, 0], armL: [0.2, 0.25, 0], foreL: 0.6, armR: [2.6, 0.3, 0], foreR: 2.2, thighL: [0.05, 0.05, 0], shinL: 0.1, thighR: [0.3, 0.1, 0], shinR: 0.6, root: { y: -0.8, pitch: -1.57, z: 0 } }),
    k(1, { chest: [0, 0, 0], head: [0.25, 0.15, 0], armL: [0.2, 0.25, 0], foreL: 0.6, armR: [2.6, 0.3, 0], foreR: 2.2, thighL: [0.05, 0.05, 0], shinL: 0.1, thighR: [0.3, 0.1, 0], shinR: 0.6, root: { y: -0.8, pitch: -1.57, z: 0 } }) ] },
  benchPress: { dur: 2.0, loop: true, full: true, events: { rep: 0.5 }, keys: [
    k(0, { armL: [1.55, 0.6, 0], foreL: 1.6, armR: [1.55, 0.6, 0], foreR: 1.6, thighL: [1.4, 0.3, 0], shinL: 1.4, thighR: [1.4, 0.3, 0], shinR: 1.4, root: { y: -0.8, pitch: -1.57 } }),
    k(0.5, { armL: [1.6, 0.15, 0], foreL: 0.1, armR: [1.6, 0.15, 0], foreR: 0.1, thighL: [1.4, 0.3, 0], shinL: 1.4, thighR: [1.4, 0.3, 0], shinR: 1.4, root: { y: -0.8, pitch: -1.57 } }),
    k(1, { armL: [1.55, 0.6, 0], foreL: 1.6, armR: [1.55, 0.6, 0], foreR: 1.6, thighL: [1.4, 0.3, 0], shinL: 1.4, thighR: [1.4, 0.3, 0], shinR: 1.4, root: { y: -0.8, pitch: -1.57 } }) ] },
  squat: { dur: 2.2, loop: true, full: true, events: { rep: 0.5 }, keys: [
    k(0, { armL: [0.2, 1.4, 0], foreL: 2.3, armR: [0.2, 1.4, 0], foreR: 2.3, spine: [0.05, 0, 0] }),
    k(0.5, { armL: [0.2, 1.4, 0], foreL: 2.3, armR: [0.2, 1.4, 0], foreR: 2.3, spine: [0.45, 0, 0], head: [-0.3, 0, 0], thighL: [1.5, 0.2, 0], shinL: 1.9, thighR: [1.5, 0.2, 0], shinR: 1.9, footL: 0.35, footR: 0.35, root: { y: -0.45, z: -0.1 } }, 'inout'),
    k(1, { armL: [0.2, 1.4, 0], foreL: 2.3, armR: [0.2, 1.4, 0], foreR: 2.3, spine: [0.05, 0, 0] }) ] },
  pullup: { dur: 2.0, loop: true, full: true, events: { rep: 0.5 }, keys: [
    k(0, { armL: [3.0, 0.25, 0], foreL: 0.1, armR: [3.0, 0.25, 0], foreR: 0.1, thighL: [0.2, 0, 0], shinL: 0.8, thighR: [0.2, 0, 0], shinR: 0.8, root: { y: 0.18 } }),
    k(0.5, { armL: [2.7, 0.8, 0], foreL: 2.0, armR: [2.7, 0.8, 0], foreR: 2.0, thighL: [0.3, 0, 0], shinL: 1.0, thighR: [0.3, 0, 0], shinR: 1.0, head: [-0.2, 0, 0], root: { y: 0.55 } }, 'inout'),
    k(1, { armL: [3.0, 0.25, 0], foreL: 0.1, armR: [3.0, 0.25, 0], foreR: 0.1, thighL: [0.2, 0, 0], shinL: 0.8, thighR: [0.2, 0, 0], shinR: 0.8, root: { y: 0.18 } }) ] },
  situps: { dur: 1.8, loop: true, full: true, events: { rep: 0.5 }, keys: [
    k(0, { armL: [2.2, 0.8, 0], foreL: 2.2, armR: [2.2, 0.8, 0], foreR: 2.2, thighL: [0.9, 0.1, 0], shinL: 1.8, thighR: [0.9, 0.1, 0], shinR: 1.8, root: { y: -0.82, pitch: -1.5 } }),
    k(0.5, { armL: [2.2, 0.8, 0], foreL: 2.2, armR: [2.2, 0.8, 0], foreR: 2.2, spine: [0.7, 0, 0], chest: [0.4, 0, 0], thighL: [1.5, 0.1, 0], shinL: 1.9, thighR: [1.5, 0.1, 0], shinR: 1.9, root: { y: -0.82, pitch: -0.6 } }, 'inout'),
    k(1, { armL: [2.2, 0.8, 0], foreL: 2.2, armR: [2.2, 0.8, 0], foreR: 2.2, thighL: [0.9, 0.1, 0], shinL: 1.8, thighR: [0.9, 0.1, 0], shinR: 1.8, root: { y: -0.82, pitch: -1.5 } }) ] },
  punchBag: { dur: 1.4, loop: true, events: { rep: 0.3 }, keys: [
    k(0, { ...guardArms }), k(0.25, { armL: [1.45, 0.1, 0.12], foreL: 0.1, armR: [0.6, 0.35, 0.3], foreR: 2.1, chest: [0.15, 0.3, 0] }, 'out'),
    k(0.45, { ...guardArms }), k(0.65, { armR: [1.5, 0.05, 0.2], foreR: 0.06, armL: [0.8, 0.3, 0.4], foreL: 2.1, chest: [0.18, -0.45, 0] }, 'out'), k(1, { ...guardArms })] },
  work: { dur: 1.3, loop: true, events: { rep: 0.5 }, keys: [
    k(0, { armL: [0.9, 0.2, 0.2], foreL: 1.0, armR: [0.9, 0.2, 0.2], foreR: 1.0, spine: [0.25, 0, 0], head: [0.35, 0, 0] }),
    k(0.5, { armL: [1.2, 0.1, 0.3], foreL: 0.6, armR: [0.7, 0.3, 0.1], foreR: 1.3, spine: [0.3, 0.1, 0], head: [0.4, 0, 0] }),
    k(1, { armL: [0.9, 0.2, 0.2], foreL: 1.0, armR: [0.9, 0.2, 0.2], foreR: 1.0, spine: [0.25, 0, 0], head: [0.35, 0, 0] }) ] },
  stamp: { dur: 1.6, loop: true, events: { rep: 0.45 }, keys: [
    k(0, { armL: [1.0, 0.2, 0.2], foreL: 0.8, armR: [1.0, 0.2, 0.2], foreR: 0.8, spine: [0.2, 0, 0] }),
    k(0.4, { armL: [1.8, 0.2, 0.2], foreL: 0.6, armR: [1.8, 0.2, 0.2], foreR: 0.6, spine: [0.1, 0, 0] }),
    k(0.55, { armL: [1.1, 0.2, 0.2], foreL: 0.4, armR: [1.1, 0.2, 0.2], foreR: 0.4, spine: [0.35, 0, 0] }, 'out'),
    k(1, { armL: [1.0, 0.2, 0.2], foreL: 0.8, armR: [1.0, 0.2, 0.2], foreR: 0.8, spine: [0.2, 0, 0] }) ] },
  mop: { dur: 1.4, loop: true, events: { rep: 0.5 }, keys: [
    k(0, { armR: [0.7, 0.4, 0.4], foreR: 1.0, armL: [0.9, 0.5, -0.2], foreL: 0.8, spine: [0.25, 0.3, 0] }),
    k(0.5, { armR: [0.9, -0.1, 0.6], foreR: 0.7, armL: [1.0, 0.3, 0.2], foreL: 0.7, spine: [0.3, -0.3, 0] }),
    k(1, { armR: [0.7, 0.4, 0.4], foreR: 1.0, armL: [0.9, 0.5, -0.2], foreL: 0.8, spine: [0.25, 0.3, 0] }) ] },
  shoot: { dur: 1.4, events: { release: 0.5 }, keys: [
    k(0, { armL: [0.9, 0.2, 0.3], foreL: 1.2, armR: [0.9, 0.2, 0.3], foreR: 1.2 }),
    k(0.3, { armL: [1.8, 0.3, 0.3], foreL: 1.6, armR: [2.0, 0.1, 0.2], foreR: 1.9, thighL: [0.4, 0, 0], shinL: 0.8, thighR: [0.4, 0, 0], shinR: 0.8, root: { y: -0.12 } }),
    k(0.5, { armL: [2.6, 0.3, 0.2], foreL: 0.5, armR: [2.8, 0.05, 0.15], foreR: 0.15, handR: [0.8, 0, 0], root: { y: 0.12 } }, 'out'),
    k(1, {}) ] },
  pool: { dur: 2.4, loop: true, keys: [
    k(0, { spine: [0.75, 0, 0], chest: [0.2, 0, 0], head: [-0.4, 0, 0], armL: [1.4, 0.2, 0.2], foreL: 0.3, armR: [0.2, 0.6, 0], foreR: 1.6, thighL: [0.4, 0, 0], shinL: 0.2 }),
    k(0.5, { spine: [0.75, 0, 0], chest: [0.2, 0, 0], head: [-0.4, 0, 0], armL: [1.4, 0.2, 0.2], foreL: 0.3, armR: [0.0, 0.6, 0], foreR: 1.9, thighL: [0.4, 0, 0], shinL: 0.2 }),
    k(0.6, { spine: [0.75, 0, 0], chest: [0.2, 0, 0], head: [-0.4, 0, 0], armL: [1.4, 0.2, 0.2], foreL: 0.3, armR: [0.4, 0.6, 0], foreR: 1.2, thighL: [0.4, 0, 0], shinL: 0.2 }, 'out'),
    k(1, { spine: [0.75, 0, 0], chest: [0.2, 0, 0], head: [-0.4, 0, 0], armL: [1.4, 0.2, 0.2], foreL: 0.3, armR: [0.2, 0.6, 0], foreR: 1.6, thighL: [0.4, 0, 0], shinL: 0.2 }) ] },
  phone: { dur: 3, loop: true, keys: [k(0, { armR: [0.6, 0.6, 1.0], foreR: 2.5, handR: [0, 0, 0.3], head: [0.05, 0, 0.15] }), k(0.5, { armR: [0.6, 0.6, 1.0], foreR: 2.5, armL: [0.3, 0.2, 0.2], foreL: 1.0, head: [0.0, 0.1, 0.15] }), k(1, { armR: [0.6, 0.6, 1.0], foreR: 2.5, handR: [0, 0, 0.3], head: [0.05, 0, 0.15] })] },
  shower: { dur: 2.2, loop: true, keys: [k(0, { armL: [2.3, 0.8, 0], foreL: 2.2, armR: [2.3, 0.8, 0], foreR: 2.2, head: [-0.3, 0, 0] }), k(0.5, { armL: [2.4, 0.7, 0], foreL: 2.0, armR: [2.2, 0.9, 0], foreR: 2.3, head: [-0.35, 0.2, 0] }), k(1, { armL: [2.3, 0.8, 0], foreL: 2.2, armR: [2.3, 0.8, 0], foreR: 2.2, head: [-0.3, 0, 0] })] },
  stretch: { dur: 2.0, keys: [k(0, {}), k(0.4, { armL: [2.9, 0.3, 0], foreL: 0.2, armR: [2.9, 0.3, 0], foreR: 0.2, chest: [-0.25, 0, 0], head: [-0.2, 0, 0], root: { y: 0.03 } }, 'out'), k(0.7, { armL: [2.8, 0.3, 0], foreL: 0.3, armR: [2.8, 0.3, 0], foreR: 0.3, chest: [-0.2, 0, 0] }), k(1, {})] },
  ko: { dur: 4, loop: true, full: true, keys: [
    k(0, { chest: [0.0, 0, 0], head: [0.1, 0.6, 0], armL: [0.3, 1.5, 0], foreL: 0.2, armR: [0.9, 1.3, 0], foreR: 0.3, thighL: [0.1, 0.25, 0], shinL: 0.1, thighR: [0.4, 0.15, 0], shinR: 0.7, root: { y: -0.8, pitch: -1.57, z: -0.5 } }),
    k(1, { chest: [0.0, 0, 0], head: [0.1, 0.6, 0], armL: [0.3, 1.5, 0], foreL: 0.2, armR: [0.9, 1.3, 0], foreR: 0.3, thighL: [0.1, 0.25, 0], shinL: 0.1, thighR: [0.4, 0.15, 0], shinR: 0.7, root: { y: -0.8, pitch: -1.57, z: -0.5 } }) ] },
};

/** Compile clips into sampled form. */
export const CLIPS = {};
for (const [name, src] of Object.entries(CLIPS_SRC)) {
  const keys = src.keys.map(([t, desc, ease]) => ({ t, ease, ...compile(desc) }));
  const maskSet = new Set();
  for (const kf of keys) for (const i of kf.mask) maskSet.add(i);
  // Channels missing in some keys are filled from neighbours so interpolation is continuous.
  const mask = [...maskSet].sort((a, b) => a - b);
  for (const kf of keys) kf.has = new Set(kf.mask);
  CLIPS[name] = { name, dur: src.dur, loop: !!src.loop, full: !!src.full, events: src.events || {}, keys, mask };
}

const EASE = {
  in: (t) => t * t, out: (t) => 1 - (1 - t) * (1 - t), inout: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  smooth: (t) => t * t * (3 - 2 * t),
};

/**
 * Sample a clip at normalized time t into `out` for channels in clip.mask. Channels absent in a
 * key are taken from `base` (the pose underneath) so partial keys blend back to the base pose.
 */
export function sampleClip(clip, t, out, base) {
  const keys = clip.keys;
  if (clip.loop) t = ((t % 1) + 1) % 1; else t = Math.max(0, Math.min(1, t));
  let i = 0;
  while (i < keys.length - 2 && keys[i + 1].t <= t) i++;
  const a = keys[i], b = keys[i + 1] || a;
  const span = b.t - a.t;
  let u = span > 0 ? (t - a.t) / span : 0;
  u = (EASE[b.ease] || EASE.smooth)(Math.max(0, Math.min(1, u)));
  for (const ch of clip.mask) {
    const va = a.has.has(ch) ? a.pose[ch] : base[ch];
    const vb = b.has.has(ch) ? b.pose[ch] : base[ch];
    out[ch] = va + (vb - va) * u;
  }
}
