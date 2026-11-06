// Viewmodel model registry.
//
// meta schema (all optional unless noted):
//   kind      'gun' | 'melee' | 'fists' | 'tool' | 'throw' | 'generic'
//   hold      gun pose family: 'pistol' | 'rifle' | 'shotgun' | 'bow'
//   weight    0..1 (sway inertia, ADS speed, swing heft)
//   scale     model scale multiplier
//   hip/sprint/ads {pos:[x,y,z] metres in camera space, rot:[pitch, yaw, roll] (euler YXZ)}
//             ads is derived from the 'sight' point + adsDist when not given
//   adsDist   metres between the eye and the sight point when aiming
//   scope     true => model fades out when fully aimed (UI draws the scope overlay)
//   hands     {R: point name, L: point name | null}   (null L => free left hand pose)
//   freeL     {pos} free left hand pose (camera space) for one-handed items
//   channels  {name: [{part, t:[x,y,z] cm, r:[x,y,z] rad}]}  animated part channels (value 0..1 scales t/r)
//   mag       {part, axis:[x,y,z], grab}   detachable magazine
//   recoil    {pitch, back, yaw, roll, up}
//   flash     muzzle flash size (0 = none);  shell: ejected casing kind
//   reload    {style, charge}
import * as guns from './guns.js';
import * as melee from './melee.js';
import * as misc from './misc.js';
import * as THREE from 'three';

export const MODEL_BUILDERS = {
  pistol: guns.pistol,
  pistol_1911: guns.pistol1911,
  revolver: guns.revolver,
  shotgun_pump: guns.shotgunPump,
  shotgun_double: guns.shotgunDouble,
  shotgun_sawed: guns.shotgunSawed,
  rifle_hunting: guns.rifleHunting,
  rifle_ar: guns.rifleAR,
  rifle_ak: guns.rifleAK,
  rifle_22: guns.rifle22,
  smg: guns.smg,
  crossbow: guns.crossbow,
  bow: guns.bow,
  knife: melee.knife,
  knife_hunting: melee.knifeHunting,
  bat: () => melee.bat(false),
  bat_nail: () => melee.bat(true),
  crowbar: melee.crowbar,
  hammer: melee.hammer,
  axe_fire: melee.axeFire,
  hatchet: melee.hatchet,
  machete: melee.machete,
  golf_club: melee.golfClub,
  pan: melee.pan,
  pipe: melee.pipe,
  sledgehammer: melee.sledgehammer,
  shovel: melee.shovel,
  katana: melee.katana,
  spear: melee.spear,
  baton: melee.baton,
  wrench: melee.wrench,
  pitchfork: melee.pitchfork,
  club: melee.club,
  screwdriver: melee.screwdriver,
  fists: misc.fists,
  flashlight: misc.flashlight,
  molotov: misc.molotov,
  pipe_bomb: misc.pipeBomb,
  grenade: misc.grenade,
  flare: misc.flare,
  bottle: misc.bottle,
};

export const MODEL_IDS = [...Object.keys(MODEL_BUILDERS), 'generic'];

const _v = new THREE.Vector3();

/** Build a model. id: model id ('generic' needs iconCanvas). Returns {id, group, parts, points, meta}. */
export function buildViewModel(id, material, iconCanvas = null) {
  const fn = MODEL_BUILDERS[id];
  const { b, meta } = fn ? fn() : misc.generic(iconCanvas);
  const scale = meta.scale ?? 1;
  const built = b.build(material, scale);
  const m = { ...meta };
  m.id = fn ? id : 'generic';
  m.channels = m.channels || {};
  m.hands = m.hands || { R: 'handR', L: null };
  m.recoil = m.recoil || { pitch: 0.05, back: 0.02, yaw: 0.01, roll: 0.02, up: 0.004 };
  if (!m.sprint) m.sprint = { pos: m.hip.pos, rot: m.hip.rot };
  // ADS pose from the sight point: put the sight on the camera axis, adsDist in front of the eye
  if (!m.ads) {
    const sight = built.points.sight;
    if (sight && m.kind === 'gun') {
      built.group.updateMatrixWorld(true);
      sight.getWorldPosition(_v);
      m.ads = { pos: [-_v.x, -_v.y, -(m.adsDist ?? 0.2) - _v.z], rot: [0, 0, 0] };
    } else {
      // non guns: bring the item a little toward the centre
      const h = m.hip;
      m.ads = { pos: [h.pos[0] * 0.7, h.pos[1] * 0.9, h.pos[2] * 1.05], rot: h.rot.slice() };
    }
  }
  return { id: m.id, ...built, meta: m };
}
