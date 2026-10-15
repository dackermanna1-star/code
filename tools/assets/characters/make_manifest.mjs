// Build public/assets/characters/manifest.json and public/assets/anims/manifest.json from the
// built character GLBs, the raw (pre-compression) GLBs (for exact bounds), sockets and retarget metadata.
// usage: node make_manifest.mjs <rawGlbDir> <animMeta.json> <sockets.json>
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { io, loadRig, worldMats, poseAt } from './gltf_anim_lib.mjs';
import * as THREE from 'three';

const [rawDir, metaFile, sockFile] = process.argv.slice(2);
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const CH = path.join(repo, 'public/assets/characters');
const AN = path.join(repo, 'public/assets/anims');
const RB = 'https://github.com/microsoft/Microsoft-Rocketbox';

const VARIANTS = [
  ['survivor_m_shirt', 'Adults/Male_Adult_08', 'male', 'light-blue shirt, dark jeans', 'light'],
  ['survivor_m_hoodie_blue', 'Adults/Male_Adult_17', 'male', 'blue/white track hoodie, baseball cap, jeans', 'tan'],
  ['survivor_m_denim', 'Adults/Male_Adult_12', 'male', 'denim jacket, white tee, light jeans', 'dark'],
  ['survivor_m_hoodie_grey', 'Adults/Male_Adult_18', 'male', 'grey hoodie (hood up), black trousers', 'dark'],
  ['survivor_m_hoodie_brown', 'Adults/Male_Adult_20', 'male', 'brown hoodie, jeans', 'light'],
  ['survivor_m_leather', 'Adults/Male_Adult_04', 'male', 'black leather jacket, cargo trousers, afro hair', 'medium'],
  ['survivor_m_flannel', 'Professions/Delivery_Male_01', 'male', 'red flannel shirt, beanie, beard, rolled jeans, boots', 'light'],
  ['survivor_m_workshirt', 'Professions/Wood_Male_01', 'male', 'denim work shirt, cap, jeans', 'medium'],
  ['survivor_m_vest', 'Adults/Male_Adult_05', 'male', 'older man, field vest, work trousers', 'light'],
  ['soldier_m_acu', 'Professions/Military_Male_04', 'male', 'US Army ACU camo, helmet with NVG mount, plate carrier (has US flag/unit patches)', 'dark'],
  ['survivor_f_leather', 'Adults/Female_Adult_04', 'female', 'brown leather jacket, cargo trousers, boots', 'light'],
  ['survivor_f_hoodie', 'Adults/Female_Adult_12', 'female', 'black zip hoodie, denim shorts, sneakers', 'light'],
];

async function rawBounds(file) {
  const doc = await io.read(file);
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) {
    const a = p.getAttribute('POSITION'); const mn = a.getMin([]), mx = a.getMax([]);
    for (let i = 0; i < 3; i++) { min[i] = Math.min(min[i], mn[i]); max[i] = Math.max(max[i], mx[i]); }
  }
  return { min: min.map((v) => +v.toFixed(3)), max: max.map((v) => +v.toFixed(3)) };
}
async function glbInfo(file) {
  const doc = await io.read(file);
  const r = doc.getRoot();
  let tris = 0; for (const m of r.listMeshes()) for (const p of m.listPrimitives()) tris += p.getIndices().getCount() / 3;
  const textures = r.listTextures().map((t) => { const img = t.getImage(); return `${t.getName()} (${t.getMimeType()}, ${(img.byteLength / 1024).toFixed(0)} KB)`; });
  return { tris, bytes: fs.statSync(file).size, materials: r.listMaterials().map((m) => m.getName()), textures };
}

// ---------------- skeleton ----------------
const base = await loadRig(path.join(CH, 'survivor_m_shirt.glb'));
const W = worldMats(base, poseAt(base, null, 0));
const isJoint = (n) => !['Armature', 'Body'].includes(n.name) && !n.name.startsWith('socket_');
const bones = [];
base.nodes.forEach((n, i) => {
  if (!isJoint(n)) return;
  const p = new THREE.Vector3().setFromMatrixPosition(W[i]);
  const par = n.parent >= 0 ? base.nodes[n.parent].name : null;
  bones.push({ name: n.name, parent: par === 'Armature' ? null : par, local_t: n.t.map((v) => +v.toFixed(4)), model_pos: p.toArray().map((v) => +v.toFixed(4)) });
});
const sockRaw = JSON.parse(fs.readFileSync(sockFile, 'utf8')); const sockets = Array.isArray(sockRaw) ? sockRaw : sockRaw.sockets;
const pos = (nm) => bones.find((b) => b.name === nm).model_pos;

// ---------------- variants ----------------
const variants = [];
for (const [id, src, sex, outfit, skin] of VARIANTS) {
  const f0 = path.join(CH, `${id}.glb`), f1 = path.join(CH, `${id}_lod1.glb`);
  if (!fs.existsSync(f0)) { console.warn('missing', f0); continue; }
  const i0 = await glbInfo(f0), i1 = await glbInfo(f1);
  const b = await rawBounds(path.join(rawDir, `${id}.glb`));
  variants.push({
    id, file: `${id}.glb`, lod1: `${id}_lod1.glb`, sex, outfit, skin_tone: skin,
    skeleton: sex === 'female' ? 'proportion-adjusted (same joint names/hierarchy, identity rest rotations, SAME Hips height 0.895 m; shorter spine/arms) - all clips play unchanged' : 'identical (shared male skeleton)',
    tris: i0.tris, lod1_tris: i1.tris, bytes: i0.bytes, lod1_bytes: i1.bytes,
    bounds_m: b, height_m: +(b.max[1] - b.min[1]).toFixed(3),
    materials: i0.materials, textures_lod0: i0.textures,
    source: `Microsoft Rocketbox avatar ${src.split('/')[1]} (${RB}/tree/master/Assets/Avatars/${src})`,
    author: 'Microsoft Rocketbox (Rocketbox Studios / Microsoft)', license: 'MIT',
    processing: sex === 'female' ? 'uniformly scaled x0.9696 so the hips height matches the male skeleton; LOD0 = subdivided once (hands/hair kept linear), LOD1 = original mesh'
      : (i0.tris > 20000 ? 'LOD0 = original mesh subdivided once (Catmull-Clark; hands & hair cards linear), LOD1 = original Rocketbox mesh' : 'LOD0 = original Rocketbox mesh, LOD1 = decimated 55%'),
  });
}

// ---------------- anims ----------------
const meta = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
const clips = {};
const animFiles = {};
for (const [name, m] of Object.entries(meta)) {
  const c = { file: m.file, duration: m.duration, loop: m.loop, mode: m.mode };
  if (m.speed_mps != null) c.speed_mps = m.speed_mps;
  if (m.move_dir) c.move_dir = m.move_dir; // [right, forward]
  if (m.speed_source) c.speed_source = m.speed_source;
  if (m.root_displacement) c.root_displacement = m.root_displacement; // {right, up, forward} metres, hips start -> end
  if (m.yaw_change_deg != null) c.yaw_change_deg = m.yaw_change_deg; // body turn over the clip, + = to the left
  if (m.facing_deg) c.facing_deg = m.facing_deg; // average pelvis / shoulder heading, 0 = +Z, + = toward +X (left)
  if (m.climb_speed_mps != null) c.climb_speed_mps = m.climb_speed_mps;
  if (m.hips_y_mean != null) c.hips_y_mean = m.hips_y_mean;
  if (m.head_y_mean != null) c.head_y_mean = m.head_y_mean;
  if (m.aim_fix_deg) c.aim_corrected = true; // weapon socket barrel exactly along the clip's aim direction
  if (m.grip_fix_deg != null) c.grip_fixed = true; // right-hand grip adjusted so the shared weapon socket meets the support hand
  if (m.notes) c.notes = m.notes;
  c.source = m.source; c.license = m.license; c.source_clip = m.src_clip;
  clips[name] = c;
  animFiles[m.file] = (animFiles[m.file] || 0) + 1;
}
const files = Object.entries(animFiles).map(([f, n]) => ({ file: f, clips: n, bytes: fs.statSync(path.join(AN, f)).size }));

const CANON = ['idle', 'walk_f', 'walk_b', 'walk_l', 'walk_r', 'jog_f', 'jog_b', 'jog_l', 'jog_r', 'sprint_f', 'crouch_idle', 'crouch_walk_f', 'crouch_walk_b', 'crouch_walk_l', 'crouch_walk_r', 'prone_idle', 'prone_crawl_f', 'prone_crawl_b', 'jump_start', 'fall_loop', 'land', 'swim_idle', 'swim_f', 'freefall', 'parachute_idle', 'drive_sit', 'passenger_sit', 'death_f', 'death_b', 'knocked_idle', 'knocked_crawl', 'rifle_idle', 'rifle_aim', 'rifle_walk_f', 'rifle_walk_b', 'rifle_walk_l', 'rifle_walk_r', 'rifle_jog_f', 'rifle_jog_b', 'rifle_jog_l', 'rifle_jog_r', 'rifle_sprint', 'rifle_crouch_idle', 'rifle_crouch_walk_f', 'rifle_crouch_walk_b', 'rifle_crouch_walk_l', 'rifle_crouch_walk_r', 'rifle_reload', 'rifle_fire', 'pistol_idle', 'pistol_aim', 'pistol_reload', 'throw_grenade', 'melee_swing', 'use_item', 'drink', 'pickup', 'interact_door', 'vault', 'climb', 'hit_react_f', 'hit_react_b', 'hit_react_l', 'hit_react_r', 'revive_teammate'];
const missingCanon = CANON.filter((n) => !clips[n]);

const conventions = {
  units: 'meters', up: '+Y', forward: '+Z (character faces +Z; its LEFT is +X, its RIGHT is -X)',
  rest_pose: 'A-pose (arms ~45 deg below horizontal), standing, feet on y=0',
  joint_rest_rotation: 'IDENTITY for every joint (and unit scale): joint local axes == character axes in bind pose. Animation tracks are therefore plain character-space rotations; procedural offsets (aim pitch, lean, look-at) can be applied as rotations about +X (pitch, positive = nose down), +Y (yaw, positive = turn left), +Z (roll).',
  animation_tracks: 'quaternion rotation tracks for joints + ONE position track on Hips (absolute, meters, in Armature space). No scale tracks. 30 fps, linear.',
  binding: 'clips bind by node name: new AnimationMixer(characterScene).clipAction(clip) works for every variant (anims GLBs contain only the skeleton nodes).',
};

const charManifest = {
  category: 'characters',
  version: 1,
  generated_by: 'tools/assets/characters (build_all_characters.sh, retarget.mjs, make_manifest.mjs)',
  conventions,
  skeleton: {
    id: 'pubg_m55',
    naming: 'Mixamo-style, no prefix (Hips, Spine, Spine1, Spine2, Neck, Head, LeftShoulder, LeftArm, LeftForeArm, LeftHand, LeftHand{Thumb,Index,Middle,Ring,Pinky}{1..3}, LeftUpLeg, LeftLeg, LeftFoot, LeftToeBase, LeftToe_End, HeadTop_End, Right*)',
    joint_count: bones.length,
    root_joint: 'Hips (child of the scene node "Armature")',
    rest_pose_type: 'A-pose, identity joint rotations',
    height_m: +(Math.max(...variants.filter((v) => v.sex === 'male').map((v) => v.height_m))).toFixed(3),
    nominal_body_height_m: 1.80,
    hips_height_m: pos('Hips')[1],
    eye_height_m: +(pos('Head')[1] + 0.10).toFixed(3),
    head_top_m: pos('HeadTop_End')[1],
    key_bones: {
      hips: 'Hips', spine: ['Spine', 'Spine1', 'Spine2'], neck: 'Neck', head: 'Head', head_top: 'HeadTop_End',
      left: { shoulder: 'LeftShoulder', arm: 'LeftArm', forearm: 'LeftForeArm', hand: 'LeftHand', upLeg: 'LeftUpLeg', leg: 'LeftLeg', foot: 'LeftFoot', toe: 'LeftToeBase', toe_end: 'LeftToe_End' },
      right: { shoulder: 'RightShoulder', arm: 'RightArm', forearm: 'RightForeArm', hand: 'RightHand', upLeg: 'RightUpLeg', leg: 'RightLeg', foot: 'RightFoot', toe: 'RightToeBase', toe_end: 'RightToe_End' },
      fingers: 'LeftHand{Thumb|Index|Middle|Ring|Pinky}{1,2,3} / RightHand...',
    },
    bones,
    sockets: sockets.map((s) => ({ ...s, description: {
      socket_weapon_r: 'Child node of RightHand. Attach LONG GUNS here unchanged (weapon convention: origin = firing-hand grip, barrel +Z, up +Y). Derived from the rifle_aim pose (barrel = right grip -> left grip, no cant). In rifle_aim, rifle_crouch_aim, rifle_fire, rifle_crouch_fire, rifle_aim_walk_f, rifle_fire_walk_f the barrel points exactly along character +Z and level; rifle_aim_up / rifle_aim_down are exactly +55 / -55 deg; rifle_prone_* point straight ahead with ~9 deg muzzle-up.',
      socket_pistol_r: 'Child node of RightHand for PISTOLS (same weapon convention). Derived from the pistol_aim pose (barrel level, along the eye->sights heading). pistol_aim / pistol_fire / pistol_crouch_aim / pistol_crouch_walk_f aim exactly along +Z; pistol_aim_up / _down are +55 / -55 deg.',
      socket_weapon_l: 'Child node of LeftHand, mirror of socket_weapon_r (for left-hand items: grenade before throw, melee weapons held left).',
      socket_support_l: 'Child node of LeftHand at the left palm centre (identity orientation). Use as the IK end-effector: drive the left arm so this point reaches the weapon\'s grip_support node. In the shipped rifle clips the support hand sits 0.30-0.38 m along the barrel from the right grip and within ~2 cm of the barrel axis (reload/equip/sprint clips excepted).',
    }[s.name] })),
  },
  variants,
  lod: 'Each variant has <id>.glb (LOD0) and <id>_lod1.glb (LOD1, same skeleton, same UV layout, 512 px textures). LOD1 can also re-use the LOD0 materials to share GPU textures.',
  materials: 'body / head (opaque, PBR: baseColor + tangent-space normal (OpenGL) + ORM [R=1, G=roughness, B=metal=0]) and optional hair/helmet/equipment; "hair" is alpha-tested (alphaMode MASK, cutoff 0.45, double-sided, WebP RGBA). EXT_texture_webp + EXT_meshopt_compression + KHR_mesh_quantization are used (GLTFLoader needs setMeshoptDecoder).',
  anims: {
    note: 'Clip table for /assets/anims/*.glb (same content as /assets/anims/manifest.json). move_dir = [right, forward] in character space. speed_mps = ground speed of the ORIGINAL root motion (in-place clips): playback timeScale = actual_speed / speed_mps keeps feet planted.',
    files: files.map((f) => ({ ...f, file: `/assets/anims/${f.file}` })),
    clips: Object.fromEntries(Object.entries(clips).map(([k, c]) => [k, { ...c, file: `/assets/anims/${c.file}` }])),
    canonical_missing: missingCanon,
  },
};
const SOURCES = [
  { id: 'mixamo', name: 'Adobe Mixamo animations (Pro Rifle Pack, Basic Shooter Pack, pistol / locomotion / prone / vault / climb / car / hit / death clips)', url: 'https://www.mixamo.com', obtained_from: 'FBX files committed to public GitHub game projects: theKooker/FPS-Multiplayer, alexlp04/RobotSurvival, Gus2169/Duel-Arena, shtolyan/HexLive, DiogoAlmeida777/Loose-Limbs, Krushna0304/StrikeFront, chetan-code/RigidbodyRaycastBased-CharacterController3D-Unity, annaborja/FantasyMelee, S-N-D-R/UnityMixamoLibrary, kirbycope/godot-3d-player-controller-addon', license: 'Mixamo terms (Adobe General Terms): royalty-free use in games/projects; animations may not be redistributed as standalone assets. Re-download from mixamo.com with a (free) Adobe account before a public release to have first-party provenance.' },
  { id: 'rpm', name: 'Ready Player Me Animation Library (masculine)', url: 'https://github.com/readyplayerme/animation-library', license: 'Ready Player Me animation library license: free, intended for use with Ready Player Me avatars; check terms before a public release (used for idle, walk_f/b, jog_f/b, sprint_f, crouch_walk_f/b).' },
  { id: 'ual', name: 'Quaternius Universal Animation Library 1 & 2', url: 'https://quaternius.itch.io/universal-animation-library', license: 'CC0 1.0' },
  { id: 'rocketbox', name: 'Microsoft Rocketbox animation library', url: 'https://github.com/microsoft/Microsoft-Rocketbox', license: 'MIT' },
  { id: 'authored', name: 'Procedural poses / recoil authored in tools/assets/characters/retarget.mjs', license: 'project-authored' },
];
charManifest.anims.sources = SOURCES;
const animManifest = {
  category: 'anims',
  version: 1,
  skeleton: 'pubg_m55 (see /assets/characters/manifest.json)',
  conventions,
  files,
  sources: SOURCES,
  clips,
  canonical_missing: missingCanon,
};
fs.writeFileSync(path.join(CH, 'manifest.json'), JSON.stringify(charManifest, null, 1));
fs.writeFileSync(path.join(AN, 'manifest.json'), JSON.stringify(animManifest, null, 1));
console.log('variants', variants.length, 'clips', Object.keys(clips).length, 'missing canonical', missingCanon);
