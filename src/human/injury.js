import { Vec3, clamp, smoothstep, makeRng } from '../physics/math.js';
import { buildAnatomy, pathToStructure, boneAxis, issRegion, ribsNear, ellipsoidDistance, segSegDistance } from './organs.js';

/**
 * Injury and physiology model for one person.
 *
 * Penetrating trauma: a projectile's wound channel through each segment is tested against the
 * internal anatomy (organs, vessels, nerves, spinal cord, bones). Damage depends on the energy
 * deposited along the channel, with a temporary-cavity radius for high-velocity rounds. Every hit
 * structure has a specific consequence: haemorrhage (external or into a body cavity), loss of
 * cardiac pump function, pneumothorax / haemothorax, airway compromise and blood aspiration,
 * paralysis by spinal level or nerve, fractures (long bones physically break). Repeated hits on a
 * structure that is already destroyed add little: damage per structure saturates.
 *
 * Blunt trauma: impacts measured by the physics (thrown objects, falls, the floor) are converted
 * into peak forces from the contact impulse and a contact time that depends on both materials, then
 * compared against tissue tolerances (bruising, fractures, concussion, organ rupture).
 *
 * Melee trauma (meleeHit; game/melee.js resolves the collision): the peak force of a blow follows
 * from the closing speed, the masses that collide and the stiffness of the tissue and the striker in
 * series; it breaks individual ribs (displaced ends tear the lung, ribs broken in two places make a
 * flail chest), the skull by region (a depressed fracture contuses the brain, a haematoma under it
 * kills over minutes), the face (bleeding into the airway), long bones (which break physically). The
 * head's rotation knocks out. Knives cut along the line where the moving blade crosses the skin, as
 * deep as it went in (vessels, nerves, trachea under it), or drive a stab channel into the anatomy.
 *
 * Physiology runs continuously and is built from first principles rather than timers:
 * - circulation (Guyton): only the "stressed" part of the blood volume generates the filling
 *   pressure that returns blood to the heart. The baroreflex recruits unstressed volume and
 *   constricts arterioles, so ~30 % of the volume can be lost with a near-normal pressure; beyond
 *   ~40-45 % venous return and arterial pressure collapse (class IV haemorrhage).
 * - bleeding: every arterial leak is in parallel with the systemic circulation, so arterial
 *   bleeding takes a share of the cardiac output and can never exceed it, and a hole in the aorta
 *   collapses the arterial pressure at once. The leaks of a limb are fed through its main artery
 *   (in series with it, viscous flow): a limb loses at most what a transection at its root would
 *   drain, and less as the pressure falls. Venous and pulmonary leaks drain the venous return
 *   before it reaches the heart; they are bounded by what the stressed volume can return, not by
 *   the cardiac output, so total bleeding can exceed the cardiac output while the heart runs empty.
 * - the shock spiral: low coronary perfusion and hypoxaemia build a myocardial oxygen debt that
 *   weakens the heart, which lowers the pressure further; clotting fails in shock and after severe
 *   tissue injury (acute traumatic coagulopathy). Without effective circulation (no pulse) the heart
 *   has arrested; clinical death follows a short agonal phase.
 * - respiration: pneumothorax (open or tension), haemothorax, airway injury, aspirated blood and
 *   spinal respiratory paralysis reduce gas exchange; oxygen stores make apnoea a matter of
 *   minutes, the haemoglobin dissociation curve turns falling PaO2 into falling SpO2.
 * - brain: cerebral perfusion (autoregulated above ~55 mmHg) x arterial oxygen content decides
 *   consciousness and, if prolonged, hypoxic brain damage.
 * Its outputs drive the motor controller (muscle strength per limb, balance skill, pain behaviours,
 * consciousness, breathing depth and rate). Agonal gasps are published as ctl.respiration, 'gasp'
 * events and the respiratory rate, but the controller only animates breathing in its balance and
 * ground modes, so the gasps of an unconscious body (its limp mode) are not visible yet.
 */

export const BLOOD_VOLUME = 5000; // mL
const CO0 = BLOOD_VOLUME / 60; // resting cardiac output, mL/s
const MAP0 = 93; // normal mean arterial pressure, mmHg
const SQ_MAP0 = Math.sqrt(MAP0);
const PV0 = 7; // normal mean systemic filling pressure, mmHg
const V_UNSTRESSED = 3500; // blood that fills the veins without generating pressure, mL
const V_STRESSED = BLOOD_VOLUME - V_UNSTRESSED;
const G_SVR = CO0 / MAP0; // systemic conductance, mL/s per mmHg
const AGONAL_TIME = 10; // s from circulatory arrest to clinical death (agonal gasps in between)

const SEGMENT_LABEL = {
  head: 'head', neck: 'neck', chest: 'chest', abdomen: 'abdomen', pelvis: 'pelvis',
  upperArmL: 'left upper arm', upperArmR: 'right upper arm', forearmL: 'left forearm', forearmR: 'right forearm',
  handL: 'left hand', handR: 'right hand', thighL: 'left thigh', thighR: 'right thigh',
  shinL: 'left lower leg', shinR: 'right lower leg', footL: 'left foot', footR: 'right foot',
};

// Peak-force tolerances (N) for blunt impacts, and soft-tissue contact time (s) per segment.
// Fracture values are for young adults (dynamic loading; e.g. distal radius ~3-5 kN, so the 1-2.5 kN
// of a fall on the outstretched hand from standing height rarely breaks it, a fall from a few metres
// often does); the palm, forearm and heel are cushioned by fat pads and muscle, so their contact
// pulses last several milliseconds.
const BLUNT = {
  head: { tau: 0.0005, bruise: 1200, fracture: 9000, label: 'skull' },
  neck: { tau: 0.003, bruise: 900, fracture: 5000, label: 'cervical vertebrae' },
  chest: { tau: 0.004, bruise: 1500, fracture: 3600, label: 'ribs' },
  abdomen: { tau: 0.008, bruise: 1400, fracture: Infinity, organ: 4200 },
  pelvis: { tau: 0.006, bruise: 1800, fracture: 7500, label: 'pelvis' },
  upperArm: { tau: 0.003, bruise: 1100, fracture: 3600, label: 'humerus' },
  forearm: { tau: 0.0025, bruise: 900, fracture: 3600, label: 'radius/ulna' },
  hand: { tau: 0.004, bruise: 800, fracture: 3000, label: 'hand bones' },
  thigh: { tau: 0.006, bruise: 1600, fracture: 5200, label: 'femur' },
  shin: { tau: 0.0012, bruise: 1100, fracture: 4200, label: 'tibia' },
  // heel / sole fat pad; plantar loads of 1-3 body weights (steps, landings) are not trauma
  foot: { tau: 0.0028, bruise: 2500, fracture: 4500, label: 'foot bones' },
};

// Contact time of the other body's material (s). Small, hard objects give short, violent impacts.
const MATERIAL_TAU = {
  concrete: 0.0012, baseball: 0.0008, brick: 0.0012, bowling: 0.0015, metal: 0.001, glass: 0.0009,
  wood: 0.003, rubber: 0.008, melon: 0.012, leather: 0.006, flesh: 0.01, default: 0.002,
};

// Fraction of a floor impact's impulse that loads the struck part locally (contact area effect).
// A forearm or palm landing flat on the floor is loaded along its whole length / pad.
const GROUND_SPREAD = {
  head: 0.6, neck: 0.5, chest: 0.18, abdomen: 0.22, pelvis: 0.3, upperArm: 0.35, forearm: 0.4, hand: 0.45,
  thigh: 0.3, shin: 0.45, foot: 0.5,
};

const PAIN_BY_SEGMENT = {
  head: 0.9, neck: 0.8, chest: 0.65, abdomen: 0.8, pelvis: 0.7, upperArm: 0.5, forearm: 0.5, hand: 0.7,
  thigh: 0.55, shin: 0.6, foot: 0.7,
};

// Wound-channel soft tissue (muscle, skin, small vessels): share that bleeds out of the skin and
// where the rest collects.
const TISSUE_EXT = { head: 0.95, neck: 0.75, chest: 0.5, abdomen: 0.4, pelvis: 0.5, hand: 0.95, foot: 0.95 };
const TISSUE_CAV = { neck: 'neck', chest: 'pleura', abdomen: 'peritoneum', pelvis: 'retro' };

// Haemorrhage from a fracture (marrow, periosteum, torn muscle): a closed femoral shaft fracture
// loses ~1-1.5 L into the thigh, a pelvic fracture several litres (ATLS). It is a property of the
// broken bone, not of the hit: further hits on a bone that is already broken add nothing (see
// boneBleed()).
export const FRACTURE_BLEED = {
  femur: 2.5, tibia: 1.0, humerus: 0.9, 'radius/ulna': 0.5, pelvis: 3.5, 'pelvis (ilium)': 3.5, sacrum: 2,
  'thoracic vertebrae': 0.8, 'lumbar vertebrae': 1, 'cervical vertebrae': 0.5, ribs: 0.6,
};
// Peripheral arterial trees, one per limb. Every leak in a limb (a cut artery, the vessels of a
// torn muscle or a broken bone) is fed through the limb's main artery, so the leaks are in series
// with it and share its resistance: their sum can never exceed what a transection at the root of
// the limb would drain (`gc`, mL/s at normal pressure: common femoral / axillary level). Flow along
// these long, narrow arteries is viscous (Poiseuille, proportional to the pressure), unlike the
// orifice flow out of a hole in the aorta or a ventricle (~sqrt(P)), so limb haemorrhage slows
// down as the pressure falls. A transected feeding artery (iliac, subclavian) leaves the limb only
// its collateral supply. Likewise the venous leaks of a limb share its venous outflow (`gcv`: the
// limb's venous return, a few mL/s at rest, plus some back-flow through the femoral / axillary vein).
export const LIMB_TREE = {
  leg: { gc: 40, gcv: 15, feeder: 'iliac artery' },
  arm: { gc: 22, gcv: 7, feeder: 'subclavian artery' },
};

function limbTree(segName) {
  const k = segName.replace(/[LR]$/, ''), s = segName[segName.length - 1];
  if (k === 'thigh' || k === 'shin' || k === 'foot') return 'leg' + s;
  if (k === 'upperArm' || k === 'forearm' || k === 'hand') return 'arm' + s;
  return null;
}

// AIS of a fracture (closed; open adds one, capped)
const FRACTURE_AIS = { femur: 3, pelvis: 3, 'pelvis (ilium)': 3, sacrum: 3, skull: 2, ribs: 2 };

const _v0 = new Vec3();
const _v1 = new Vec3();
const _v2 = new Vec3();

function segKind(name) {
  return name.replace(/[LR]$/, '');
}

function sideOf(name) {
  const c = name[name.length - 1];
  return c === 'L' || c === 'R' ? c : null;
}

/** Haemoglobin O2 saturation from PaO2 (Severinghaus 1979). */
export function o2Saturation(pao2) {
  const p = Math.max(pao2, 0.1);
  return 1 / (23400 / (p * p * p + 150 * p) + 1);
}

// Heart output as a soft minimum of what returns to it (inflow) and what it can pump (pump);
// both relative to normal. combine(1, 1) = 1, and it goes to zero with either argument.
function heartOutput(inflow, pump) {
  if (inflow <= 1e-6 || pump <= 1e-6) return 0;
  return 1 / Math.max(1 / inflow + 1 / (2 * pump) - 0.5, 0.05);
}

/** Clotting behaviour by bleeding source: [maximum clot fraction, time constant s]. */
function clotClass(kind, q) {
  switch (kind) {
    case 'heart':
      return [0.05, 900];
    case 'artery':
      // large arteries do not seal while pressurised; small ones spasm and clot
      return q > 15 ? [0.15, 500] : q > 6 ? [0.5, 240] : [0.8, 120];
    case 'vein':
      return q > 15 ? [0.35, 240] : [0.75, 150];
    case 'organ':
      // liver / spleen / kidney: non-compressible. A handgun channel through the parenchyma is
      // contained by the capsule and surrounding tissue and often stops bleeding on its own (most
      // grade II-III injuries are managed without surgery); a burst organ (rifle cavitation,
      // grade IV-V) keeps bleeding
      return q > 14 ? [0.25, 300] : q > 7 ? [0.65, 300] : [0.8, 240];
    case 'lung':
      return [0.75, 120]; // low pressure: most lung wounds stop bleeding on their own
    case 'bone':
      return [0.85, 300];
    case 'scalp':
      return [0.85, 150]; // scalp vessels are held open by the galea
    default:
      return [0.92, 70]; // muscle, skin, small vessels
  }
}

let woundIds = 1;

// Undead damage: location multiplier and bonus for vital structures hit (see bulletThrough)
const UNDEAD_LOC = { head: 2, neck: 1.5, chest: 1, abdomen: 0.9, pelvis: 0.9, upperArm: 0.45, forearm: 0.4, hand: 0.25, thigh: 0.6, shin: 0.5, foot: 0.3 };
const UNDEAD_VITAL = { heart: 30, artery: 12, vein: 4, cord: 25, lung: 6, organ: 6, bone: 5 };
const UNDEAD_VITAL_MAX = 45;

// ------------------------------------------------------------------------------------------------
// Melee trauma (game/melee.js resolves the collision; InjurySystem.meleeHit takes it from there)

// Local contact stiffness of the struck tissue (N/m) under a fist- or bat-sized striker. In series
// with the striker's own stiffness it sets the peak force of a blow, F = v * sqrt(k * m) (m: reduced
// mass of what collides), and its duration pi * sqrt(m / k): the scalp over the skull and the shin
// and ulna under thin skin are stiff, the belly and the thigh soft, the nose's cartilage gives.
const MELEE_K = {
  head: 0.8e6, face: 0.45e6, nose: 0.15e6, neck: 0.06e6, chest: 0.15e6, abdomen: 0.05e6, pelvis: 0.4e6,
  upperArm: 0.12e6, forearm: 0.35e6, hand: 0.4e6, thigh: 0.08e6, shin: 0.5e6, foot: 0.4e6,
};

// Peak-force fracture tolerances (N) under a localised blow (~20 cm² contact; a smaller contact
// concentrates the stress, see boneTolerance): skull vault by region (the temporal squama is the
// thinnest, the occiput the thickest), facial skeleton, larynx, sternum, clavicle, and long-bone
// shafts struck across (a "nightstick" fracture of a parrying ulna, a bumper fracture of the tibia).
const BONE_TOL = {
  temple: 5000, forehead: 6000, parietal: 5500, vertex: 6000, occiput: 7000,
  nose: 2600, cheek: 2800, maxilla: 4200, jaw: 3800, chin: 4400,
  larynx: 1800, 'cervical vertebrae': 6000, sternum: 5500, clavicle: 2400, scapula: 5200, pelvis: 6500,
  humerus: 4200, 'radius/ulna': 2900, 'hand bones': 2200, femur: 7500, tibia: 4200, 'foot bones': 3200,
};
const SKULL_REGIONS = new Set(['temple', 'forehead', 'parietal', 'vertex', 'occiput']);
const FACE_BONE = { nose: 'nasal bones', cheek: 'zygoma', maxilla: 'maxilla', jaw: 'mandible', chin: 'mandible' };
const FACE_AIS = { nose: 1, cheek: 2, maxilla: 2, jaw: 2, chin: 2 };
const HEAD_REGION_LABEL = { temple: 'temporal', forehead: 'frontal', parietal: 'parietal', vertex: 'parietal (vertex)', occiput: 'occipital' };
const HEAD_CENTRE = new Vec3(0, 1.69, -0.005); // bind

// Load (N) one rib takes before it breaks: the short, thick upper ribs and the springy floating ribs
// are hard to break, 4-9 at the side of the chest break most easily; the back of the cage is covered
// by thick muscle and the scapula, the front ends by the cartilage.
const RIB_TOL = [0, 2600, 2200, 1600, 1250, 1250, 1250, 1250, 1250, 1250, 1400, 1700, 1900];
const RIB_SHARE = 0.75; // of a blow on the chest wall carried by the ribs under it
// force (N) of a blow that gives a full-strength hit reaction
const REACT_F = { head: 3500, neck: 2500, chest: 6000, abdomen: 3500, pelvis: 6000, upperArm: 4000, forearm: 3500, hand: 2500, thigh: 5000, shin: 4000, foot: 4000 };
// the neck and its muscles take part of a blow to the head (more of a twist than of a push)
const HEAD_LIN_COUPLING = 1.3, HEAD_ROT_COUPLING = 1.7;
// Knockout: the brain is strained above all by rotation of the head, least tolerated about the
// vertical axis (a hook to the jaw twists it), better when it nods or tilts (BrIC critical
// velocities scale ~43 : 56 : 66 rad/s). These head angular velocities (rad/s) and the linear
// acceleration (g) each knock out about half of those struck, scaled by where the blow lands: the
// jaw is a lever that turns the head, the frontal bone is thick and the neck braces against it.
const KO_AXIAL = 36, KO_SAGITTAL = 48, KO_CORONAL = 56, KO_G = 180;
const KO_REGION = { chin: 1, jaw: 1, maxilla: 0.95, nose: 0.9, cheek: 1, temple: 1.3, forehead: 0.75, parietal: 0.95, vertex: 0.85, occiput: 1 };
// knife: energy to get the point through the skin (J, for a sharp blade), drag of the blade through
// soft tissue (N), and the energy to get through bone where a thrust meets it (J)
const STAB_SKIN = 2.5, STAB_DRAG = 140;
const STAB_BONE = {
  skull: 120, temple: 35, orbit: 20, mandible: 60, 'cervical vertebrae': 160, 'thoracic vertebrae': 160, 'lumbar vertebrae': 160,
  clavicle: 70, scapula: 50, pelvis: 100, sacrum: 120, rib: 25, sternum: 60, 'hand bones': 40, 'foot bones': 50,
  femur: 400, humerus: 300, tibia: 300, 'radius/ulna': 150,
};

const logistic = (x) => 1 / (1 + Math.exp(-x));

/** Fracture tolerance `tol` (N, ~20 cm² contact) for a contact of `area` m². */
function boneTolerance(tol, area) {
  return tol * Math.pow(clamp((area || 0.002) / 0.002, 0.25, 4), 0.3);
}

/** Region of the head a blow lands on (bind point on the head; the face looks along +z). */
function headRegion(p) {
  const ax = Math.abs(p.x), y = p.y, z = p.z;
  if (y < 1.622 && z > -0.035) return ax < 0.028 && z > 0.045 ? (y > 1.592 ? 'maxilla' : 'chin') : 'jaw';
  if (z > 0.082 && ax < 0.024 && y > 1.625 && y < 1.69) return 'nose';
  if (z > 0.035 && y < 1.69) return ax > 0.03 ? 'cheek' : 'maxilla';
  if (ax > 0.05 && y > 1.655 && y < 1.75 && z > -0.04 && z < 0.065) return 'temple';
  if (z > 0.04) return 'forehead';
  if (z < -0.055) return 'occiput';
  if (y > 1.765) return 'vertex';
  return 'parietal';
}

/** Signed distance from a bind point to an anatomy structure's surface. */
function structDistance(p, s) {
  if (s.type === 'tube') return segSegDistance(p, p, s.a, s.b).dist - s.r;
  return ellipsoidDistance(p, s.c, s.r);
}

export class InjurySystem {
  constructor(ragdoll, controller, opts = {}) {
    this.rd = ragdoll;
    this.ctl = controller;
    this.world = ragdoll.world;
    // own random stream (seeded once from the shared one): how many wounds and fracture rolls a
    // contact produces must not shift the motor controller's random sequence
    this.rng = opts.rng ? makeRng(Math.floor(opts.rng() * 4294967296)) : Math.random;
    this.bleedScale = opts.bleedScale ?? 1;
    // Undead (zombies): no circulation, pain or consciousness to lose - they keep coming until the
    // brain or the cervical cord is destroyed or the body is wrecked (`hp`, worn down by the energy
    // the bullets deposit, more for vital structures). `armor`: { helmet: hits it stops, vest:
    // fraction of a torso round's energy it absorbs }.
    this.undead = !!opts.undead;
    this.hpMax = opts.hp ?? 200;
    this.armor = opts.armor ? { ...opts.armor } : null;
    this.anatomy = buildAnatomy();
    this.bySeg = {};
    for (const s of this.anatomy) (this.bySeg[s.seg] || (this.bySeg[s.seg] = [])).push(s);
    this.reset();
  }

  reset() {
    this.time = 0;
    this.hp = this.hpMax;
    this.wounds = [];
    this.events = [];
    this.injuries = []; // human-readable log: {time, text, severity}
    this.blood = BLOOD_VOLUME;
    this.lostExternal = 0;
    this.lostInternal = 0;
    this.bleedRate = 0; // mL/s total
    this.externalRate = 0;
    this.leakArt = 0; // arterial part of the bleeding (mL/s): a share of the cardiac output
    this.leakVen = 0; // venous / pulmonary part: drains the venous return before the heart
    this.venousCapacity = CO0; // what the stressed volume can return to the heart (mL/s)
    this.trees = {}; // per limb: leak conductances in series with its feeding artery / draining vein
    // circulation
    this.hr = 72;
    this.map = MAP0;
    this.mapF = MAP0; // arterial pressure with the Windkessel lag
    this.bpSys = 120;
    this.bpDia = 80;
    this.co = CO0;
    this.perfusion = 1; // cardiac output relative to normal
    this.symp = 0; // sympathetic (baroreflex) activation 0..1
    this.autonomic = 1; // integrity of the sympathetic outflow (spinal cord)
    this.cardiacSymp = 1; // cardiac accelerator fibres (T1-T4)
    this.cardiac = 1; // pump function of the (wounded) heart
    this.myoDebt = 0; // myocardial oxygen debt (s-equivalent)
    this.inflow = 1;
    this.lowFlowTime = 0;
    this.hypoxicTime = 0;
    this.vf = false;
    this.rhythm = 'sinus';
    // respiration
    this.parench = { L: 1, R: 1 }; // lung tissue function
    this.ptx = { L: 0, R: 0 }; // pneumothorax: collapsed fraction
    this.ptxTarget = { L: 0, R: 0 };
    this.ptxRate = { L: 0, R: 0 };
    this.tension = { L: false, R: false };
    this.tensionP = { L: 0, R: 0 }; // pleural pressure build-up of a tension pneumothorax 0..1
    this.openChest = { L: false, R: false }; // open (sucking) chest wound: vents, cannot tension
    this.pAlv = 100; // alveolar PO2 (mmHg): the lungs' oxygen store
    this.lungs = { L: 1, R: 1 }; // effective gas exchange per side
    this.airwayInjury = 1;
    this.airway = 1;
    this.breathing = 1; // respiratory drive x respiratory muscles
    this.pao2 = 100;
    this.spo2 = o2Saturation(100) - (0.03 * 0.25) / 0.97;
    this.rr = 13;
    this.cav = { pleuraL: 0, pleuraR: 0, pericardium: 0, mediastinum: 0, peritoneum: 0, retro: 0, neck: 0, tissue: 0, airway: 0 };
    // brain, pain, consciousness
    this.pain = 0;
    this.painAcute = 0;
    this.adrenaline = 0;
    this.alive = true;
    this.conscious = true;
    this.hypoxia = 0; // accumulated cerebral ischaemia (s-equivalent)
    this.brainDamage = 0; // 0..1 (1 = brain death)
    this.delivery = 1;
    this.koTimer = 0;
    this.concussion = 0;
    this.arrestTime = -1;
    this.arrestCause = null;
    this.deathTime = -1;
    this.spinal = null; // highest spinal lesion level
    this.paralysis = { armsL: 1, armsR: 1, legs: 1, trunk: 1, neck: 1 };
    this.nerve = { armL: 1, armR: 1, legL: 1, legR: 1 };
    this.muscle = {}; // segment -> damage 0..1
    this.limbPain = {}; // segment -> pain contribution
    this.fractures = []; // {seg, label, physical}
    this.buckle = { L: 1, R: 1, arms: { L: 1, R: 1 }, trunk: 1 };
    this.structSev = {}; // structure name -> combined damage 0..1
    this.aisList = []; // {region, ais, label}
    this.aisMax = {}; // region -> highest AIS
    this._scores = null;
    this.tissueEnergy = 0; // J deposited in tissue by projectiles and blows
    this.deathCause = null;
    this.status = 'healthy';
    this.coughTimer = 0;
    this.gaspTimer = 0;
    this.gaspT = 0;
    this.lastGrunt = -10;
    this.bruiseCooldown = new Map();
    this.pendingBreaks = [];
    this.boneBleedQ = {}; // bone ('segment:bone') -> fracture haemorrhage already assigned, mL/s
    // melee trauma
    this.tbi = 0; // traumatic brain injury 0..1 (1: fatal) from blows to the head
    this.ichRate = 0; // growth of tbi per second from an intracranial haematoma
    this.skullFx = []; // skull fracture sites {region, depressed, pB}
    this.ribFx = []; // rib fracture sites {side, n, theta, displaced, segmental}
    this.flail = { L: false, R: false };
    this.chestWall = { L: 1, R: 1 }; // breathing mechanics of each side of the chest wall
    this.splint = 0; // breathing held shallow by the pain of broken ribs
    this.neckSprain = 0; // 0..1
    this.holds = []; // hit reactions that last (see addHold)
  }

  // ------------------------------------------------------------------------------------------
  // helpers

  bodyBindPos(body) {
    if (body.userData && body.userData.fragment) return body.userData.bindPos;
    return body.userData.segment.bindPos;
  }

  /** World point -> anatomical bind coordinates (through the body it lies in). */
  toBind(body, pW, out) {
    body.worldToLocal(pW, out);
    return out.add(this.bodyBindPos(body));
  }

  log(text, severity = 1) {
    this.injuries.push({ time: this.time, text, severity });
  }

  addPain(amount, seg) {
    this.painAcute = Math.min(this.painAcute + amount, 2.5);
    if (seg) this.limbPain[seg] = Math.min((this.limbPain[seg] || 0) + amount, 2);
    this.adrenaline = Math.min(1, this.adrenaline + amount * 0.6);
  }

  /** Record an injury on the Abbreviated Injury Scale for the trauma severity scores. */
  addAIS(region, ais, label) {
    ais = clamp(Math.round(ais), 1, 6);
    // one entry per injury (the same structure reported twice keeps its worst grade)
    const key = region + ':' + label;
    const e = this.aisList.find((x) => x.key === key);
    if (e) e.ais = Math.max(e.ais, ais);
    else this.aisList.push({ key, region, ais, label });
    if (ais > (this.aisMax[region] || 0)) this.aisMax[region] = ais;
    this._scores = null;
  }

  /** addAIS for a condition that develops over time (checked every step, recorded once). */
  gradeOnce(region, ais, label) {
    if (this.aisList.some((x) => x.label === label)) return;
    this.addAIS(region, ais, label);
  }

  /** Injury Severity Score (3 worst body regions) and New ISS (3 worst injuries anywhere). */
  severityScores() {
    if (this._scores) return this._scores;
    const sq = (a) => a.slice(0, 3).reduce((s, x) => s + x * x, 0);
    const regions = Object.values(this.aisMax).sort((a, b) => b - a);
    const all = this.aisList.map((x) => x.ais).sort((a, b) => b - a);
    const any6 = all[0] === 6;
    this._scores = { iss: any6 ? 75 : sq(regions), niss: any6 ? 75 : sq(all) };
    return this._scores;
  }

  /**
   * Overall trauma burden 0..~1.5: severity of the worst injuries (NISS) plus the amount of tissue
   * destroyed. Drives traumatic shock (vasoplegia, myocardial depression) and acute traumatic
   * coagulopathy, which appear with NISS > ~16-25 even before much blood is lost.
   */
  traumaLoad() {
    return clamp(this.severityScores().niss / 75 + this.tissueEnergy / 15000, 0, 1.5);
  }

  /**
   * Fracture haemorrhage of a bone that is (newly) broken: the marrow cavity, periosteum and the
   * muscle torn by the fragments bleed once per bone. Returns the part of `fb` (mL/s) not yet
   * assigned to an earlier fracture of the same bone, so a comminuted or re-struck bone, a
   * fragment hit after the break, or two impacts in one frame do not multiply the bleeding.
   */
  boneBleed(segName, bone, fb) {
    const key = segName + ':' + bone;
    const prev = this.boneBleedQ[key] || 0;
    const add = Math.max(0, fb - prev);
    this.boneBleedQ[key] = prev + add;
    return add;
  }

  /** A bleeding source on a wound. q: mL/s fully open at normal pressure. */
  makeBleed(q, cls, o = {}) {
    const [clotMax, tau] = clotClass(cls, q);
    return {
      q, cls, clotMax, tau, clot: 0,
      art: o.art ?? (cls === 'artery' || cls === 'heart' ? 1 : cls === 'vein' || cls === 'lung' ? 0 : 0.4),
      full: o.full ?? q, // nominal flow of the whole structure (several wounds may share it)
      ext: o.ext ?? 1,
      cav: o.cav || 'tissue',
      side: o.side || 'L',
      air: o.air || 0,
      label: o.label || cls,
    };
  }

  addBleed(w, b) {
    w.bleeds.push(b);
    this.summarise(w);
  }

  /** Nominal external / internal rates of a wound (for display and wound pressure). */
  summarise(w) {
    let ext = 0, int = 0, art = false;
    for (const b of w.bleeds) {
      ext += b.q * b.ext;
      int += b.q * (1 - b.ext);
      if (b.art > 0.8 && b.q * b.ext > 1.5) art = true;
    }
    const share = w.partner ? 0.4 : 1;
    w.extRate = ext * share;
    w.intRate = int;
    w.arterial = w.arterial || art;
    if (w.partner) {
      w.partner.extRate = ext * (1 - share);
      w.partner.arterial = w.arterial;
    }
  }

  addWound(w) {
    w.id = woundIds++;
    w.age = 0;
    w.pressure = 0;
    w.seed = this.rng();
    w.extNow = 0;
    w.intNow = 0;
    w.arterial = w.arterial || false;
    w.spurtPhase = 0;
    if (!w.bleeds) {
      // wounds created from outside (glass cuts, bruises): plain soft-tissue bleeding
      w.bleeds = [];
      const ext = w.extRate || 0, int = w.intRate || 0;
      if (ext + int > 0) w.bleeds.push(this.makeBleed(ext + int, w.seg && w.seg.name === 'head' ? 'scalp' : 'tissue', { art: 0.4, ext: ext / (ext + int), cav: 'tissue' }));
    }
    if (w.kind !== 'exit') this.summarise(w);
    this.wounds.push(w);
    this.events.push({ type: 'wound', wound: w });
    return w;
  }

  // ------------------------------------------------------------------------------------------
  /**
   * Wound channel of a projectile through one body (segment or fragment).
   * entryW: skin entry point (world). exitW: exit point or null if the channel ends inside at
   * stopW. dirW: unit travel direction. proj: { speed, mass, diameter, energy, pen, kind }.
   * Returns { deposited, stopped, energyLeft, penLeft }.
   */
  bulletThrough(body, entryW, exitW, dirW, proj) {
    const seg = body.userData.segment;
    const name = seg.name;
    const kind = segKind(name);
    const pathW = exitW ? entryW.distanceTo(exitW) : 0.15;
    // penetration budget (m of soft tissue); bone costs extra
    const entryB = this.toBind(body, entryW, new Vec3());
    let endW = exitW ? exitW.clone() : entryW.clone().addScaled(dirW, pathW);
    let endB = this.toBind(body, endW, new Vec3());
    const structs = this.bySeg[name] || [];
    // bone in the way?
    let boneCost = 0;
    for (const s of structs) {
      if (s.kind !== 'bone') continue;
      const r = pathToStructure(entryB, endB, s);
      if (r.dist < proj.diameter * 0.5) boneCost += s.long ? 0.1 : 0.06;
    }
    const need = pathW + boneCost;
    let stopped = false;
    let frac = 1;
    if (proj.pen < need) {
      stopped = true;
      frac = clamp((proj.pen - boneCost * 0.5) / pathW, 0.05, 1);
      endW = entryW.clone().addScaled(dirW, pathW * frac);
      endB = this.toBind(body, endW, new Vec3());
    }
    const pen0 = proj.pen0 || proj.pen;
    const penBefore = proj.pen;
    proj.pen = Math.max(0, proj.pen - need);
    const eBefore = proj.energy;
    // energy falls with the remaining penetration (velocity bleeds off roughly linearly)
    const eAfter = stopped ? 0 : proj.energy0 * Math.pow(proj.pen / pen0, 1.6);
    const deposited = Math.max(0, eBefore - eAfter) * (proj.fragmenting ? 1.15 : 1);
    proj.energy = eAfter;
    proj.speed = proj.speed0 * Math.sqrt(Math.max(eAfter, 0) / proj.energy0);
    // temporary cavity: high-velocity rounds stretch tissue well away from the channel
    const highVel = proj.speed0 > 600;
    const cavity = proj.diameter * 0.5 + (highVel ? 0.00003 : 0.000008) * deposited;
    this.tissueEnergy += deposited;

    const hit = { deposited, structures: [], fracture: null };
    const side = entryB.x >= 0 ? 'L' : 'R';
    const bleeds = [];
    // the channel itself: torn muscle, skin and small vessels (scalp and face bleed freely)
    const tissueQ = (0.3 + deposited / 260) * (kind === 'head' ? 1.6 : kind === 'hand' || kind === 'foot' ? 1.2 : 1);
    bleeds.push(this.makeBleed(tissueQ, kind === 'head' ? 'scalp' : 'tissue', { art: 0.4, ext: TISSUE_EXT[kind] ?? 0.75, cav: TISSUE_CAV[kind] || 'tissue', side }));
    let painAdd = PAIN_BY_SEGMENT[kind] * clamp(0.35 + deposited / 500, 0.35, 1.2);
    const toLog = [];
    let skullBreached = false, brainHit = false, trachea = false;

    for (const s of structs) {
      const r = pathToStructure(entryB, endB, s);
      const direct = r.dist <= proj.diameter * 0.5 + 0.001;
      if (r.dist > cavity) continue;
      // tolerance to the stretch of the temporary cavity: lung, gut, vessels and nerves are elastic,
      // brain, liver and other solid organs are not
      const elastic = s.kind === 'lung' || s.kind === 'gut' || s.kind === 'nerve' ? 0.3 : s.kind === 'artery' || s.kind === 'vein' ? 0.4 : 0.6;
      // a channel cuts a vessel or nerve through, but destroys only part of a large solid organ
      // (more with more energy: the permanent cavity of a rifle round is far larger)
      const directSev = s.kind === 'organ' ? clamp(0.45 + deposited / 800, 0.45, 1) : 1;
      const sev = direct ? directSev : clamp(1 - r.dist / Math.max(cavity, 1e-4), 0, 1) * elastic;
      if (sev < 0.08) continue;
      const prev = this.structSev[s.name] || 0;
      const total = 1 - (1 - prev) * (1 - sev);
      this.structSev[s.name] = total;
      const added = total - prev; // a structure that is already destroyed cannot bleed twice
      hit.structures.push({ s, sev, direct });
      if (s.ais && s.kind !== 'bone') this.addAIS(issRegion(name, s), s.ais[direct ? 1 : 0], s.label);
      switch (s.kind) {
        case 'skull':
          if (direct) skullBreached = true;
          break;
        case 'brain':
          brainHit = true;
          if (direct || sev > 0.25 || this.undead) this.kill('gunshot wound to the brain');
          else {
            this.knockOut(30 + 90 * sev, 0.9);
            this.brainDamage = Math.max(this.brainDamage, 0.6 * sev);
          }
          toLog.push([direct ? `${s.label} penetrated` : `${s.label} contused (cavitation)`, 3]);
          break;
        case 'brainstem':
          brainHit = true;
          if (direct || sev > 0.3 || this.undead) {
            this.kill('brain stem destroyed');
            toLog.push(['brain stem destroyed', 3]);
          } else {
            this.knockOut(60 + 120 * sev, 1);
            this.breathing = Math.min(this.breathing, 1 - sev);
            toLog.push(['brain stem contused', 3]);
          }
          break;
        case 'face':
          bleeds.push(this.makeBleed(s.bleed * added, 'tissue', { art: s.art, ext: s.external, cav: s.cav, side, air: s.air }));
          if (direct && this.rng() < 0.7) this.addFracture(seg, s.bone, true, false);
          toLog.push([`${s.label} shattered`, 2]);
          painAdd += 0.4;
          break;
        case 'eye':
          toLog.push([`${s.label} destroyed`, 2]);
          painAdd += 0.5;
          break;
        case 'oral':
          bleeds.push(this.makeBleed(s.bleed * added, 'tissue', { art: s.art, ext: s.external, cav: s.cav, side, air: s.air }));
          toLog.push([`${s.label} torn (bleeding into the airway)`, 2]);
          painAdd += 0.3;
          break;
        case 'cord':
          if (direct || sev > 0.55) {
            this.spinalInjury(s.level);
            toLog.push([`${s.label} severed`, 3]);
          }
          break;
        case 'heart': {
          // A hole in a beating ventricle leaks with every beat, partly into the pericardium
          // (tamponade), mostly into the chest; a high-energy wound ruptures the chamber.
          const rupture = direct && (highVel || deposited > 450);
          this.cardiac = Math.min(this.cardiac * (prev > 0 ? 0.75 : 1), direct ? (rupture ? 0.12 : 0.45) : 0.75);
          const q = s.bleed * added * (rupture ? 1.4 : 1);
          bleeds.push(this.makeBleed(q * (rupture ? 0.05 : 0.3), 'heart', { ext: 0, cav: 'pericardium', label: 'heart' }));
          bleeds.push(this.makeBleed(q * (rupture ? 0.95 : 0.7), 'heart', { ext: s.external, cav: 'pleura', side: 'L', label: 'heart' }));
          // direct myocardial injury commonly triggers ventricular fibrillation
          if (direct && this.rng() < (rupture ? 0.55 : 0.2)) this.ventricularFibrillation('heart wound');
          toLog.push([rupture ? 'heart ruptured' : direct ? 'heart perforated' : 'heart contused', 3]);
          painAdd += 0.4;
          break;
        }
        case 'lung': {
          const sd = s.side;
          this.parench[sd] = Math.max(0.05, this.parench[sd] - (direct ? 0.25 : 0.25 * sev));
          bleeds.push(this.makeBleed(s.bleed * added * (highVel ? 1.6 : 1), 'lung', { art: 0, ext: s.external, cav: 'pleura', side: sd, air: s.air }));
          // air leaks into the pleural space; a chest-wall defect larger than ~2/3 of the tracheal
          // diameter (rifle exit wounds) makes it an open (sucking) pneumothorax that collapses the
          // lung quickly, a valve-like leak becomes a tension pneumothorax
          const open = highVel || deposited > 400;
          this.ptxTarget[sd] = Math.max(this.ptxTarget[sd], direct ? 0.6 + 0.35 * this.rng() : sev); // cavity sev <= 0.3
          this.ptxRate[sd] = Math.max(this.ptxRate[sd], open ? 1 / 10 : 1 / 30);
          if (open) this.openChest[sd] = true;
          else if (direct && !this.tension[sd] && this.rng() < 0.2) this.tension[sd] = true;
          // AIS 2005: a laceration of both lungs is graded 4 (one lung 3)
          if (this.structSev['lung L'] && this.structSev['lung R']) this.addAIS('chest', 4, 'bilateral lung laceration');
          toLog.push([`${s.label} ${direct ? 'punctured' : 'contused'} (pneumothorax)`, 2]);
          break;
        }
        case 'airway':
          this.airwayInjury = Math.min(this.airwayInjury, direct ? 0.55 : 0.8);
          trachea = true;
          toLog.push(['trachea torn', 2]);
          painAdd += 0.3;
          break;
        case 'artery':
        case 'vein': {
          const q = s.bleed * added;
          bleeds.push(this.makeBleed(q, s.kind, { ext: s.external, cav: s.cav, side: s.side || side, label: s.label, full: s.bleed }));
          if (added > 0.02) toLog.push([`${s.label} ${direct ? 'severed' : 'lacerated'}`, q > 15 ? 3 : 2]);
          break;
        }
        case 'organ':
        case 'gut':
          bleeds.push(this.makeBleed(s.bleed * added * (highVel && s.kind === 'organ' ? 1.5 : 1), s.kind === 'organ' ? 'organ' : 'tissue', { art: s.art, ext: s.external, cav: s.cav, side: s.side || side, label: s.label }));
          painAdd += s.kind === 'gut' ? 0.45 : 0.3;
          toLog.push([`${s.label} ${direct ? 'perforated' : highVel && s.kind === 'organ' ? 'burst (cavitation)' : 'damaged'}`, 2]);
          break;
        case 'nerve': {
          // a cut nerve paralyses its muscles; the rifle cavity stuns nerves (neurapraxia)
          const loss = s.loss * (direct ? 1 : 0.6);
          this.nerve[s.limb] = Math.min(this.nerve[s.limb], 1 - loss);
          toLog.push([`${s.label} ${direct ? 'severed' : 'stunned'}`, 2]);
          painAdd += 0.4;
          break;
        }
        case 'bone': {
          const p = direct ? clamp(0.3 + deposited / 380, 0, 0.98) : clamp(deposited / 1500, 0, 0.5) * sev;
          if (this.rng() < p) {
            const open = deposited > 250;
            if (s.long) {
              hit.fracture = { seg, t: r.along, open };
              this.queueBreak(seg, r.along, open);
            } else {
              this.addFracture(seg, s.bone, open, false);
            }
            const fb = this.boneBleed(name, s.bone, FRACTURE_BLEED[s.bone] ?? 0.3);
            if (fb > 0) bleeds.push(this.makeBleed(fb, 'bone', { art: 0.3, ext: open ? 0.4 : 0, cav: s.bone === 'pelvis' ? 'retro' : 'tissue', side, label: s.label }));
            if (s.nearCord && (direct ? this.rng() < 0.45 : this.rng() < 0.12)) {
              this.spinalInjury(s.nearCord);
              toLog.push([`spinal cord injured by ${s.label} fragments`, 3]);
            }
            painAdd += 0.5;
          } else if (direct) toLog.push([`${s.label} chipped`, 1]);
          break;
        }
        default:
          break;
      }
    }
    // blood from vessels next to a torn trachea is aspirated
    if (trachea) for (const b of bleeds) if (b.cav === 'neck') b.air = Math.max(b.air, 0.35);
    // head: a channel through the cranial vault that misses the brain is a gutter wound; the blow
    // of the bullet itself often knocks the person out. A high-velocity round inside the rigid skull
    // bursts it (hydrodynamic pressure of the temporary cavity).
    if (kind === 'head' && this.alive && !brainHit) {
      if (skullBreached) {
        this.addFracture(seg, 'skull', true, false);
        if (highVel && deposited > 350) this.kill('gunshot wound to the head (cranial burst)');
        else {
          if (this.rng() < clamp(0.35 + deposited / 400, 0, 0.95)) this.knockOut(8 + 40 * clamp(deposited / 500, 0, 1) * (0.5 + 0.5 * this.rng()), 0.7);
          this.brainDamage = Math.max(this.brainDamage, 0.1);
          toLog.push(['tangential (gutter) skull wound', 3]);
        }
      } else if (this.rng() < clamp(deposited / 1500, 0, 0.35)) this.knockOut(4 + 12 * this.rng(), 0.5);
      this.concussion = clamp(this.concussion + 0.25 + deposited / 2000, 0, 1);
    }
    // muscle damage weakens the limb
    this.muscle[name] = clamp((this.muscle[name] || 0) + 0.15 + deposited / 700, 0, 1);
    this.addPain(painAdd, name);
    // soft-tissue and skin wounds on the trauma scores
    this.addAIS(issRegion(name), deposited > 350 ? 2 : 1, 'gunshot wound, ' + (SEGMENT_LABEL[name] || name));
    this.addAIS('external', 1, 'skin');

    // wounds on the skin
    const dirLocal = body.worldDirToLocal(dirW, new Vec3());
    const entryLocal = body.worldToLocal(entryW, new Vec3());
    const exitLocal = !stopped && exitW ? body.worldToLocal(exitW, new Vec3()) : null;
    const entryWound = {
      body,
      seg,
      kind: 'entry',
      local: entryLocal,
      normal: dirLocal.clone().negate(),
      dir: dirLocal.clone(),
      radius: proj.diameter * 0.55 + 0.0015,
      severity: clamp(deposited / 600, 0.2, 1),
      bleeds,
      pain: painAdd,
      cause: proj.label || 'gunshot',
      energy: deposited,
    };
    let exitWound = null;
    if (exitLocal) {
      const big = clamp(deposited / 900, 0, 1);
      exitWound = {
        body,
        seg,
        kind: 'exit',
        local: exitLocal,
        normal: dirLocal.clone(),
        dir: dirLocal.clone(),
        radius: proj.diameter * 0.6 + 0.003 + 0.022 * big * (highVel ? 1 : 0.4),
        severity: clamp(0.3 + big, 0.3, 1),
        bleeds: [],
        pain: painAdd * 0.5,
        cause: proj.label || 'gunshot',
        energy: deposited,
      };
      entryWound.partner = exitWound;
      exitWound.channel = entryWound;
    }
    this.addWound(entryWound);
    if (exitWound) {
      this.addWound(exitWound);
      this.summarise(entryWound);
    }
    let total = 0;
    for (const b of bleeds) total += b.q;
    const where = SEGMENT_LABEL[name] || name;
    this.log(`${proj.label || 'Gunshot'} wound, ${where}${exitWound ? ' (through and through)' : ' (bullet lodged)'}`, total > 15 ? 3 : total > 4 ? 2 : 1);
    for (const [t, s] of toLog) this.log(`  ${t}`, s);

    // the hit itself: transient loss of tone in the area + startle (shot reaction)
    this.reactToHit(name, clamp(deposited / 400, 0.25, 1.2), dirW, 'bullet');
    if (this.undead && this.alive) {
      // wrecking a zombie: tissue destroyed (sub-linear in the deposited energy, so a rifle round
      // is worth ~3 pistol rounds rather than 6), more where it matters, plus vital structures hit
      let vital = 0;
      for (const x of hit.structures) vital += (UNDEAD_VITAL[x.s.kind] || 0) * (x.direct ? 1 : 0.4);
      const dmg = (Math.pow(deposited, 0.7) + Math.min(vital, UNDEAD_VITAL_MAX)) * (UNDEAD_LOC[kind] ?? 1);
      this.hp -= dmg;
      hit.damage = dmg;
      if (this.hp <= 0) this.kill('destroyed');
    }
    hit.stopped = stopped;
    hit.energyLeft = proj.energy;
    hit.penUsed = penBefore - proj.pen;
    hit.entryWound = entryWound;
    hit.exitWound = exitWound;
    hit.endW = endW;
    return hit;
  }

  /**
   * Armour in the way of a round about to enter segment `segName`: returns 'stopped' (a helmet
   * takes it - each hit wears it down until it comes off), 'reduced' (a vest took most of its
   * energy: `proj` is weakened in place) or null.
   */
  armorHit(segName, proj) {
    const a = this.armor;
    if (!a || !this.alive) return null;
    const k = segKind(segName);
    if (k === 'head' && a.helmet > 0) {
      a.helmet--;
      this.events.push({ type: 'armor', part: 'helmet', left: a.helmet });
      if (a.helmet === 0) this.log('Helmet shot off', 2);
      return 'stopped';
    }
    if ((k === 'chest' || k === 'abdomen') && a.vest > 0) {
      proj.energy *= 1 - a.vest;
      proj.pen *= 1 - a.vest;
      proj.speed = proj.speed0 * Math.sqrt(proj.energy / proj.energy0);
      this.events.push({ type: 'armor', part: 'vest' });
      return 'reduced';
    }
    return null;
  }

  queueBreak(seg, t, open) {
    if (seg.fractured || this.pendingBreaks.some((b) => b.seg === seg)) return;
    this.pendingBreaks.push({ seg, t, open });
  }

  addFracture(seg, label, open, physical) {
    if (this.fractures.some((f) => f.seg === seg.name && f.label === label)) return;
    this.fractures.push({ seg: seg.name, label, open, physical });
    this.log(`${open ? 'Open' : 'Closed'} fracture: ${label} (${SEGMENT_LABEL[seg.name] || seg.name})`, 2);
    this.events.push({ type: 'fracture', seg, label, open, physical });
    this.addPain(0.8, seg.name);
    const facial = label === 'maxilla' || label === 'mandible';
    this.addAIS(facial ? 'face' : label === 'skull' ? 'head' : issRegion(seg.name, { kind: 'bone' }), Math.min((FRACTURE_AIS[label] ?? 2) + (open ? 1 : 0), 4), label);
    if (label === 'pelvis') this.muscle.pelvis = Math.max(this.muscle.pelvis || 0, 0.6);
  }

  /** Physically break a long bone: splits the segment body (see Ragdoll.fractureSegment). */
  breakLongBone(seg, t, open, onBroken) {
    const info = this.rd.fractureSegment(seg, t);
    if (!info) return null;
    // wounds on the proximal fragment live in the re-centred body frame
    for (const w of this.wounds) if (w.body === seg.body) w.local.sub(info.delta);
    for (const w of this.wounds) {
      if (w.body !== seg.body) continue;
      // wounds beyond the break now ride on the distal fragment
      const bindP = _v0.copy(w.local).add(seg.bindPos);
      if (_v1.subVectors(bindP, info.pointBind).dot(info.axisBind) > 0) {
        w.body = info.fragment;
        w.local.copy(bindP).sub(info.fragment.userData.bindPos);
      }
    }
    this.addFracture(seg, seg.bone ? seg.bone.name : 'bone', open, true);
    if (onBroken) onBroken(info);
    return info;
  }

  spinalInjury(level) {
    const order = { C1: 0, C5: 1, T6: 2, L1: 3, S1: 4 };
    if (this.spinal && order[this.spinal] <= order[level]) return;
    if (this.undead && (level === 'C1' || level === 'C5')) {
      this.spinal = level;
      this.kill('cervical spine severed');
      return;
    }
    this.spinal = level;
    const P = this.paralysis;
    // Sympathetic outflow leaves the cord at T1-L2 (cardiac accelerators T1-T4): lesions above T6
    // cause neurogenic shock (vasodilatation, venous pooling, bradycardia).
    if (level === 'C1') {
      P.armsL = P.armsR = P.legs = P.trunk = P.neck = 0;
      this.breathing = 0; // phrenic nerve (C3-C5) cut off: respiratory paralysis
      this.autonomic = Math.min(this.autonomic, 0.2);
      this.cardiacSymp = 0;
      this.log('Quadriplegia with respiratory paralysis (high cervical)', 3);
    } else if (level === 'C5') {
      P.armsL = P.armsR = 0.08;
      P.legs = 0;
      P.trunk = 0.05;
      P.neck = 0.6;
      // diaphragm only: intercostal and abdominal muscles lost
      this.breathing = Math.min(this.breathing, 0.65);
      this.autonomic = Math.min(this.autonomic, 0.25);
      this.cardiacSymp = Math.min(this.cardiacSymp, 0.1);
      this.log('Quadriplegia (cervical cord injury)', 3);
    } else if (level === 'T6') {
      P.legs = 0;
      P.trunk = 0.35;
      this.autonomic = Math.min(this.autonomic, 0.55);
      this.cardiacSymp = Math.min(this.cardiacSymp, 0.8);
      this.log('Paraplegia (thoracic cord injury)', 3);
    } else if (level === 'L1') {
      P.legs = 0;
      P.trunk = 0.8;
      this.autonomic = Math.min(this.autonomic, 0.9);
      this.log('Paraplegia (lumbar cord injury)', 3);
    } else {
      P.legs = Math.min(P.legs, 0.45);
      this.log('Cauda equina injury (leg weakness)', 2);
    }
    this.events.push({ type: 'paralysis', level });
  }

  knockOut(seconds, concussion = 0.5) {
    if (!this.alive || this.undead) return;
    this.koTimer = Math.max(this.koTimer, seconds);
    this.concussion = Math.max(this.concussion, concussion);
    if (this.conscious) {
      this.conscious = false;
      this.events.push({ type: 'ko' });
      this.log('Knocked unconscious', 2);
      this.ctl?.onKnockOut?.(this.concussion);
    }
  }

  kill(cause) {
    if (!this.alive) return;
    this.alive = false;
    this.conscious = false;
    this.deathCause = cause;
    this.deathTime = this.time;
    this.hr = 0;
    if (this.arrestTime < 0) this.arrestTime = this.time;
    this.rhythm = 'asystole';
    this.events.push({ type: 'death', cause });
    this.log(`DEATH: ${cause}`, 3);
    this.ctl?.onDeath?.(cause);
  }

  /**
   * Transient muscular reaction to a hit (Euphoria-style shot/impact reaction): a momentary loss
   * of tone where it hurts. A penetrating wound (bullet) triggers a strong nociceptive withdrawal
   * and inhibition of the muscles around it — a leg shot makes that knee give way, a gut shot
   * folds the hips and both knees; a chest shot mostly takes the trunk's tone. A blunt blow to a
   * braced body is mostly a mechanical push: the struck region flinches, the legs keep working.
   */
  reactToHit(segName, strength, dirW, kind) {
    if (!this.alive) return;
    const side = sideOf(segName);
    const k = segKind(segName);
    const s = clamp(strength, 0, 1.2);
    const pen = kind === 'bullet' || kind === 'stab';
    const legs = (a) => {
      this.buckle.L = Math.min(this.buckle.L, 1 - a * s);
      this.buckle.R = Math.min(this.buckle.R, 1 - a * s);
    };
    if (k === 'thigh' || k === 'shin' || k === 'foot') {
      this.buckle[side] = Math.min(this.buckle[side], 1 - (pen ? 0.75 : 0.35) * s);
    } else if (k === 'pelvis' || k === 'abdomen') {
      legs(pen ? 0.45 : 0.15);
      this.buckle.trunk = Math.min(this.buckle.trunk, 1 - (pen ? 0.5 : 0.3) * s);
    } else if (k === 'chest' || k === 'neck') {
      legs(pen ? 0.2 : 0.05);
      this.buckle.trunk = Math.min(this.buckle.trunk, 1 - (pen ? 0.4 : 0.2) * s);
    } else if (k === 'upperArm' || k === 'forearm' || k === 'hand') {
      this.buckle.arms[side] = Math.min(this.buckle.arms[side], 1 - (pen ? 0.85 : 0.5) * s);
    }
    if (this.ctl && this.ctl.onHit) this.ctl.onHit({ segment: segName, strength: s, dir: dirW, kind });
    if (this.conscious && this.time - this.lastGrunt > 0.35) {
      this.lastGrunt = this.time;
      this.events.push({ type: 'grunt', intensity: clamp(0.4 + s * 0.6, 0, 1) });
    }
  }

  // ------------------------------------------------------------------------------------------
  /**
   * Blunt impact on a body of this ragdoll. pointW: contact point; impulse: N*s over the frame;
   * speed: approach speed (m/s); material: other body's material key.
   */
  blunt(body, pointW, normalW, impulse, speed, material, other) {
    if (!body.userData || !body.userData.segment) return;
    const seg = body.userData.segment;
    const name = seg.name;
    const k = segKind(name);
    const T = BLUNT[k];
    if (!T) return;
    const tau = T.tau + (MATERIAL_TAU[material] ?? MATERIAL_TAU.default);
    const F = impulse / tau;
    if (F < T.bruise * 0.7) return;
    // rate-limit repeated reports of the same resting contact
    const key = body.id * 7 + (other ? other.id % 7 : 0);
    const last = this.bruiseCooldown.get(key) ?? -1;
    if (this.time - last < 0.25) return;
    this.bruiseCooldown.set(key, this.time);
    const local = body.worldToLocal(pointW, new Vec3());
    const nLocal = body.worldDirToLocal(normalW, new Vec3());
    const sev = clamp((F - T.bruise * 0.7) / (T.fracture === Infinity ? 4000 : T.fracture), 0, 1);
    const where = SEGMENT_LABEL[name] || name;
    // contusion (a deep one bleeds into the tissue: haematoma)
    const w = this.addWound({
      body,
      seg,
      kind: 'bruise',
      local,
      normal: nLocal.clone().negate(), // outward
      dir: nLocal.clone(),
      radius: 0.025 + 0.035 * sev,
      severity: clamp(0.3 + sev, 0, 1),
      bleeds: F > T.bruise * 2 ? [this.makeBleed(0.2 * sev, 'tissue', { ext: 0, cav: 'tissue' })] : [],
      pain: 0.05 + 0.6 * sev,
      cause: 'blunt',
      energy: 0,
    });
    this.tissueEnergy += 0.5 * impulse * speed;
    this.addPain(PAIN_BY_SEGMENT[k] * (0.1 + 0.9 * sev), name);
    // contusions weaken a muscle but do not stack up like torn tissue
    this.muscle[name] = clamp(Math.max(this.muscle[name] || 0, 0.3 * sev), 0, 1);
    const result = { F, fracture: null };
    if (F > T.bruise * 1.6) {
      this.log(`Blunt trauma, ${where} (${(F / 1000).toFixed(1)} kN)`, sev > 0.5 ? 2 : 1);
      this.addAIS(issRegion(name), sev > 0.6 ? 2 : 1, 'contusion');
    }
    // fractures
    const pFrac = 1 / (1 + Math.exp(-(F - T.fracture) / (0.08 * T.fracture)));
    if (T.fracture < Infinity && this.rng() < pFrac) {
      // (bullets name the long bones the same way: 'femur', 'tibia', 'humerus', 'radius/ulna')
      const fb = () => this.boneBleed(name, T.label, FRACTURE_BLEED[T.label] ?? 0.3);
      if (seg.bone) {
        // break where it was struck: project the contact onto the bone axis
        const ax = boneAxis(name);
        if (ax && !seg.fractured) {
          const pb = _v0.copy(local).add(this.bodyBindPos(body));
          const ab = _v1.subVectors(ax.b, ax.a);
          const t = clamp(_v2.subVectors(pb, ax.a).dot(ab) / ab.lengthSq(), 0, 1);
          result.fracture = { seg, t, open: F > T.fracture * 2.2 };
          this.queueBreak(seg, t, F > T.fracture * 2.2);
          const q = fb();
          if (q > 0) this.addBleed(w, this.makeBleed(q, 'bone', { art: 0.3, ext: F > T.fracture * 2.2 ? 0.3 : 0, cav: 'tissue' }));
        }
      } else {
        this.addFracture(seg, T.label, F > T.fracture * 2.5, false);
        const q = fb();
        if (q > 0) this.addBleed(w, this.makeBleed(q, 'bone', { art: 0.3, ext: 0, cav: k === 'pelvis' ? 'retro' : k === 'chest' ? 'pleura' : 'tissue', side: local.x >= 0 ? 'L' : 'R' }));
        if (k === 'chest' && F > T.fracture * 1.8) {
          // flail segment / lung contusion; sharp rib ends may puncture the lung
          const sd = local.x >= 0 ? 'L' : 'R';
          this.parench[sd] = Math.max(0.1, this.parench[sd] - 0.35);
          this.log(`  ${sd === 'L' ? 'left' : 'right'} lung contusion`, 2);
          this.addAIS('chest', 3, 'lung contusion');
          if (this.rng() < 0.4) {
            this.ptxTarget[sd] = Math.max(this.ptxTarget[sd], 0.5);
            this.ptxRate[sd] = Math.max(this.ptxRate[sd], 1 / 40);
            this.log(`  ${sd === 'L' ? 'left' : 'right'} pneumothorax (rib fragment)`, 2);
          }
        }
        if (k === 'neck' && F > T.fracture * 1.5) this.spinalInjury(this.rng() < 0.5 ? 'C5' : 'C1');
      }
    }
    // organs
    if (k === 'abdomen' && F > T.organ) {
      const sx = local.x;
      const organ = sx < -0.02 ? 'liver' : sx > 0.02 ? 'spleen' : 'small intestine';
      const rate = organ === 'liver' ? 6 : organ === 'spleen' ? 5 : 1;
      this.addBleed(w, this.makeBleed(rate * clamp((F - T.organ) / T.organ + 0.3, 0, 1), organ === 'small intestine' ? 'tissue' : 'organ', { art: 0.5, ext: 0, cav: 'peritoneum' }));
      this.log(`  ${organ} ruptured (internal bleeding)`, 2);
      this.addAIS('abdomen', organ === 'small intestine' ? 3 : 3 + (F > T.organ * 1.6 ? 1 : 0), organ + ' rupture');
      this.addPain(0.5, name);
    }
    // head: concussion / knockout / fatal brain injury
    if (k === 'head') {
      const pKO = 1 / (1 + Math.exp(-(F - 4200) / 700));
      this.concussion = clamp(this.concussion + F / 12000, 0, 1);
      if (F > 16000) {
        this.kill('massive head trauma');
      } else if (this.rng() < pKO) {
        this.knockOut(3 + 18 * clamp((F - 3000) / 6000, 0, 1) + 5 * this.rng(), clamp(F / 8000, 0.3, 1));
      }
      if (F > 2500) {
        this.log(`  concussion`, 2);
        this.addAIS('head', F > 6000 ? 3 : 2, 'concussion');
      }
    }
    // only real blows provoke a hit reaction (not every bump against the floor)
    if (F > T.bruise * 1.3) this.reactToHit(name, clamp(F / (T.fracture === Infinity ? 4000 : T.fracture), 0.15, 1), normalW, 'blunt');
    return result;
  }

  // ------------------------------------------------------------------------------------------
  /** Physiology and controller coupling; dt in seconds. */
  update(dt) {
    this.time += dt;
    // long-bone fractures are executed between physics steps
    while (this.pendingBreaks.length) {
      const b = this.pendingBreaks.shift();
      const info = this.breakLongBone(b.seg, b.t, b.open);
      if (info) this.events.push({ type: 'bonebreak', info, open: b.open });
    }
    this.handPressure();
    this.circulation(dt);
    this.respire(dt);
    if (this.undead) {
      // the wounds still ooze (for the visuals); nothing of it matters to the undead
      this.blood = Math.max(this.blood, BLOOD_VOLUME * 0.6);
      this.spo2 = 0.97;
      this.hypoxia = 0;
      this.brainDamage = 0;
      this.arrestTime = this.alive ? -1 : this.arrestTime;
    } else this.cerebral(dt);
    const lossFrac = this.undead ? 0 : 1 - this.blood / BLOOD_VOLUME;

    // ---------------- pain ----------------
    this.painAcute *= Math.exp(-dt / 9);
    let chronic = 0;
    for (const w of this.wounds) chronic += (w.pain || 0) * (0.35 + 0.65 * Math.exp(-w.age / 90));
    for (const f of this.fractures) chronic += 0.35;
    for (const k in this.limbPain) this.limbPain[k] *= Math.exp(-dt / 60);
    const mask = 1 - 0.45 * this.adrenaline;
    this.pain = this.conscious && !this.undead ? clamp(1 - Math.exp(-(this.painAcute + chronic * 0.6) * mask), 0, 1) : 0;
    this.adrenaline *= Math.exp(-dt / 50);

    // ---------------- transient hit reactions recover ----------------
    const rec = (x, rate) => Math.min(1, x + dt * rate);
    this.buckle.L = rec(this.buckle.L, 1.4);
    this.buckle.R = rec(this.buckle.R, 1.4);
    this.buckle.trunk = rec(this.buckle.trunk, 1.6);
    this.buckle.arms.L = rec(this.buckle.arms.L, 1.2);
    this.buckle.arms.R = rec(this.buckle.arms.R, 1.2);
    if (this.holds.length) this.applyHolds();
    // a haematoma under a fractured skull grows: coma, then the brain stem herniates
    if (this.ichRate > 0 && this.alive && !this.undead) {
      this.tbi += this.ichRate * dt;
      if (this.tbi > 0.55) this.knockOut(3, 0.9);
      if (this.tbi >= 1) this.kill('traumatic brain injury (intracranial haemorrhage)');
    }

    // ---------------- death ----------------
    if (this.alive && !this.undead) {
      if (this.arrestTime >= 0 && this.time - this.arrestTime > AGONAL_TIME) this.kill(this.arrestCause || 'cardiac arrest');
      else if (this.brainDamage >= 1) this.kill('hypoxic brain injury');
      else if (this.blood < BLOOD_VOLUME * 0.3) this.kill('exsanguination');
    }

    this.status = !this.alive
      ? 'dead'
      : this.arrestTime >= 0
        ? 'cardiac arrest'
        : !this.conscious
          ? 'unconscious'
          : lossFrac > 0.3 || this.mapF < 55 || this.spo2 < 0.8
            ? 'critical'
            : this.pain > 0.6 || lossFrac > 0.15
              ? 'injured'
              : this.wounds.length
                ? 'hurt'
                : 'healthy';
    this.applyToController(dt, lossFrac);
  }

  /** Cardiac filling impaired by pericardial blood (tamponade) and tension pneumothorax. */
  fillFactor() {
    const tamp = 1 - 0.85 * smoothstep(60, 220, this.cav.pericardium);
    let shift = 0;
    for (const s of ['L', 'R']) shift = Math.max(shift, smoothstep(0.35, 1, this.tensionP[s]));
    return tamp * (1 - 0.65 * shift);
  }

  /** Circulation, bleeding and the haemorrhagic-shock spiral (see the class comment). */
  circulation(dt) {
    const alive = this.alive;
    const arrested = this.arrestTime >= 0;
    const load = this.traumaLoad();
    // baroreflex: sympathetic drive rises within seconds as arterial pressure falls; massive
    // tissue injury blunts it (traumatic vasoplegia)
    const cMax = (1 - 0.35 * smoothstep(0.35, 1.1, load)) * this.autonomic;
    // (fear and pain add sympathetic tone, but the baroreflex still caps the pressure)
    const cT = alive && !arrested ? clamp((90 - this.mapF) / 25 + 0.3 * this.adrenaline, 0, 1) * cMax : 0;
    this.symp += (cT - this.symp) * clamp(dt / (cT > this.symp ? 2.5 : 8), 0, 1);
    const c = this.symp;
    // venoconstriction moves unstressed blood into the stressed (pressure-generating) pool;
    // without sympathetic tone the veins dilate and blood pools (neurogenic shock)
    const v0 = V_UNSTRESSED * (1 + 0.18 * (1 - this.autonomic)) * (1 - 0.28 * c);
    const vs = Math.max(0, this.blood - v0) / V_STRESSED;
    const vr = vs * this.fillFactor() * (1 + 0.15 * c); // venous return capacity (relative)
    const xV = Math.sqrt(vs); // venous / pulmonary driving pressure, sqrt(P / P0) (orifice flow)
    // ---- clotting: acute traumatic coagulopathy (Brohi 2003) appears with shock (hypoperfusion
    // activates protein C, consumes fibrinogen) and with severe tissue injury; within its limits low
    // flow (hypotension) lets clots form
    const coag = (1 - 0.6 * smoothstep(70, 40, this.mapF)) * (1 - 0.45 * smoothstep(0.2, 0.7, load));
    const clotRate = alive ? 1 + 1.5 * smoothstep(80, 40, this.mapF) : 0.3;
    const trees = this.trees;
    for (const t in trees) trees[t].S = trees[t].Sv = 0;
    let K = 0, Qv = 0;
    for (const w of this.wounds) {
      w.age += dt;
      w.spurtPhase += dt * (this.hr / 60);
      if (!w.bleeds.length) continue;
      if (w.tree === undefined) w.tree = w.seg ? limbTree(w.seg.name) : null;
      const share = w.partner ? 0.4 : 1;
      const pIn = w.pressure > 0, pOut = w.partner ? w.partner.pressure > 0 : false;
      for (const b of w.bleeds) {
        const cap = b.clotMax * coag;
        if (b.clot < cap) b.clot = Math.min(cap, b.clot + (dt / b.tau) * clotRate);
        else b.clot -= (b.clot - cap) * clamp(dt / 30, 0, 1);
        // direct pressure of a hand on the skin wound slows the external part
        const pf = b.art > 0.5 ? 0.45 : 0.25;
        b.pressF = share * (pIn ? pf : 1) + (1 - share) * (pOut ? pf : 1);
        b.qe = b.q * (1 - b.clot) * this.bleedScale;
        const qn = b.qe * (b.ext * b.pressF + 1 - b.ext);
        if (w.tree) {
          // conductance of the leak itself, without the shared feeding vessels: chosen so that a
          // single structure bleeds its nominal flow `q` at normal pressure
          if (b.sInt === undefined) {
            const def = LIMB_TREE[w.tree.slice(0, 3)];
            b.sInt = def.gc / Math.max(def.gc - b.full * b.art, 0.1 * def.gc);
            b.sIntV = def.gcv / Math.max(def.gcv - b.full * (1 - b.art), 0.1 * def.gcv);
          }
          const T = trees[w.tree] || (trees[w.tree] = { S: 0, Sv: 0, phi: 1, phiV: 1 });
          T.S += qn * b.art * b.sInt;
          T.Sv += qn * (1 - b.art) * b.sIntV;
        } else {
          K += qn * b.art;
          Qv += qn * (1 - b.art);
        }
      }
    }
    for (const t in trees) {
      // (the bleeding-rate setting scales the feeding vessels with the leaks, so a limb's
      // haemorrhage stays proportional to it: k*S*k*gc / (k*S + k*gc) = k * S*gc/(S+gc))
      const T = trees[t], gcv = LIMB_TREE[t.slice(0, 3)].gcv * this.bleedScale;
      T.phiV = gcv / (T.Sv + gcv);
      Qv += T.Sv * T.phiV;
    }
    // ---- venous / pulmonary bleeding is lost before it reaches the heart
    Qv *= xV;
    const vScale = Qv > 0.85 * vr * CO0 ? (0.85 * vr * CO0) / Qv : 1;
    Qv *= vScale;
    const inflow = Math.max(0, vr - Qv / CO0);
    this.inflow = inflow;
    this.venousCapacity = vr * CO0;
    // ---- pump: wounded myocardium x ischaemic myocardium, helped by sympathetic contractility
    const isch = 1 - 0.9 * smoothstep(12, 60, this.myoDebt);
    const pump = alive && !arrested ? this.cardiac * isch * (1 + 0.25 * c) : 0;
    const co = CO0 * heartOutput(inflow, pump);
    // ---- limb trees: leaks (conductance S) in series with the feeding artery (gc), so the tree
    // drains S*gc/(S+gc), at most gc, in proportion to the arterial pressure (veins likewise)
    let gT = 0;
    for (const t in trees) {
      const T = trees[t];
      const def = LIMB_TREE[t.slice(0, 3)];
      const gc = def.gc * (1 - 0.7 * (this.structSev[def.feeder + ' ' + t[3]] || 0)) * this.bleedScale;
      T.phi = gc / (T.S + gc);
      gT += (T.S * T.phi) / MAP0;
    }
    // ---- arterial pressure: cardiac output drains through the systemic resistance, the limb
    // trees (viscous, ~P) and the central arterial leaks (orifice flow ~ sqrt(P)):
    // (Gs + GT)*P + K*sqrt(P) = CO
    const gs = (G_SVR * (1 + 0.7 * (1 - this.autonomic))) / (1 + 0.8 * c);
    const g = gs + gT;
    K /= SQ_MAP0;
    const x = co > 0 ? (-K + Math.sqrt(K * K + 4 * g * co)) / (2 * g) : 0;
    this.map = x * x;
    this.co = co;
    this.perfusion = co / CO0;
    // Windkessel: the arterial pressure follows the flows with a short lag
    this.mapF += (this.map - this.mapF) * clamp(dt / 0.8, 0, 1);
    // after arrest the pressures equalise at the (falling) mean filling pressure; while the heart
    // still beats the leaks follow the solved arterial pressure itself (which keeps the arterial
    // leaks within the cardiac output)
    const xA = (arrested || !alive ? Math.max(x, Math.sqrt(PV0 * vs)) : x) / SQ_MAP0;
    const post = alive ? 1 : Math.exp(-(this.time - this.deathTime) / 40); // post-mortem drainage stops
    // ---- distribute the flows
    let ext = 0, int = 0, leakArt = 0, leakVen = 0;
    const cav = this.cav;
    for (const w of this.wounds) {
      if (!w.bleeds.length) {
        if (!w.channel) w.extNow = w.intNow = 0;
        w.pressure = Math.max(0, w.pressure - dt * 4);
        continue;
      }
      const share = w.partner ? 0.4 : 1;
      let wExt = 0, wExtIn = 0, wInt = 0;
      const pIn = w.pressure > 0, pOut = w.partner ? w.partner.pressure > 0 : false;
      const T = w.tree ? trees[w.tree] : null;
      for (const b of w.bleeds) {
        // arterial drive: sqrt(P / P0) for central leaks, (P / P0) through a limb tree
        const dA = T ? xA * xA * b.sInt * T.phi : xA;
        const fa = b.qe * b.art * dA * post, fv = b.qe * (1 - b.art) * xV * vScale * post * (T ? b.sIntV * T.phiV : 1);
        const f = fa + fv;
        const m = b.ext * b.pressF + 1 - b.ext;
        leakArt += fa * m;
        leakVen += fv * m;
        const pf = b.art > 0.5 ? 0.45 : 0.25;
        const fe = f * b.ext;
        wExtIn += fe * share * (pIn ? pf : 1);
        wExt += fe * (1 - share) * (pOut ? pf : 1);
        const fi = f * (1 - b.ext);
        wInt += fi;
        if (fi > 0) {
          const key = b.cav === 'pleura' ? 'pleura' + b.side : b.cav;
          cav[key] = (cav[key] || 0) + fi * dt;
          if (b.air) cav.airway += fi * b.air * dt;
        }
      }
      w.extNow = wExtIn;
      w.intNow = wInt;
      if (w.partner) w.partner.extNow = wExt;
      ext += wExtIn + wExt;
      int += wInt;
      w.pressure = Math.max(0, w.pressure - dt * 4);
    }
    this.externalRate = ext;
    this.bleedRate = ext + int;
    this.leakArt = leakArt;
    this.leakVen = leakVen;
    this.blood = Math.max(0, this.blood - (ext + int) * dt);
    this.lostExternal += ext * dt;
    this.lostInternal += int * dt;

    // ---- myocardial oxygen debt: supply = coronary perfusion (diastolic pressure) x arterial O2
    // content, demand rises with heart rate; severe injury depresses the myocardium further
    if (alive && !arrested) {
      const coronary = (clamp(this.mapF / 60, 0, 1.2) * smoothstep(0.35, 0.9, this.spo2)) / (0.6 + (0.4 * this.hr) / 72);
      if (coronary < 0.65) this.myoDebt += dt * ((0.65 - coronary) / 0.65) * (1 + 0.8 * load);
      else this.myoDebt = Math.max(0, this.myoDebt - dt * 0.1);
    }

    // ---- heart rate: baroreflex tachycardia; terminal bradycardia when the ventricle runs empty
    // (Bezold-Jarisch reflex) or the myocardium is hypoxic; cervical cord lesions cut the cardiac
    // accelerator nerves
    let hrT = 0;
    if (alive && !arrested) {
      const cs = this.cardiacSymp;
      hrT = (60 + 12 * cs) + 100 * c * (0.2 + 0.8 * cs) + 22 * this.pain + 25 * this.adrenaline * cs + (this.cardiac < 0.6 ? 20 : 0);
      hrT *= (0.35 + 0.65 * smoothstep(0.03, 0.15, inflow)) * (0.35 + 0.65 * smoothstep(0.3, 0.6, this.spo2)) * (0.4 + 0.6 * isch);
      hrT = clamp(hrT, 22, 185);
    }
    this.hr += (hrT - this.hr) * clamp(dt * 0.8, 0, 1);
    if (arrested || !alive) this.hr = Math.min(this.hr, hrT + this.hr * Math.exp(-dt * 3));
    // ---- blood pressure readout: pulse pressure follows the stroke volume
    const sv = this.hr > 5 ? co / (this.hr / 60) : 0;
    const pp = 45 * clamp(sv / 70, 0, 1.4) * (1 + 0.4 * c); // sympathetic contractility widens it
    this.bpSys = this.mapF + (2 / 3) * pp;
    this.bpDia = Math.max(0, this.mapF - pp / 3);

    // ---- cardiac arrest: no effective circulation (pulseless: PEA / empty heart), pump failure,
    // ventricular fibrillation, or a hypoxic heart (asystole)
    if (alive && !arrested) {
      const pulseless = this.mapF < 20 || co < 0.06 * CO0;
      this.lowFlowTime = pulseless ? this.lowFlowTime + dt : 0;
      this.hypoxicTime = this.spo2 < 0.32 ? this.hypoxicTime + dt : 0;
      if (this.lowFlowTime > 6) this.cardiacArrest(this.arrestReason());
      else if (this.hypoxicTime > 8) this.cardiacArrest(this.arrestReason(true));
    }
    if (this.arrestTime >= 0) {
      const t = this.time - this.arrestTime;
      this.rhythm = !alive ? 'asystole' : this.vf ? 'VF' : t < AGONAL_TIME * 0.6 ? 'PEA' : 'asystole';
    } else {
      this.rhythm = this.hr > 100 ? 'sinus tachycardia' : this.hr < 60 ? 'sinus bradycardia' : 'sinus';
    }
  }

  /** Dominant mechanism at the moment the circulation stops. */
  arrestReason(hypoxic = false) {
    const loss = 1 - this.blood / BLOOD_VOLUME;
    if (hypoxic || (this.spo2 < 0.6 && loss < 0.3)) {
      if (this.breathing < 0.1) return 'respiratory paralysis (high cervical spinal cord injury)';
      if (this.airway < 0.4) return 'asphyxia (airway obstruction, aspirated blood)';
      if (Math.max(this.tensionP.L, this.tensionP.R) > 0.5) return 'tension pneumothorax';
      // lungs largely intact but too little air moving: the drive or the airway failed
      if (0.5 * (this.lungs.L + this.lungs.R) > 0.6 && this.breathing * this.airway < 0.5) return 'hypoventilation (cervical spinal cord / airway injury)';
      return 'respiratory failure (lung injuries)';
    }
    if (this.cav.pericardium > 120 && loss < 0.3) return 'cardiac tamponade';
    if (this.cardiac < 0.3 && loss < 0.25) return 'heart wound (pump failure)';
    // haemorrhage: either the volume is gone, or the leaks take most of the cardiac output
    if (loss > 0.22 || this.bleedRate > 0.35 * CO0) return 'exsanguination (haemorrhagic shock)';
    if (Math.max(this.tensionP.L, this.tensionP.R) > 0.5) return 'tension pneumothorax (obstructive shock)';
    if (this.autonomic < 0.5) return 'neurogenic shock (spinal cord injury)';
    return 'traumatic shock (multiple injuries)';
  }

  cardiacArrest(cause) {
    if (this.arrestTime >= 0 || this.undead) return;
    this.arrestTime = this.time;
    this.arrestCause = cause;
    this.log(`Cardiac arrest (${cause})`, 3);
    this.events.push({ type: 'arrest', cause });
  }

  ventricularFibrillation(reason) {
    if (this.vf || this.arrestTime >= 0 || !this.alive) return;
    this.vf = true;
    this.cardiacArrest(`ventricular fibrillation (${reason})`);
  }

  /** Lungs, airway and arterial oxygen. */
  respire(dt) {
    const alive = this.alive;
    // pneumothorax develops over tens of seconds; a tension pneumothorax keeps inflating
    for (const s of ['L', 'R']) {
      // a valve-like leak keeps pumping air in with every breath: the lung collapses completely and
      // the pleural pressure rises over minutes until it shifts the mediastinum and kinks the great
      // veins (obstructive shock); an open chest wound vents and cannot tension
      if (this.tension[s] && !this.openChest[s]) {
        this.ptxTarget[s] = 1;
        if (this.ptx[s] > 0.85) this.tensionP[s] = Math.min(1, this.tensionP[s] + (dt / 90) * (0.3 + this.breathing));
      }
      if (this.ptx[s] < this.ptxTarget[s]) this.ptx[s] = Math.min(this.ptxTarget[s], this.ptx[s] + dt * this.ptxRate[s]);
      // a pleural cavity holds up to ~3 L of blood; the haemothorax compresses the lung
      const htx = smoothstep(300, 1800, this.cav['pleura' + s]);
      // (a flail segment moves in when the chest expands: that side draws in little air)
      this.lungs[s] = this.parench[s] * (1 - 0.92 * this.ptx[s]) * (1 - 0.8 * htx) * this.chestWall[s];
      // the trauma scores grade what the chest injury has become: massive haemothorax (> 1 L) is
      // AIS 4, a tension pneumothorax AIS 5
      if (this.cav['pleura' + s] > 1000) this.gradeOnce('chest', 4, 'massive haemothorax');
      if (this.tensionP[s] > 0.5) this.gradeOnce('chest', 5, 'tension pneumothorax');
    }
    // airway: tracheal injury, aspirated blood (cleared by coughing while conscious) and an
    // expanding neck haematoma
    const c = this.cav;
    if (alive && c.airway > 0) {
      const clear = this.conscious ? 4 : 0.4;
      c.airway = Math.max(0, c.airway - clear * dt);
      if (this.conscious && c.airway > 10) {
        this.coughTimer -= dt;
        if (this.coughTimer <= 0) {
          this.coughTimer = 1.2 + 2 * this.rng();
          this.events.push({ type: 'cough', blood: true });
        }
      }
    }
    this.airway = this.airwayInjury * (1 - 0.85 * smoothstep(40, 300, c.airway)) * (1 - 0.7 * smoothstep(150, 600, c.neck));
    // ventilation: drive x muscles x airway; the unconscious airway partly obstructs (tongue);
    // without brain-stem perfusion only agonal gasps remain
    const agonal = this.arrestTime >= 0 || this.delivery < 0.15;
    let vent = alive ? this.breathing * this.airway * (this.conscious ? 1 : 0.85) : 0;
    // broken ribs hurt with every breath: it is kept shallow while awake
    if (this.conscious) vent *= 1 - this.splint;
    if (agonal) vent *= 0.15;
    this.vent = vent;
    const lungFn = 0.5 * (this.lungs.L + this.lungs.R);
    // alveolar gas equation on room air (PaCO2 rises as ventilation falls); one healthy lung can
    // carry the resting gas exchange, less than about a third of the lungs cannot
    // open chest wounds break the bellows: air enters through the wound instead of the trachea
    // (mediastinal flutter with one, almost no tidal volume with both sides open)
    const bellows = this.openChest.L && this.openChest.R ? 0.35 : this.openChest.L || this.openChest.R ? 0.85 : 1;
    const ventEff = vent * bellows * Math.min(1, lungFn / 0.35);
    const pTarget = Math.max(0, 150 - 50 / Math.max(ventEff, 0.05));
    // O2 stores (lungs, blood) buffer apnoea: alveolar PO2 falls at the rate oxygen is consumed
    // (~2 min from normal to SpO2 50 % in apnoea); agitation raises consumption
    if (pTarget > this.pAlv) this.pAlv += (pTarget - this.pAlv) * clamp(dt / 6, 0, 1);
    else this.pAlv -= Math.min((this.pAlv - pTarget) / 8, 0.5 * (1 + 0.4 * this.adrenaline)) * dt;
    // venous admixture: blood through perfused but collapsed lung is not oxygenated (hypoxic
    // pulmonary vasoconstriction diverts ~40 % of it). Mixed-venous blood is the more desaturated
    // the lower the cardiac output (O2 extraction rises), so shunt and shock compound.
    const shunt = 0.03 + 0.6 * clamp(1 - lungFn, 0, 1);
    const extraction = clamp(0.25 / Math.max(this.perfusion, 0.3), 0.25, 0.6);
    const sa = clamp(o2Saturation(this.pAlv) - (shunt * extraction) / (1 - shunt), 0.02, 1);
    // arterial blood follows within about one circulation time
    this.spo2 += (sa - this.spo2) * clamp(dt / 8, 0, 1);
    this.pao2 = this.pAlv;
  }

  /** Brain oxygen delivery, consciousness and hypoxic brain damage. */
  cerebral(dt) {
    // cerebral blood flow is autoregulated down to ~55 mmHg, then follows the pressure
    const cbf = clamp((this.mapF - 15) / 40, 0, 1.1);
    const delivery = cbf * clamp(this.spo2 / 0.97, 0, 1.03);
    this.delivery = delivery;
    // syncope within ~5-10 s of no flow (Rossen 1943); irreversible damage after ~5 min
    if (delivery < 0.5) this.hypoxia += dt * (0.5 - delivery) * 1.8;
    else this.hypoxia = Math.max(0, this.hypoxia - dt * 0.4);
    if (delivery < 0.25 && this.alive) this.brainDamage += dt * ((0.25 - delivery) / 0.25) / 300;

    if (this.koTimer > 0) this.koTimer = Math.max(0, this.koTimer - dt);
    const faint = this.hypoxia > 4.5;
    if (this.alive) {
      const shouldBeConscious = this.koTimer <= 0 && !faint && this.brainDamage < 0.5;
      if (this.conscious && !shouldBeConscious) {
        this.conscious = false;
        this.events.push({ type: 'unconscious' });
        if (faint) this.log(this.spo2 < 0.75 ? 'Lost consciousness (hypoxia)' : 'Lost consciousness (cerebral hypoperfusion)', 2);
      } else if (!this.conscious && shouldBeConscious && this.hypoxia < 2) {
        this.conscious = true;
        this.events.push({ type: 'wake' });
        this.log('Regained consciousness', 1);
      }
    }
  }

  applyToController(dt, lossFrac) {
    const ctl = this.ctl;
    if (!ctl) return;
    ctl.alive = this.alive;
    ctl.conscious = this.alive && this.conscious;
    ctl.pain = this.pain;
    this.breathingOutput(dt, lossFrac);
    // weakness: hypovolaemia, low arterial pressure and hypoxaemia starve the muscles and the brain
    const weak = this.undead
      ? 0
      : clamp(
          0.8 * smoothstep(0.18, 0.45, lossFrac) + 0.8 * smoothstep(70, 35, this.mapF) + 0.5 * smoothstep(0.88, 0.6, this.spo2) + 0.4 * smoothstep(0.75, 0.5, this.delivery),
          0,
          1,
        );
    const P = this.paralysis;
    const m = (n) => this.muscle[n] || 0;
    const broken = (n) => this.fractures.some((f) => f.seg === n && f.physical);
    const fracLeg = (s) => (broken('thigh' + s) ? 0.04 : broken('shin' + s) ? 0.08 : this.fractures.some((f) => f.seg === 'foot' + s) ? 0.55 : 1);
    const fracArm = (s) => (broken('upperArm' + s) ? 0.05 : broken('forearm' + s) ? 0.25 : this.fractures.some((f) => f.seg === 'hand' + s) ? 0.6 : 1);
    const pelvisFx = this.fractures.some((f) => f.label === 'pelvis' || f.label === 'pelvis (ilium)' || f.label === 'sacrum') ? 0.3 : 1;
    for (const s of ['L', 'R']) {
      const muscle = 1 - 0.55 * m('thigh' + s) - 0.35 * m('shin' + s) - 0.2 * m('foot' + s) - 0.25 * m('pelvis');
      // pain inhibits the muscles a little (fractures and torn muscle are modelled separately)
      const limbPain = this.undead ? 0 : clamp(((this.limbPain['thigh' + s] || 0) + (this.limbPain['shin' + s] || 0) + (this.limbPain['foot' + s] || 0)) * 0.12, 0, 0.25);
      ctl.legStrength[s] = clamp(muscle * fracLeg(s) * pelvisFx * P.legs * this.nerve['leg' + s] * (1 - 0.85 * weak) * this.buckle[s] * (1 - limbPain), 0, 1);
      const am = 1 - 0.5 * m('upperArm' + s) - 0.4 * m('forearm' + s) - 0.25 * m('hand' + s);
      ctl.armStrength[s] = clamp(am * fracArm(s) * (s === 'L' ? P.armsL : P.armsR) * this.nerve['arm' + s] * (1 - 0.7 * weak) * this.buckle.arms[s], 0, 1);
    }
    ctl.spineStrength = clamp(P.trunk * (1 - 0.7 * weak) * this.buckle.trunk * (1 - 0.3 * m('abdomen')), 0, 1);
    ctl.neckStrength = clamp(P.neck * (1 - 0.6 * weak) * (1 - 0.6 * this.neckSprain), 0, 1);
    ctl.balanceSkill = this.undead ? 1 : clamp((1 - 0.7 * this.concussion) * (1 - 0.6 * weak) * (1 - 0.3 * this.pain), 0.05, 1);
    this.concussion = Math.max(0, this.concussion - dt / 240);
    if (this.undead) {
      ctl.wounds = [];
      return;
    }
    // wounds worth clutching (most painful first), excluding ones on a useless arm
    const list = [];
    for (const w of this.wounds) {
      if (w.kind === 'exit' && w.partner) continue;
      const pr = (w.pain || 0) * (0.4 + 0.6 * Math.exp(-w.age / 60)) + (w.extNow || 0) * 0.08;
      if (pr < 0.12) continue;
      list.push({ wound: w, body: w.body, segment: w.seg, local: w.local, normal: w.normal, priority: pr });
    }
    list.sort((a, b) => b.priority - a.priority);
    ctl.wounds = list.slice(0, 3);
  }

  /**
   * Breathing motion for the controller: deeper and faster with shock and hypoxia (air hunger),
   * none with respiratory paralysis, and in the dying brain stem only agonal gasps: sudden deep
   * breaths every few seconds, without the rhythm of normal breathing. (The controller ignores
   * ctl.respiration while unconscious; see the class comment.)
   */
  breathingOutput(dt, lossFrac) {
    const ctl = this.ctl;
    const distress = clamp(Math.max(smoothstep(0.1, 0.4, lossFrac), (0.95 - this.spo2) * 4, smoothstep(80, 50, this.mapF), 1 - this.airway), 0, 1);
    const agonal = this.alive && (this.arrestTime >= 0 || this.delivery < 0.15) && this.breathing > 0.05;
    if (!this.alive) {
      ctl.respiration = 0;
      ctl.respRateBoost = 0;
      this.rr = 0;
    } else if (agonal) {
      this.gaspTimer -= dt;
      if (this.gaspT > 0) this.gaspT = Math.max(0, this.gaspT - dt);
      else if (this.gaspTimer <= 0) {
        this.gaspT = 1.5;
        this.gaspTimer = 3.5 + 5 * this.rng();
        this.events.push({ type: 'gasp' });
      }
      ctl.respiration = this.gaspT > 0 ? 1.4 * this.breathing * Math.sin((Math.PI * (1.5 - this.gaspT)) / 1.5) : 0;
      ctl.respRateBoost = 27; // one fast, deep breath per gasp
      this.rr = 60 / (this.gaspTimer + 1.5 + 4);
    } else {
      // the breathing effort continues against an obstructed airway
      ctl.respiration = this.breathing * (1 + 0.6 * distress);
      ctl.respRateBoost = 22 * distress;
      this.rr = this.breathing > 0.05 ? clamp(13 + 10 * this.pain + 22 * distress, 8, 40) : 0;
    }
  }

  /** A conscious hand resting on a bleeding wound presses on it (direct pressure). */
  handPressure() {
    if (!this.conscious) return;
    for (const s of ['L', 'R']) {
      const hand = this.rd.segments['hand' + s].body;
      const hp = hand.localToWorld(_v1.set(s === 'L' ? -0.012 : 0.012, -0.03, 0), _v1);
      for (const w of this.wounds) {
        if (w.extRate <= 0 || w.body === hand) continue;
        w.body.localToWorld(w.local, _v2);
        if (_v2.distanceTo(hp) < 0.065) w.pressure = 1;
      }
    }
  }

  /**
   * Blunt trauma from the physics impacts of the last step. Contacts between this ragdoll and
   * other bodies (or the floor) are converted to peak forces; `materialOf(shape)` names the other
   * surface.
   */
  processImpacts(world) {
    for (const imp of world.impactList) {
      const A = imp.bodyA, B = imp.bodyB;
      if (!B && this.time < 1) continue; // feet settling onto the floor after spawning
      // deliberate floor contacts of the limbs while getting up are not trauma
      if (!B && imp.speed < 4 && this.ctl && this.ctl.mode === 'getup') continue;
      const segA = this.rd.segmentOf(A), segB = B ? this.rd.segmentOf(B) : null;
      if (!segA && !segB) continue;
      if (segA && segB) continue; // self-contact
      const mine = segA ? A : B;
      const other = segA ? B : A;
      const otherShape = segA ? imp.shapeB : imp.shapeA;
      if (imp.speed < 1.4) continue;
      const seg = mine.userData.segment;
      const k = segKind(seg.name);
      const ground = !other;
      // footfalls: a sole landing on the floor (stepping, staggering, even a ~1 m jump down) loads
      // the heel pad and shoe with 2-3 body weights; that is locomotion, not trauma. (This is the
      // only footfall rule: harder landings, objects striking the foot and side impacts go through
      // the foot's tolerances in BLUNT.)
      if (ground && k === 'foot' && imp.speed < 5 && mine.localDirToWorld(_v0.set(0, -1, 0), _v1).y < -0.6) continue;
      let material = ground ? 'concrete' : otherShape && otherShape.material ? otherShape.material : 'default';
      if (other && other.userData && other.userData.ragdoll) material = 'flesh';
      // the local load is limited by the momentum of the struck part itself
      const mEff = mine.mass * (k === 'head' ? 1.25 : 2.5);
      let J = Math.min(imp.impulse, mEff * (imp.speed + 0.5));
      // a flat floor spreads the load: broad body parts are loaded far less than by a
      // concentrated blow of the same impulse
      if (ground) J *= GROUND_SPREAD[k] ?? 0.5;
      // contact normal pointing from the other surface into this body
      const n = imp.normal.clone();
      if (!segA) n.negate();
      this.blunt(mine, imp.point, n, J, imp.speed, material, other);
    }
  }

  // ------------------------------------------------------------------------------------------
  // Melee trauma

  /**
   * A melee blow; game/melee.js works out the collision. body: the struck body; pointW: where it
   * landed on the skin; dirW: unit direction into the body. info (from the collision):
   *   kind 'blunt' | 'cut' | 'stab', weapon, label;
   *   vn: closing speed (m/s), speed: relative speed (m/s);
   *   J: impulse the tissue takes (N s; a part crushed against the floor takes the striker's whole
   *     momentum), Jw: the blow's impulse vector on the free part (head kinematics), energy (J);
   *   mHard: striker mass behind the force peak (kg), mB: effective mass of the struck part (kg; huge
   *     when the floor is behind it), kW: striker stiffness (N/m), maxForce (N), area (m²),
   *   span: contact length along the striker (m), radius (m), axisW: striker axis or null,
   *   backed: 0..1 how much the floor is behind the struck part, sharpness;
   *   cut: { pathW, normalsW, depth, length } for a cut (the line the edge drew on the skin);
   *   stab: { dirW, energy, length, width, edgeW } for a stab.
   * Blunt: peak force F = v sqrt(k m) from the tissue's and the striker's stiffness k (in series) and
   * the reduced mass m of the colliding parts, compared with the tolerances of the bones under it
   * (each rib, the skull by region, the face, long bones, which break physically); the brain is hurt
   * by the head's acceleration (rotation above all: knockouts) and by fractures pressed into it.
   * Returns { kind, force (N), tau (s), energy (J), fractures: [{label, seg, pointW, ...}], ko,
   * killed, wounds, structures: [labels], depth (m), armor, damage (undead hp) }.
   */
  meleeHit(body, pointW, dirW, info) {
    const seg = body.userData && body.userData.segment;
    if (!seg) return null;
    const res = { kind: info.kind, force: 0, tau: 0, energy: info.energy || 0, fractures: [], ko: false, killed: false, wounds: [], structures: [], depth: 0, armor: null, damage: 0 };
    const wasConscious = this.conscious, wasAlive = this.alive;
    const c = {
      body, seg, name: seg.name, k: segKind(seg.name), pointW, dirW, info, res,
      pB: this.toBind(body, pointW, new Vec3()), dB: body.worldDirToLocal(dirW, new Vec3()).normalize(),
      bleeds: [], woundPain: 0, painAdd: 0, vital: 0, log: [], scale: 1,
    };
    const armor = this.meleeArmor(c);
    if (armor === 'stopped') {
      this.reactToHit(seg.name, 0.3, dirW, 'blunt');
      this.log(`${info.label || 'Blow'} stopped by the ${res.armor}`, 1);
    } else if (info.kind === 'cut' && info.cut) this.meleeCut(c);
    else if (info.kind === 'stab' && info.stab) this.meleeStab(c);
    else this.meleeBlunt(c);
    if (this.undead && this.alive && armor !== 'stopped') {
      // wrecking a zombie: the tissue destroyed plus what it hit, more where it matters
      const dmg = (Math.pow(Math.max(res.energy, 0), 0.7) + Math.min(c.vital, UNDEAD_VITAL_MAX)) * (UNDEAD_LOC[c.k] ?? 1) * c.scale;
      this.hp -= dmg;
      res.damage = dmg;
      if (this.hp <= 0) this.kill('destroyed');
    }
    res.ko = wasConscious && !this.conscious && this.alive;
    res.killed = wasAlive && !this.alive;
    return res;
  }

  /** Armour: a helmet or a vest stops a blade; a helmet spreads a blow over the skull, a vest softens it. */
  meleeArmor(c) {
    const a = this.armor;
    if (!a || !this.alive) return null;
    const blunt = c.info.kind === 'blunt';
    if (c.k === 'head' && a.helmet > 0) {
      c.res.armor = 'helmet';
      if (!blunt) return 'stopped';
      c.scale = 0.3;
      return 'reduced';
    }
    if ((c.k === 'chest' || c.k === 'abdomen') && a.vest > 0) {
      c.res.armor = 'vest';
      if (!blunt) return 'stopped';
      c.scale = 1 - 0.6 * a.vest;
      return 'reduced';
    }
    return null;
  }

  /**
   * A hit reaction that lasts: hold the hit-reaction buckles down (legs / legL / legR / trunk /
   * armL / armR: floor 0..1) from `t0` s after now for `dur` s, adding `pain` (on `painSeg`) when it
   * starts. A liver shot drops the body to its knees after a moment; a concussive blow leaves
   * rubbery legs; broken ribs fold the trunk.
   */
  addHold(h) {
    const t0 = this.time + (h.t0 || 0);
    this.holds.push({ ...h, t0, t1: t0 + (h.dur || 1) });
  }

  applyHolds() {
    const B = this.buckle;
    for (const h of this.holds) {
      if (this.time < h.t0) continue;
      if (h.pain && !h.painDone) {
        h.painDone = true;
        this.addPain(h.pain, h.painSeg);
        if (this.conscious && this.alive) this.events.push({ type: 'grunt', intensity: 1 });
      }
      const legs = h.legs ?? 1;
      B.L = Math.min(B.L, h.legL ?? legs);
      B.R = Math.min(B.R, h.legR ?? legs);
      if (h.trunk !== undefined) B.trunk = Math.min(B.trunk, h.trunk);
      if (h.armL !== undefined) B.arms.L = Math.min(B.arms.L, h.armL);
      if (h.armR !== undefined) B.arms.R = Math.min(B.arms.R, h.armR);
    }
    this.holds = this.holds.filter((h) => this.time < h.t1);
  }

  meleeBlunt(c) {
    const { info, res, k, name } = c;
    c.region = k === 'head' ? headRegion(c.pB) : k;
    // tissue under the striker (a broad sole bears on the bony face around the nose)
    const tk = c.region === 'nose' ? ((info.area || 0) > 0.0035 ? 'face' : 'nose') : FACE_BONE[c.region] ? 'face' : k;
    const kS = 1 / (1 / (MELEE_K[tk] ?? 0.2e6) + 1 / (info.kW || 1e6));
    const muP = (info.mHard * info.mB) / (info.mHard + info.mB);
    const F0 = Math.min(info.vn * Math.sqrt(kS * muP), info.maxForce ?? Infinity);
    const F = F0 * c.scale;
    c.F = F;
    c.tau = Math.PI * Math.sqrt(muP / kS);
    res.force = F;
    res.tau = c.tau;
    res.energy *= c.scale;
    this.tissueEnergy += res.energy;
    if (res.armor === 'helmet' && F0 > 8000) {
      this.armor.helmet--;
      this.events.push({ type: 'armor', part: 'helmet', left: this.armor.helmet });
      if (this.armor.helmet === 0) this.log('Helmet knocked off', 2);
    }
    if (k === 'head') this.bluntHead(c);
    else if (k === 'neck') this.bluntNeck(c);
    else if (k === 'chest' || k === 'abdomen') this.bluntTrunk(c);
    else this.bluntLimb(c);
    // contusion where it landed (a deep one bleeds into the tissue: haematoma); it carries the pain
    // and the bleeding of what broke under it
    const T = BLUNT[k];
    const sev = clamp((F - T.bruise * 0.6) / (2.5 * T.bruise), 0, 1);
    if (F > T.bruise * 2) c.bleeds.push(this.makeBleed(0.25 * sev, 'tissue', { ext: 0, cav: 'tissue' }));
    if (sev > 0 || c.bleeds.length || c.woundPain > 0) {
      const nOut = c.dB.clone().negate();
      const w = this.addWound({
        body: c.body, seg: c.seg, kind: 'bruise', local: c.body.worldToLocal(c.pointW, new Vec3()), normal: nOut, dir: c.dB.clone(),
        radius: 0.016 + 0.024 * sev + 0.12 * (info.span || 0), severity: clamp(0.3 + sev, 0, 1), bleeds: c.bleeds,
        pain: 0.05 + 0.5 * sev + c.woundPain, cause: info.label || 'blow', energy: res.energy,
      });
      res.wounds.push(w);
    }
    this.addPain(PAIN_BY_SEGMENT[k] * (0.1 + 0.9 * sev) + c.painAdd, name);
    this.muscle[name] = clamp(Math.max(this.muscle[name] || 0, 0.3 * sev), 0, 1);
    if (F > T.bruise * 1.3 || c.log.length) {
      const worst = c.log.reduce((m, x) => Math.max(m, x[1]), sev > 0.5 ? 2 : 1);
      this.log(`${info.label || 'Blow'} to the ${SEGMENT_LABEL[name] || name} (${(F / 1000).toFixed(1)} kN)`, worst);
      this.addAIS(issRegion(name), sev > 0.6 ? 2 : 1, 'contusion');
    }
    for (const [t, s] of c.log) this.log(`  ${t}`, s);
    if (F > T.bruise * 0.7) this.reactToHit(name, clamp(F / (REACT_F[k] || 4000), 0.12, 1.2), c.dirW, 'blunt');
  }

  /** A blow to the head: skull and facial bones, the brain (knockout, injury), the neck. */
  bluntHead(c) {
    const { info, F } = c;
    const area = info.area || 0.002;
    let worst = this.headSite(c, c.region, c.pB, F, area);
    // pinned against the floor (a stamp), the head is crushed between the blow and the floor
    const backed = info.backed || 0;
    if (backed > 0.3) {
      const q = new Vec3().subVectors(HEAD_CENTRE, c.pB).add(HEAD_CENTRE);
      const r2 = this.headSite(c, headRegion(q), q, F * backed, 0.0025, true);
      if (r2 && (!worst || r2.x > worst.x)) worst = r2;
    }
    // the scalp splits over the bone; the brow and the cheekbone split under a punch
    if ((SKULL_REGIONS.has(c.region) && F > 3800) || ((c.region === 'cheek' || (c.region === 'forehead' && c.pB.y < 1.715)) && F > 2600)) this.scalpLaceration(c, c.pB, F / 3800);
    if (!this.alive) return;
    // the brain: the head's acceleration (its rotation above all) knocks out; a pinned head cannot
    // accelerate, the brain is compressed instead
    const kin = this.headKinematics(c.body, c.pointW, info.Jw, c.tau);
    let s = Math.hypot(kin.wy / KO_AXIAL, kin.wx / KO_SAGITTAL, kin.wz / KO_CORONAL, kin.acc / 9.81 / KO_G) * (KO_REGION[c.region] ?? 1) * (1 - 0.8 * backed);
    if (backed > 0.3) s = Math.max(s, (1.3 * F * backed) / boneTolerance(BONE_TOL.occiput, 0.0025));
    if (worst) s += worst.depressed ? 1.2 : 0.4;
    s *= 1 + 0.6 * this.concussion; // a concussed brain goes out more easily
    this.concussion = clamp(this.concussion + 0.25 * s * s, 0, 1);
    c.res.head = { load: s, omega: kin.omega, g: kin.acc / 9.81 };
    if (this.rng() < logistic((s - 1) / 0.1)) this.knockOut(4 + 30 * clamp(s - 0.85, 0, 2) + 8 * this.rng(), clamp(0.4 + 0.3 * s, 0, 1));
    else if (s > 0.55) {
      // rubbery legs: a concussive blow that does not quite knock out (near the threshold: a flash
      // knockdown)
      const a = clamp((s - 0.55) / 0.45, 0, 1);
      this.addHold({ legs: 0.85 - 0.5 * a * a, dur: 0.4 + 1.4 * a });
    }
    if (s > 1.3) this.tbi += 0.08 * (s - 1.3); // diffuse axonal injury
    if (backed > 0.3) this.tbi += 0.1 * clamp((F * backed) / 8000, 0, 2); // crushed
    if (s > 0.5) {
      c.log.push([s > 1 ? 'concussion' : 'mild concussion', 2]);
      this.addAIS('head', s > 1.6 ? 3 : 2, 'concussion');
    }
    // the neck: a violent twist of the head sprains it, an extreme one breaks it
    const om = kin.omega * (1 - backed);
    if (om > 60) {
      const sp = clamp((om - 60) / 60, 0.2, 1);
      if (sp > this.neckSprain) {
        this.neckSprain = sp;
        c.log.push(['cervical sprain (whiplash)', 1]);
        this.addAIS('head', 1, 'cervical sprain');
      }
      this.addPain(0.4 * sp, 'neck');
      if (om > 110 && this.rng() < smoothstep(110, 170, om)) this.cervicalFracture(c, 0.35);
    }
    this.checkBrain(c);
  }

  /**
   * What a blow does to the head (with the neck behind it): angular velocity (rad/s) in the head's
   * frame (wx nodding, wy turning about the vertical, wz tilting sideways), speed (m/s) and mean
   * acceleration (m/s²) over the contact.
   */
  headKinematics(body, pointW, Jw, tau) {
    if (!Jw) return { omega: 0, wx: 0, wy: 0, wz: 0, dv: 0, acc: 0 };
    const r = _v0.subVectors(pointW, body.pos);
    const L = _v1.crossVectors(r, Jw);
    body.invInertiaMul(L, _v2);
    body.worldDirToLocal(_v2, _v2).scale(1 / HEAD_ROT_COUPLING);
    const dv = Jw.length() / (body.mass * HEAD_LIN_COUPLING);
    return { omega: _v2.length(), wx: _v2.x, wy: _v2.y, wz: _v2.z, dv, acc: dv / Math.max(tau, 1e-3) };
  }

  /**
   * Skull or facial fracture where a blow (or, under a stamp, the floor) bears on the head at bind
   * point p with force F (N). Returns { region, depressed, x: F / tolerance } for a skull fracture.
   */
  headSite(c, region, p, F, area, floorSide = false) {
    const seg = c.seg;
    const pW = floorSide ? c.body.localToWorld(_v0.subVectors(p, this.bodyBindPos(c.body)), new Vec3()) : c.pointW.clone();
    if (SKULL_REGIONS.has(region)) {
      const prior = this.skullFx.length > 0;
      // (a skull already broken gives way more easily)
      const thr = boneTolerance(BONE_TOL[region], area) * (prior ? 0.75 : 1);
      if (!(this.rng() < logistic((F - thr) / (0.1 * thr)))) return null;
      const x = F / thr;
      const depressed = x > 1.6 || (area < 0.0015 && x > 1.25) || (prior && x > 1.2);
      this.skullFx.push({ region, depressed, pB: p.clone() });
      // the brain under it: a depressed fragment contuses and tears it
      this.tbi += depressed ? 0.3 + 0.2 * Math.max(0, x - 1.25) * (region === 'temple' ? 1.25 : 1) : 0.08;
      c.vital += depressed ? 40 : 15;
      // haematoma: the middle meningeal artery runs under the temple (epidural), bridging veins tear
      if (!this.undead && this.rng() < (region === 'temple' ? 0.85 : depressed ? 0.55 : 0.15)) {
        this.ichRate = Math.max(this.ichRate, 0.0025 + 0.004 * clamp(x - 1, 0, 2));
        c.log.push(['intracranial haemorrhage', 3]);
      }
      const open = depressed && (x > 2 || this.rng() < 0.4);
      this.meleeFracture(seg, 'skull', open, pW, { depressed, region, floor: floorSide }, c.res, depressed ? 3 : 2, 'head');
      if (open) this.scalpLaceration(c, p, x);
      c.painAdd += 0.5;
      c.log.push([`${depressed ? 'depressed' : 'linear'} ${HEAD_REGION_LABEL[region]} skull fracture${floorSide ? ' (against the floor)' : ''}`, 3]);
      return { region, depressed, x };
    }
    const label = FACE_BONE[region];
    if (!label) return null;
    const thr = boneTolerance(BONE_TOL[region], area);
    if (!(this.rng() < logistic((F - thr) / (0.1 * thr)))) return null;
    // facial fractures bleed into the nose and mouth: lying unconscious, the blood runs into the airway
    const q = region === 'nose' ? 1.2 + 1.3 * clamp(F / thr - 1, 0, 1) : region === 'maxilla' ? 2.5 : region === 'cheek' ? 0.5 : 1.3;
    const air = region === 'cheek' ? 0.1 : region === 'nose' ? 0.35 : 0.6;
    c.bleeds.push(this.makeBleed(q, 'tissue', { art: 0.5, ext: region === 'nose' ? 0.7 : region === 'cheek' ? 0.6 : 0.4, cav: 'tissue', air, label }));
    const open = region === 'jaw' || region === 'chin' || region === 'maxilla'; // into the mouth
    this.meleeFracture(seg, label, open, pW, { region, floor: floorSide }, c.res, FACE_AIS[region], 'face');
    c.painAdd += 0.4;
    c.woundPain += 0.3;
    c.log.push([`${label} broken${air > 0.3 ? ' (bleeding into the airway)' : ''}`, 2]);
    return null;
  }

  /** The skin split over bone by a blow (scalp, brow): a laceration that bleeds freely. */
  scalpLaceration(c, p, x) {
    if (c.lacerated) return;
    c.lacerated = true;
    const sev = clamp(x - 0.7, 0.2, 1);
    const nOut = c.dB.clone().negate();
    const dir = c.info.axisW ? c.body.worldDirToLocal(c.info.axisW, new Vec3()) : nOut.anyPerpendicular(new Vec3());
    dir.addScaled(nOut, -dir.dot(nOut));
    if (dir.lengthSq() < 1e-8) nOut.anyPerpendicular(dir);
    dir.normalize();
    const w = this.addWound({
      body: c.body, seg: c.seg, kind: 'laceration', local: p.clone().sub(this.bodyBindPos(c.body)), normal: nOut, dir,
      radius: 0.005 + 0.006 * sev, severity: 0.5 + 0.5 * sev, bleeds: [this.makeBleed(0.6 + 1.4 * sev, 'scalp', { art: 0.4, ext: 0.97, cav: 'tissue' })],
      pain: 0.15, cause: c.info.label || 'blow', energy: 0,
    });
    c.res.wounds.push(w);
    c.log.push([c.region === 'cheek' || c.region === 'forehead' ? 'skin split over the bone' : 'scalp laceration', 1]);
  }

  /** Brain injury from blows: fatal at 1 (0.8 wrecks a zombie's brain); a severe one is a coma. */
  checkBrain(c) {
    if (!this.alive) return;
    if (this.tbi > 0.35) this.addAIS('head', this.tbi > 0.7 ? 5 : 4, 'traumatic brain injury');
    if (this.undead) {
      if (this.tbi >= 0.8) this.kill('skull crushed');
      return;
    }
    if (this.tbi >= 1) this.kill('massive head trauma (skull fracture, brain injury)');
    else if (this.tbi > 0.5) this.knockOut(60 + 240 * (this.tbi - 0.5), 1);
    if (c) c.res.tbi = this.tbi;
  }

  cervicalFracture(c, pCord) {
    const neck = this.rd.segments.neck;
    this.meleeFracture(neck, 'cervical vertebrae', false, c.pointW, {}, c.res, 2, 'head');
    const q = this.boneBleed('neck', 'cervical vertebrae', FRACTURE_BLEED['cervical vertebrae']);
    if (q > 0) c.bleeds.push(this.makeBleed(q, 'bone', { art: 0.3, ext: 0, cav: 'neck' }));
    c.log.push(['cervical spine fractured', 3]);
    if (this.rng() < pCord) this.spinalInjury(this.rng() < 0.75 ? 'C5' : 'C1');
  }

  /** The throat (larynx), the side of the neck (carotid sinus), the cervical spine. */
  bluntNeck(c) {
    const { F, pB, info } = c;
    const area = info.area || 0.002;
    if (pB.z > -0.005 && Math.abs(pB.x) < 0.028) {
      // the larynx crushed against the spine: a fractured thyroid cartilage swells shut
      const thr = boneTolerance(BONE_TOL.larynx, area);
      if (this.rng() < logistic((F - thr) / (0.12 * thr))) {
        this.airwayInjury = Math.min(this.airwayInjury, F > 2 * thr ? 0.35 : 0.6);
        c.bleeds.push(this.makeBleed(0.5, 'tissue', { art: 0.4, ext: 0, cav: 'neck', air: 0.6 }));
        this.meleeFracture(c.seg, 'larynx', false, c.pointW, {}, c.res, 3, 'head');
        c.painAdd += 0.6;
        c.log.push(['larynx fractured (airway)', 3]);
      }
    } else if (pB.z > -0.03 && this.alive && F > 1400 && this.rng() < 0.1 + 0.35 * smoothstep(1400, 3000, F)) {
      // the carotid sinus: a blow to the side of the neck drops the blood pressure for a moment
      this.knockOut(2 + 5 * this.rng(), 0.2);
      c.log.push(['carotid sinus reflex (stunned)', 1]);
    }
    const thr = boneTolerance(BONE_TOL['cervical vertebrae'], area) * (pB.z < -0.03 ? 1 : 1.3);
    if (this.rng() < logistic((F - thr) / (0.1 * thr))) this.cervicalFracture(c, 0.3);
  }

  /** Chest and upper abdomen: ribs, sternum, collarbone, lungs, heart, liver / spleen / kidneys. */
  bluntTrunk(c) {
    const { F, pB, info, k } = c;
    const area = info.area || 0.002;
    // how far the contact reaches up and down the body (a bat held upright lies across many ribs)
    const axB = info.axisW ? c.body.worldDirToLocal(info.axisW, new Vec3()) : null;
    const h = (info.radius || 0.03) + (axB ? 0.5 * Math.abs(axB.y) * (info.span || 0) : 0);
    const ribs = this.ribFractures(c, F, h);
    const front = pB.z > 0.0;
    if (k === 'chest') {
      if (front && Math.abs(pB.x) < 0.035 && pB.y > 1.2 && pB.y < 1.46) {
        const thr = boneTolerance(BONE_TOL.sternum, area);
        if (this.rng() < logistic((F - thr) / (0.1 * thr))) {
          this.meleeFracture(c.seg, 'sternum', false, c.pointW, {}, c.res, 2, 'chest');
          c.woundPain += 0.4;
          c.painAdd += 0.3;
          c.log.push(['sternum fractured', 2]);
        }
        if (F > 7000) {
          this.cardiac = Math.min(this.cardiac, 0.85);
          this.addAIS('chest', 3, 'cardiac contusion');
          c.log.push(['cardiac contusion', 2]);
          if (this.rng() < 0.08) this.ventricularFibrillation('cardiac contusion');
        }
      }
      // commotio cordis: a blow over the heart at the wrong moment of the beat
      if (front && pB.x > -0.03 && pB.x < 0.085 && pB.y > 1.22 && pB.y < 1.36 && F > 1000 && F < 7000 && this.alive && this.rng() < 0.03) {
        this.ventricularFibrillation('commotio cordis');
        c.log.push(['commotio cordis (ventricular fibrillation)', 3]);
      }
      // the collarbone (a blow down onto the shoulder) and the shoulder blade
      for (const s of this.bySeg.chest) {
        if (s.bone !== 'clavicle' && s.bone !== 'scapula') continue;
        if (structDistance(pB, s) > (s.bone === 'clavicle' ? 0.035 : 0.04)) continue;
        const thr = boneTolerance(BONE_TOL[s.bone], area);
        if (!(this.rng() < logistic((F - thr) / (0.1 * thr)))) continue;
        this.meleeFracture(c.seg, s.label, false, c.pointW, { side: s.side }, c.res, 2, 'chest');
        c.woundPain += 0.3;
        c.log.push([`${s.label} broken`, 2]);
        if (s.bone === 'clavicle') this.addHold({ ['arm' + s.side]: 0.25, dur: 4 });
      }
      // the lung under a violent blow
      if (F > 7000) {
        const sd = pB.x >= 0 ? 'L' : 'R';
        this.parench[sd] = Math.max(0.1, this.parench[sd] - clamp(0.12 + 0.12 * (F / 7000 - 1), 0.12, 0.4));
        this.addAIS('chest', 3, 'lung contusion');
        c.log.push([`${sd === 'L' ? 'left' : 'right'} lung contusion`, 2]);
      }
    }
    this.bluntAbdomen(c, ribs.length > 0);
    if (ribs.length && this.alive && !this.undead) {
      // broken ribs fold the trunk round them; several (with displaced ends) take the legs as well:
      // the stagger first, then down to the knees
      const n = ribs.length, bad = n >= 3 || (n >= 2 && ribs.some((r) => r.displaced));
      this.addHold({ t0: bad ? 0.3 : 0.1, trunk: 0.4, legs: bad ? 0.28 : 0.65, dur: bad ? 1.4 + 0.3 * n : 0.8, pain: 0.3 * n, painSeg: 'chest' });
    }
  }

  /** Solid organs under a blow to the upper abdomen or the lower ribs; liver shot, solar plexus. */
  bluntAbdomen(c, overRibs) {
    const { F, pB } = c;
    if (pB.y > 1.27) return;
    for (const s of this.bySeg.abdomen) {
      if (s.kind !== 'organ' || s.type !== 'ellipsoid') continue;
      // the load reaching an organ falls off with its depth under the skin; ribs over it take a share
      const d = Math.max(0, ellipsoidDistance(pB, s.c, s.r));
      if (d > 0.06) continue;
      const tol = s.name === 'liver' ? 3800 : s.name === 'spleen' ? 3200 : 4000;
      const Fo = F * Math.exp(-d / 0.04) * (overRibs ? 0.6 : 1);
      if (Fo <= tol) continue;
      const sev = clamp((Fo - tol) / tol + 0.3, 0.2, 1);
      const prev = this.structSev[s.name] || 0;
      const total = 1 - (1 - prev) * (1 - sev);
      this.structSev[s.name] = total;
      const q = s.bleed * (total - prev) * 0.8;
      if (q > 0) c.bleeds.push(this.makeBleed(q, 'organ', { art: s.art, ext: 0, cav: s.cav, side: s.side || 'L', label: s.label }));
      c.res.structures.push(s.label);
      c.vital += 6;
      c.painAdd += 0.5;
      this.addAIS('abdomen', sev > 0.6 ? s.ais[1] : s.ais[0] + 1, s.label + ' laceration');
      c.log.push([`${s.label} ruptured (internal bleeding)`, 2]);
    }
    if (!this.alive || this.undead) return;
    const liver = this.bySeg.abdomen.find((s) => s.name === 'liver');
    if (liver && pB.x < 0.01 && ellipsoidDistance(pB, liver.c, liver.r) < 0.05 && F > 900 && this.rng() < smoothstep(900, 2400, F)) {
      // the liver shot: a vagal reflex - after a moment the legs go and the body folds to its
      // knees, in agony, and stays down
      const a = clamp(F / 3000, 0.3, 1.5);
      this.addHold({ t0: 0.25 + 0.35 * this.rng(), dur: 2.5 + 3 * a * (0.6 + 0.4 * this.rng()), legs: 0.2, trunk: 0.45, pain: 1.4, painSeg: 'abdomen' });
      c.woundPain += 0.4;
      c.log.push(['liver shot', 1]);
    } else if (pB.z > 0.02 && Math.abs(pB.x) < 0.045 && pB.y > 1.14 && pB.y < 1.24 && F > 1000) {
      // the solar plexus: winded, doubled over
      this.addHold({ dur: 1.5 + 2 * clamp(F / 3000, 0, 1), trunk: 0.3, legs: F > 2500 ? 0.3 : 0.6, pain: 0.6, painSeg: 'abdomen' });
      this.events.push({ type: 'cough', blood: false });
      c.log.push(['winded (solar plexus)', 1]);
    }
  }

  /**
   * Ribs broken by a blow at c.pB (force F, contact reaching h m up and down the body): the ribs
   * under the contact share the load (the nearest the most) and each breaks beyond its tolerance; a
   * rib broken again away from its first break is broken in two places (segmental). Returns the new
   * fractures [{side, n, theta, displaced, segmental}].
   */
  ribFractures(c, F, h) {
    const p = c.pB;
    const cand = ribsNear(p).filter((r) => r.bony && Math.abs(r.dy) < 0.08 && r.radial > 0.8 && r.radial < 1.75);
    if (!cand.length) return [];
    const sigma = Math.max(0.016, h * 0.8);
    let wsum = 0;
    for (const r of cand) wsum += (r.w = Math.exp(-(r.dy * r.dy) / (sigma * sigma)));
    const norm = Math.max(wsum, 1);
    const out = [];
    for (const r of cand) {
      const Fr = (F * RIB_SHARE * r.w) / norm;
      const tol = RIB_TOL[r.n] * (r.theta < 0.8 ? 1.5 : r.theta > 2.4 ? 1.2 : 1);
      if (Fr < tol * (0.88 + 0.24 * this.rng())) continue;
      const displaced = Fr > 1.7 * tol || (Fr > 1.3 * tol && this.rng() < 0.35);
      const sites = this.ribFx.filter((x) => x.side === r.side && x.n === r.n);
      const same = sites.find((x) => Math.abs(x.theta - r.theta) < 0.35);
      if (same) {
        if (displaced && !same.displaced) {
          same.displaced = true;
          out.push({ side: r.side, n: r.n, theta: r.theta, displaced: true, segmental: same.segmental, again: true });
        }
        continue;
      }
      const f = { side: r.side, n: r.n, theta: r.theta, displaced, segmental: sites.length > 0 };
      for (const x of sites) x.segmental = true;
      this.ribFx.push(f);
      out.push(f);
    }
    if (!out.length) return out;
    const side = out[0].side, sideName = side === 'L' ? 'left' : 'right';
    // torn intercostal vessels bleed into the pleural space (haemothorax)
    for (const f of out) {
      if (f.again) continue;
      const q = this.boneBleed('chest', `rib ${f.side}${f.n}`, 0.3);
      if (q > 0) c.bleeds.push(this.makeBleed(q, 'bone', { art: 0.5, ext: 0, cav: 'pleura', side, label: `rib ${f.n}` }));
    }
    // the sharp ends of displaced ribs tear the lung
    const disp = out.filter((f) => f.displaced).length;
    if (disp && this.rng() < 1 - Math.pow(0.7, disp)) {
      this.ptxTarget[side] = Math.max(this.ptxTarget[side], 0.35 + 0.4 * this.rng());
      this.ptxRate[side] = Math.max(this.ptxRate[side], 1 / 35);
      if (!this.tension[side] && this.rng() < 0.12) this.tension[side] = true;
      this.addAIS('chest', 3, 'pneumothorax');
      c.log.push([`${sideName} pneumothorax (rib fragment)`, 2]);
    }
    // one entry per side in the fracture list
    const mine = this.ribFx.filter((x) => x.side === side);
    const broken = [...new Set(mine.map((x) => x.n))].sort((a, b) => a - b);
    let entry = this.fractures.find((x) => x.seg === 'chest' && x.label === 'ribs' && x.side === side);
    if (!entry) {
      entry = { seg: 'chest', label: 'ribs', side, open: false, physical: false, ribs: [] };
      this.fractures.push(entry);
    }
    entry.ribs = broken;
    entry.displaced = mine.some((x) => x.displaced);
    this.addAIS('chest', broken.length >= 3 ? 3 : 2, `rib fractures (${sideName})`);
    this.splint = Math.min(0.35, 0.05 * this.ribFx.length);
    this.addPain(0.4 + 0.25 * out.length, 'chest');
    c.woundPain += 0.3 + 0.12 * out.length;
    c.painAdd += 0.2;
    c.vital += 4 * out.length;
    // flail chest: three or more adjacent ribs broken in two places (or five or more broken, most of
    // them displaced): the loose segment moves in as the chest expands
    if (!this.flail[side]) {
      let run = 0, flail = false;
      for (let n = 1; n <= 12; n++) {
        run = mine.some((x) => x.n === n && x.segmental) ? run + 1 : 0;
        if (run >= 3) flail = true;
      }
      if (!flail && broken.length >= 5 && mine.filter((x) => x.displaced).length >= 3) flail = true;
      if (flail) {
        this.flail[side] = true;
        this.chestWall[side] = 0.55;
        this.parench[side] = Math.max(0.1, this.parench[side] - 0.2);
        this.addAIS('chest', this.flail.L && this.flail.R ? 5 : 3, 'flail chest');
        c.log.push([`${sideName} flail chest`, 3]);
      }
    }
    const list = out.map((f) => `${f.n}${f.displaced ? ' (displaced)' : ''}`).join(', ');
    c.log.push([`${sideName} rib${out.length > 1 ? 's' : ''} ${list} broken`, 2]);
    const ribs = out.map((f) => ({ side: f.side, n: f.n, displaced: f.displaced, segmental: f.segmental }));
    const pointW = c.pointW.clone();
    this.events.push({ type: 'fracture', seg: this.rd.segments.chest, segName: 'chest', label: 'ribs', ribs, pointW, displaced: disp > 0, flail: this.flail[side], open: false, physical: false });
    c.res.fractures.push({ label: 'ribs', seg: 'chest', ribs, pointW, displaced: disp > 0, flail: this.flail[side] });
    return out;
  }

  /** Limbs and pelvis: long bones break physically, hands, feet and the pelvis are recorded. */
  bluntLimb(c) {
    const { F, k, name, seg, info } = c;
    const area = info.area || 0.002;
    const label = k === 'pelvis' ? 'pelvis' : seg.bone ? seg.bone.name : k === 'hand' ? 'hand bones' : k === 'foot' ? 'foot bones' : null;
    if (!label) return;
    const thr = boneTolerance(BONE_TOL[label] ?? 4000, area);
    const side = sideOf(name);
    if (seg.bone) {
      if (!seg.fractured && !this.pendingBreaks.some((b) => b.seg === seg) && this.rng() < logistic((F - thr) / (0.1 * thr))) {
        // it breaks where it was struck (a parrying forearm: the ulna, a "nightstick" fracture)
        const ax = boneAxis(name);
        let t = 0.5;
        if (ax) {
          const ab = _v1.subVectors(ax.b, ax.a);
          t = clamp(_v2.subVectors(c.pB, ax.a).dot(ab) / ab.lengthSq(), 0, 1);
        }
        const open = F > 2.4 * thr;
        this.queueBreak(seg, t, open);
        const q = this.boneBleed(name, label, FRACTURE_BLEED[label] ?? 0.3);
        if (q > 0) c.bleeds.push(this.makeBleed(q, 'bone', { art: 0.3, ext: open ? 0.3 : 0, cav: 'tissue' }));
        c.res.fractures.push({ label, seg: name, physical: true, open, pointW: c.pointW.clone() });
        c.vital += 10;
        c.painAdd += 0.6;
        c.log.push([`${label} broken${open ? ' (open)' : ''}`, 2]);
      }
    } else if (this.rng() < logistic((F - thr) / (0.1 * thr))) {
      const q = this.boneBleed(name, label, FRACTURE_BLEED[label] ?? 0.3);
      if (q > 0) c.bleeds.push(this.makeBleed(q, 'bone', { art: 0.3, ext: 0, cav: k === 'pelvis' ? 'retro' : 'tissue' }));
      this.meleeFracture(seg, label, false, c.pointW, {}, c.res, label === 'pelvis' ? 3 : 2);
      c.vital += 5;
      c.woundPain += 0.3;
      c.log.push([`${label} broken`, 2]);
    }
    if (!this.alive || this.undead) return;
    // a blow to the thigh or the shin makes that leg give ("dead leg"); one to the arm numbs it
    const a = clamp(F / thr, 0, 1.5);
    if ((k === 'thigh' || k === 'shin' || k === 'pelvis') && a > 0.45) {
      if (k !== 'pelvis') this.muscle[name] = clamp(Math.max(this.muscle[name] || 0, 0.3 * a), 0, 1);
      const legs = clamp(1 - 0.6 * a, 0.2, 0.8);
      this.addHold(side ? { ['leg' + side]: legs, dur: 0.4 + 0.8 * a } : { legs, dur: 0.4 + 0.5 * a });
    } else if ((k === 'upperArm' || k === 'forearm' || k === 'hand') && a > 0.4) this.addHold({ ['arm' + side]: 0.25, dur: 0.6 + a });
  }

  /**
   * A bone broken by a melee blow (a long-bone shaft breaks physically instead: queueBreak).
   * Recorded once per bone in the fracture list and the trauma scores; every new break (another
   * site, or the same bone now depressed / open) is published for the visuals and sounds as
   * { type: 'fracture', seg, segName, label, open, physical: false, pointW, ...extra }.
   */
  meleeFracture(seg, label, open, pointW, extra = {}, res = null, ais = 2, region = null) {
    const prev = this.fractures.find((f) => f.seg === seg.name && f.label === label);
    const where = SEGMENT_LABEL[seg.name] || seg.name;
    if (!prev) {
      this.fractures.push({ seg: seg.name, label, open, physical: false, ...extra });
      this.log(`${open ? 'Open' : 'Closed'} fracture: ${label}${extra.depressed ? ' (depressed)' : ''} (${where})`, 2);
      this.addPain(0.8, seg.name);
      if (label === 'pelvis') this.muscle.pelvis = Math.max(this.muscle.pelvis || 0, 0.6);
    } else {
      if (extra.depressed && !prev.depressed) {
        prev.depressed = true;
        this.log(`Fracture now depressed: ${label} (${where})`, 3);
      }
      if (open && !prev.open) prev.open = true;
    }
    this.addAIS(region || issRegion(seg.name, { kind: 'bone' }), Math.min(ais + (open ? 1 : 0), 5), label);
    const pW = pointW ? pointW.clone() : null;
    this.events.push({ type: 'fracture', seg, segName: seg.name, label, open, physical: false, pointW: pW, ...extra });
    if (res) res.fractures.push({ label, seg: seg.name, open, pointW: pW, ...extra });
  }

  /**
   * Incised wound: the edge drawn along the skin (info.cut: the line as world points with outward
   * normals, and the depth the blade reached). Everything within the blade's reach under the line
   * is cut: vessels (an opened carotid or jugular bleeds torrentially, a radial artery steadily),
   * nerves, the trachea, an eye. The cut is deepest just after the blade went in and tails off.
   */
  meleeCut(c) {
    const { info, res, body, seg, name, k } = c;
    const cut = info.cut;
    const bp = this.bodyBindPos(body);
    const pts = cut.pathW.map((p) => this.toBind(body, p, new Vec3()));
    const nrm = cut.normalsW.map((n) => body.worldDirToLocal(n, new Vec3()).normalize());
    const N = pts.length;
    let L = 0;
    for (let i = 1; i < N; i++) L += pts[i].distanceTo(pts[i - 1]);
    L = Math.max(L, 0.005);
    const D = cut.depth;
    // (the depth along the cut as the blade went in and came out, or the usual shape of an incision:
    // deepest just after the blade went in, tailing off)
    const depthAt = (i) => {
      if (cut.depths && cut.depths.length === N) return cut.depths[i];
      if (N < 2) return 0.6 * D;
      const u = i / (N - 1);
      return D * clamp(2.5 * (u + 0.1), 0.25, 1) * (1 - 0.75 * u * u);
    };
    const ends = pts.map((p, i) => p.clone().addScaled(nrm[i], -depthAt(i)));
    const side = c.pB.x >= 0 ? 'L' : 'R';
    const found = [];
    const a = new Vec3(), b = new Vec3();
    for (const s of this.bySeg[name] || []) {
      let best = Infinity, at = 0;
      for (let i = 0; i < N; i++) {
        const d = pathToStructure(pts[i], ends[i], s).dist;
        if (d < best) {
          best = d;
          at = i;
        }
      }
      for (let i = 0; i + 1 < N; i++) {
        for (const f of [0.45, 1]) {
          a.lerpVectors(pts[i], ends[i], f);
          b.lerpVectors(pts[i + 1], ends[i + 1], f);
          const d = pathToStructure(a, b, s).dist;
          if (d < best) {
            best = d;
            at = i + 0.5;
          }
        }
      }
      if (best > 0.001) continue;
      const through = best < -0.4 * (s.type === 'tube' ? s.r : 0.004);
      found.push({ s, sev: through ? 1 : 0.55, at: Math.round(at), through });
    }
    const bleeds = []; // { at, b }
    let painAdd = 0, trachea = false;
    for (const h of found) {
      const s = h.s;
      if (s.kind === 'brain' || s.kind === 'brainstem' || s.kind === 'heart') continue; // behind bone
      const prev = this.structSev[s.name] || 0;
      const total = 1 - (1 - prev) * (1 - h.sev);
      this.structSev[s.name] = total;
      const added = total - prev;
      res.structures.push(s.label || s.name);
      if (s.ais && s.kind !== 'bone') this.addAIS(issRegion(name, s), s.ais[h.through ? 1 : 0], s.label);
      switch (s.kind) {
        case 'artery':
        case 'vein': {
          const q = s.bleed * added;
          if (q > 0) bleeds.push({ at: h.at, b: this.makeBleed(q, s.kind, { ext: Math.max(s.external ?? 0.8, 0.85), cav: s.cav || 'tissue', side: s.side || side, label: s.label, full: s.bleed }) });
          if (added > 0.02) c.log.push([`${s.label} ${h.through ? 'severed' : 'opened'}`, q > 15 ? 3 : 2]);
          c.vital += (UNDEAD_VITAL[s.kind] || 0) * h.sev;
          break;
        }
        case 'nerve':
          this.nerve[s.limb] = Math.min(this.nerve[s.limb], 1 - s.loss * h.sev);
          c.log.push([`${s.label} cut`, 2]);
          painAdd += 0.4;
          break;
        case 'airway':
          this.airwayInjury = Math.min(this.airwayInjury, h.through ? 0.5 : 0.75);
          trachea = true;
          c.log.push(['trachea opened', 3]);
          painAdd += 0.3;
          break;
        case 'eye':
          c.log.push([`${s.label} cut`, 2]);
          painAdd += 0.6;
          break;
        case 'face':
        case 'oral':
          bleeds.push({ at: h.at, b: this.makeBleed(s.bleed * added * 0.6, 'tissue', { art: s.art, ext: 0.8, cav: s.cav, side, air: s.air, label: s.label }) });
          break;
        case 'lung': {
          // through the chest wall: air sucked in through the wound (open pneumothorax)
          const sd = s.side;
          this.parench[sd] = Math.max(0.05, this.parench[sd] - 0.08);
          bleeds.push({ at: h.at, b: this.makeBleed(s.bleed * added, 'lung', { art: 0, ext: s.external, cav: 'pleura', side: sd, air: s.air }) });
          this.ptxTarget[sd] = Math.max(this.ptxTarget[sd], 0.6);
          this.ptxRate[sd] = Math.max(this.ptxRate[sd], 1 / 15);
          this.openChest[sd] = true;
          c.log.push([`${s.label} opened (sucking chest wound)`, 3]);
          break;
        }
        case 'organ':
        case 'gut':
          bleeds.push({ at: h.at, b: this.makeBleed(s.bleed * added * 0.5, s.kind === 'organ' ? 'organ' : 'tissue', { art: s.art, ext: s.external, cav: s.cav, side: s.side || side, label: s.label }) });
          c.log.push([`${s.label} cut`, 2]);
          painAdd += 0.4;
          c.vital += 6;
          break;
        case 'cord':
          if (h.through) {
            this.spinalInjury(s.level);
            c.log.push([`${s.label} severed`, 3]);
            c.vital += 25;
          }
          break;
        case 'bone':
        case 'skull':
          c.log.push([`cut to the bone (${s.label})`, 1]);
          break;
        default:
          break;
      }
    }
    if (trachea) for (const x of bleeds) if (x.b.cav === 'neck') x.b.air = Math.max(x.b.air, 0.35);
    // the incision itself: skin, fat and muscle (the scalp and face bleed freely); shown as a row of
    // slits along the line, the cut vessels bleeding from where they were opened
    const mult = k === 'head' ? 2 : k === 'neck' ? 1.4 : k === 'hand' || k === 'foot' ? 1.3 : 1;
    const qT = 0.035 * (L * 100) * (0.4 + D * 100) * mult;
    const nDec = clamp(Math.round(L / 0.035), 1, 6);
    const radius = clamp(L / (2 * nDec * 2.9), 0.0035, 0.012);
    const wounds = [];
    for (let j = 0; j < nDec; j++) {
      const i = N > 1 ? Math.round(((j + 0.5) / nDec) * (N - 1)) : 0;
      const dir = new Vec3().subVectors(pts[Math.min(N - 1, i + 1)], pts[Math.max(0, i - 1)]);
      if (dir.lengthSq() < 1e-10) nrm[i].anyPerpendicular(dir);
      dir.normalize();
      wounds.push({
        i,
        w: {
          body, seg, kind: 'laceration', local: pts[i].clone().sub(bp), normal: nrm[i].clone(), dir, radius,
          severity: clamp(0.35 + D / 0.03, 0.35, 1), bleeds: [this.makeBleed(qT / nDec, k === 'head' ? 'scalp' : 'tissue', { art: 0.4, ext: 0.95, cav: 'tissue' })],
          pain: 0, cause: info.label || 'knife', energy: res.energy / nDec, incised: true, length: L, depth: D,
        },
      });
    }
    for (const x of bleeds) {
      let best = wounds[0];
      for (const w of wounds) if (Math.abs(w.i - x.at) < Math.abs(best.i - x.at)) best = w;
      best.w.bleeds.push(x.b);
    }
    const pain = PAIN_BY_SEGMENT[k] * clamp(0.25 + L * 3 + D * 12, 0.25, 1.1) + painAdd;
    wounds[0].w.pain = pain;
    for (const { w } of wounds) {
      this.addWound(w);
      res.wounds.push(w);
    }
    this.addPain(pain, name);
    this.muscle[name] = clamp((this.muscle[name] || 0) + 0.04 + 0.25 * clamp(D / 0.03, 0, 1), 0, 1);
    this.tissueEnergy += res.energy;
    const where = SEGMENT_LABEL[name] || name;
    this.addAIS(issRegion(name), L > 0.1 || D > 0.012 ? 2 : 1, 'incised wound, ' + where);
    this.addAIS('external', 1, 'skin');
    let total = qT;
    for (const x of bleeds) total += x.b.q;
    this.log(`Knife wound (incised), ${where}: ${(L * 100).toFixed(0)} cm long, ${(D * 100).toFixed(1)} cm deep`, total > 15 ? 3 : total > 3 ? 2 : 1);
    for (const [t, s] of c.log) this.log(`  ${t}`, s);
    res.depth = D;
    res.length = L;
    this.reactToHit(name, clamp(0.3 + D / 0.04 + total / 40, 0.2, 1.1), c.dirW, 'cut');
  }

  /**
   * Stab wound: the point driven in along info.stab.dirW with info.stab.energy joules. The skin takes
   * a few joules, the blade's drag through tissue the rest; bone in the way stops the point unless
   * the thrust can get through it (a rib often turns it, the skull nearly always, except through the
   * thin temple or the back of the orbit). The channel hits what lies on it, as a bullet's does but
   * without a cavity: a stabbed heart bleeds into its pericardial sac (tamponade), a lung collapses,
   * the liver, vessels and nerves are cut.
   */
  meleeStab(c) {
    const { info, res, body, seg, name, k } = c;
    const st = info.stab;
    const entryB = c.pB.clone();
    const dB = body.worldDirToLocal(st.dirW, new Vec3()).normalize();
    let E = st.energy;
    const eSkin = STAB_SKIN * (1.6 - (info.sharpness ?? 0.9));
    let depth, stoppedBy = null, costs = 0;
    const passed = [];
    if (E <= eSkin) {
      depth = 0.003 + 0.007 * (E / eSkin);
      stoppedBy = 'skin';
    } else {
      E -= eSkin;
      const maxD = st.length * 0.97;
      depth = Math.min(maxD, E / STAB_DRAG);
      for (const b of this.stabBlocks(c, entryB, dB, maxD)) {
        if (b.at >= depth) break;
        if (E - costs - STAB_DRAG * b.at < b.cost) {
          depth = b.at + 0.002;
          stoppedBy = b.label;
          break;
        }
        costs += b.cost;
        passed.push(b);
        depth = Math.min(maxD, Math.max(b.at + 0.002, (E - costs) / STAB_DRAG));
      }
    }
    const endB = entryB.clone().addScaled(dB, depth);
    res.energy = Math.min(st.energy, eSkin + costs + STAB_DRAG * depth);
    this.tissueEnergy += res.energy;
    const side = entryB.x >= 0 ? 'L' : 'R';
    const bleeds = [];
    let painAdd = 0, trachea = false;
    const skull = passed.find((b) => b.label === 'skull' || b.label === 'temple' || b.label === 'orbit');
    for (const s of this.bySeg[name] || []) {
      if (s.kind === 'bone' || s.kind === 'skull') continue;
      if ((s.kind === 'brain' || s.kind === 'brainstem') && !skull) continue;
      const r = pathToStructure(entryB, endB, s);
      if (r.dist > 0.25 * (st.width || 0.03) + 0.002) continue;
      const direct = r.dist <= 0.002;
      // (the edges cut what lies beside the blade, nothing beyond its point)
      if (!direct && r.at > 0.97) continue;
      const sev = direct ? 1 : 0.4;
      const prev = this.structSev[s.name] || 0;
      const total = 1 - (1 - prev) * (1 - sev);
      this.structSev[s.name] = total;
      const added = total - prev;
      res.structures.push(s.label || s.name);
      if (s.ais) this.addAIS(issRegion(name, s), s.ais[direct ? 1 : 0], s.label);
      c.vital += (UNDEAD_VITAL[s.kind] || 0) * (direct ? 1 : 0.4);
      switch (s.kind) {
        case 'brain':
          if (this.undead || (direct && depth - skull.at > 0.025)) this.kill('stab wound to the brain');
          else {
            this.knockOut(60 + 120 * this.rng(), 1);
            this.tbi += 0.5;
          }
          c.log.push([`brain ${direct ? 'penetrated' : 'injured'}`, 3]);
          break;
        case 'brainstem':
          this.kill('brain stem destroyed');
          c.log.push(['brain stem destroyed', 3]);
          break;
        case 'eye':
          c.log.push([`${s.label} destroyed`, 2]);
          painAdd += 0.6;
          break;
        case 'face':
        case 'oral':
          bleeds.push(this.makeBleed(s.bleed * added * 0.7, 'tissue', { art: s.art, ext: s.external, cav: s.cav, side, air: s.air, label: s.label }));
          c.log.push([`${s.label} stabbed`, 2]);
          painAdd += 0.3;
          break;
        case 'cord':
          if (direct) {
            this.spinalInjury(s.level);
            c.log.push([`${s.label} severed`, 3]);
          }
          break;
        case 'heart': {
          // the small hole in the pericardium holds the blood in: tamponade
          this.cardiac = Math.min(this.cardiac * (prev > 0 ? 0.8 : 1), direct ? 0.55 : 0.8);
          const q = s.bleed * added * 0.45;
          bleeds.push(this.makeBleed(q * 0.6, 'heart', { ext: 0, cav: 'pericardium', label: 'heart' }));
          bleeds.push(this.makeBleed(q * 0.4, 'heart', { ext: s.external, cav: 'pleura', side: 'L', label: 'heart' }));
          if (direct && this.rng() < 0.1) this.ventricularFibrillation('stab wound to the heart');
          c.log.push([direct ? 'heart stabbed' : 'pericardium cut', 3]);
          painAdd += 0.4;
          break;
        }
        case 'lung': {
          const sd = s.side;
          this.parench[sd] = Math.max(0.05, this.parench[sd] - (direct ? 0.15 : 0.05));
          bleeds.push(this.makeBleed(s.bleed * added, 'lung', { art: 0, ext: s.external, cav: 'pleura', side: sd, air: s.air }));
          this.ptxTarget[sd] = Math.max(this.ptxTarget[sd], direct ? 0.5 + 0.35 * this.rng() : 0.3);
          this.ptxRate[sd] = Math.max(this.ptxRate[sd], 1 / 40);
          if (direct && !this.tension[sd] && this.rng() < 0.2) this.tension[sd] = true;
          c.log.push([`${s.label} punctured (pneumothorax)`, 2]);
          break;
        }
        case 'airway':
          this.airwayInjury = Math.min(this.airwayInjury, direct ? 0.55 : 0.8);
          trachea = true;
          c.log.push(['trachea punctured', 2]);
          painAdd += 0.3;
          break;
        case 'artery':
        case 'vein': {
          const q = s.bleed * added;
          bleeds.push(this.makeBleed(q, s.kind, { ext: s.external, cav: s.cav, side: s.side || side, label: s.label, full: s.bleed }));
          if (added > 0.02) c.log.push([`${s.label} ${direct ? 'severed' : 'nicked'}`, q > 15 ? 3 : 2]);
          break;
        }
        case 'organ':
        case 'gut':
          bleeds.push(this.makeBleed(s.bleed * added * (s.kind === 'organ' ? 0.6 : 1), s.kind === 'organ' ? 'organ' : 'tissue', { art: s.art, ext: s.external, cav: s.cav, side: s.side || side, label: s.label }));
          painAdd += s.kind === 'gut' ? 0.45 : 0.3;
          c.log.push([`${s.label} stabbed`, 2]);
          break;
        case 'nerve':
          this.nerve[s.limb] = Math.min(this.nerve[s.limb], 1 - s.loss * (direct ? 1 : 0.5));
          c.log.push([`${s.label} cut`, 2]);
          painAdd += 0.4;
          break;
        default:
          break;
      }
    }
    if (trachea) for (const b of bleeds) if (b.cav === 'neck') b.air = Math.max(b.air, 0.35);
    for (const b of passed) c.log.push([`blade went through the ${b.label}${b.label === 'rib' ? ` (rib ${b.rib.n})` : ''}`, 1]);
    if (skull) this.meleeFracture(seg, 'skull', true, c.pointW, { penetrating: true, region: skull.label }, res, 3, 'head');
    if (stoppedBy && stoppedBy !== 'skin') c.log.push([`blade stopped by the ${stoppedBy}`, 1]);
    // the channel through skin and muscle; the wound is a slit as wide as the blade
    bleeds.push(this.makeBleed(0.25 + 3 * depth, k === 'head' ? 'scalp' : 'tissue', { art: 0.4, ext: TISSUE_EXT[k] ?? 0.75, cav: TISSUE_CAV[k] || 'tissue', side }));
    const edge = st.edgeW ? body.worldDirToLocal(st.edgeW, new Vec3()) : dB.anyPerpendicular(new Vec3());
    edge.addScaled(dB, -edge.dot(dB));
    if (edge.lengthSq() < 1e-8) dB.anyPerpendicular(edge);
    edge.normalize();
    const pain = PAIN_BY_SEGMENT[k] * clamp(0.45 + depth * 4, 0.45, 1.2) + painAdd;
    const w = this.addWound({
      body, seg, kind: 'laceration', local: entryB.clone().sub(this.bodyBindPos(body)), normal: dB.clone().negate(), dir: edge,
      radius: clamp(0.004 + 0.12 * (st.width || 0.03), 0.005, 0.01), severity: clamp(0.4 + depth / 0.12, 0.4, 1), bleeds, pain,
      cause: info.label || 'knife', energy: res.energy, stab: true, depth,
    });
    res.wounds.push(w);
    this.addPain(pain, name);
    this.muscle[name] = clamp((this.muscle[name] || 0) + 0.08 + depth * 1.5, 0, 1);
    const where = SEGMENT_LABEL[name] || name;
    this.addAIS(issRegion(name), depth > 0.03 ? 2 : 1, 'stab wound, ' + where);
    this.addAIS('external', 1, 'skin');
    let total = 0;
    for (const b of bleeds) total += b.q;
    this.log(`Stab wound, ${where} (${(depth * 100).toFixed(0)} cm deep)`, total > 15 ? 3 : total > 3 ? 2 : 1);
    for (const [t, s] of c.log) this.log(`  ${t}`, s);
    res.depth = depth;
    res.stoppedBy = stoppedBy;
    this.reactToHit(name, clamp(0.4 + depth / 0.12, 0.3, 1.2), st.dirW, 'stab');
  }

  /** Bone along a stab channel, in order: [{ at (m under the skin), cost (J), label, rib }]. */
  stabBlocks(c, entryB, dB, maxDepth) {
    const out = [];
    const p = new Vec3();
    const bones = (this.bySeg[c.name] || []).filter((s) => s.kind === 'bone' || s.kind === 'skull');
    const seen = new Set();
    let skullLabel = 'skull';
    if (c.k === 'head') {
      // the temporal squama is thin, the back of the orbit thinner still
      const eye = (this.bySeg.head || []).some((s) => s.kind === 'eye' && structDistance(entryB, s) < 0.02);
      skullLabel = eye ? 'orbit' : headRegion(entryB) === 'temple' ? 'temple' : 'skull';
    }
    const ribsToo = c.k === 'chest' || c.k === 'abdomen';
    for (let x = 0.002; x <= maxDepth + 1e-9; x += 0.002) {
      p.copy(entryB).addScaled(dB, x);
      for (const s of bones) {
        if (seen.has(s) || structDistance(p, s) > 0) continue;
        seen.add(s);
        const label = s.kind === 'skull' ? skullLabel : s.bone || s.label;
        out.push({ at: x, cost: STAB_BONE[label] ?? 100, label });
      }
      if (ribsToo) {
        const r = ribsNear(p)[0];
        const key = r.side + r.n;
        if (!seen.has(key) && r.bony && Math.abs(r.dy) < 0.0065 && Math.abs(r.radial - 1) * 0.12 < 0.006) {
          seen.add(key);
          // the point often slips off a rib into the space between
          out.push({ at: x, cost: this.rng() < 0.5 ? STAB_BONE.rib : 6, label: 'rib', rib: r });
        }
      }
    }
    // the sternum covers the front of the heart
    if (c.k === 'chest' && entryB.z > 0.02 && Math.abs(entryB.x) < 0.03 && entryB.y > 1.22 && entryB.y < 1.45) out.push({ at: 0.012, cost: STAB_BONE.sternum, label: 'sternum' });
    out.sort((u, w) => u.at - w.at);
    return out;
  }

  // ------------------------------------------------------------------------------------------
  /** Vital signs and injury list for the HUD. */
  vitals() {
    const lossFrac = 1 - this.blood / BLOOD_VOLUME;
    const { iss, niss } = this.severityScores();
    const pulse = this.alive && this.arrestTime < 0;
    const conditions = [];
    if (pulse && lossFrac > 0.15) conditions.push(`Haemorrhagic shock, class ${lossFrac > 0.4 ? 'IV' : lossFrac > 0.3 ? 'III' : 'II'}`);
    for (const s of ['L', 'R']) {
      const sideName = s === 'L' ? 'left' : 'right';
      if (this.ptx[s] > 0.25) conditions.push(`${this.tensionP[s] > 0.3 ? 'Tension pneumothorax' : this.openChest[s] ? 'Open pneumothorax' : 'Pneumothorax'} (${sideName})`);
      if (this.cav['pleura' + s] > 400) conditions.push(`Haemothorax (${sideName}, ${Math.round(this.cav['pleura' + s])} mL)`);
    }
    if (this.cav.pericardium > 80) conditions.push('Cardiac tamponade');
    if (this.airway < 0.7) conditions.push('Airway compromise');
    if (this.breathing < 0.1 && this.alive) conditions.push('Apnoea (respiratory paralysis)');
    if (this.autonomic < 0.5 && pulse) conditions.push('Neurogenic shock');
    if (this.cav.peritoneum + this.cav.retro > 500) conditions.push('Intra-abdominal haemorrhage');
    for (const s of ['L', 'R']) if (this.flail[s]) conditions.push(`Flail chest (${s === 'L' ? 'left' : 'right'})`);
    if (this.skullFx.length) conditions.push(this.skullFx.some((f) => f.depressed) ? 'Depressed skull fracture' : 'Skull fracture');
    if (this.ichRate > 0 && this.alive) conditions.push('Intracranial haemorrhage');
    return {
      status: this.status,
      alive: this.alive,
      conscious: this.conscious,
      hr: pulse ? Math.round(this.hr) : 0,
      bp: pulse ? `${Math.round(this.bpSys)}/${Math.round(this.bpDia)}` : '0/0',
      map: Math.round(this.mapF),
      // a pulse oximeter needs a pulse
      spo2: pulse && this.mapF > 30 ? Math.round(this.spo2 * 100) : null,
      rr: Math.round(this.rr),
      rhythm: this.rhythm,
      blood: Math.round(this.blood),
      bloodPct: Math.round((this.blood / BLOOD_VOLUME) * 100),
      lossPct: Math.round(lossFrac * 100),
      bleedRate: this.bleedRate,
      externalRate: this.externalRate,
      pain: this.pain,
      concussion: this.concussion,
      spinal: this.spinal,
      iss,
      niss,
      issLabel: iss >= 75 ? 'unsurvivable' : iss >= 25 ? 'critical' : iss >= 16 ? 'severe' : iss >= 9 ? 'moderate' : iss > 0 ? 'minor' : 'none',
      conditions,
      deathCause: this.deathCause,
      injuries: this.injuries,
      fractures: this.fractures,
      wounds: this.wounds.length,
    };
  }
}
