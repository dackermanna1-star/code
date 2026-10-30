import { Vec3 } from '../physics/math.js';
import { landmark } from './anatomy.js';

/**
 * Internal anatomy for the injury model: organs, major vessels, nerves, airway, spinal cord and
 * bones, as ellipsoids and tubes in the physics bind pose (same coordinates as anatomy.js). Each
 * structure belongs to one segment, so a wound channel traced through a posed segment can be
 * tested in that segment's bind frame.
 *
 * Bleeding: `bleed` is the flow (mL/s) out of a fully opened structure at normal blood pressure;
 * `external` is the fraction that leaves the body through the skin wound, the rest collects in the
 * body cavity `cav` (pleura, pericardium, peritoneum, retroperitoneum, neck, tissue). `art` is the
 * fraction of the flow driven by arterial pressure (the rest by the low venous / pulmonary
 * pressure), `air` the fraction of the internal blood that runs into the airway (aspiration).
 * `ais` = [AIS of a near miss (temporary cavity / contusion), AIS of a direct hit] on the
 * Abbreviated Injury Scale (1 minor .. 6 unsurvivable), used for the trauma severity score.
 */

const v = (x, y, z) => new Vec3(x, y, z);

function ell(name, seg, c, r, props) {
  return { name, seg, type: 'ellipsoid', c, r, ...props };
}

function tube(name, seg, a, b, r, props) {
  return { name, seg, type: 'tube', a, b, r, ...props };
}

const mir = (p) => v(-p.x, p.y, p.z);

function mirrorStruct(s) {
  const o = { ...s, name: s.name.replace(/L$/, 'R'), seg: s.seg.replace(/L$/, 'R'), label: (s.label || '').replace(/^left /, 'right ') };
  if (s.c) o.c = mir(s.c);
  if (s.a) o.a = mir(s.a);
  if (s.b) o.b = mir(s.b);
  if (s.side) o.side = 'R';
  if (s.limb) o.limb = s.limb.replace(/L$/, 'R');
  return o;
}

export function buildAnatomy() {
  const S = [];
  const add = (s, mirror = false) => {
    S.push(s);
    if (mirror) S.push(mirrorStruct(s));
  };
  // ---------------- head ----------------
  // The cranial vault is a shell (~8 mm of bone) around the brain: a channel through the shell
  // that misses the brain is a tangential "gutter" wound (fracture, concussion), usually survivable.
  add(ell('skull', 'head', v(0, 1.705, -0.012), v(0.073, 0.067, 0.089), { kind: 'skull', label: 'skull', ais: [2, 3] }));
  add(ell('brain', 'head', v(0, 1.705, -0.012), v(0.064, 0.058, 0.08), { kind: 'brain', label: 'brain', ais: [4, 5] }));
  add(tube('brainstem', 'head', v(0, 1.668, -0.028), v(0, 1.612, -0.04), 0.016, { kind: 'brainstem', label: 'brain stem', ais: [5, 6] }));
  // face: midface (maxilla, zygoma, nasal cavity), orbits, mouth and mandible. Richly vascular,
  // bleeds into the airway, rarely fatal on its own.
  add(ell('midface', 'head', v(0, 1.655, 0.07), v(0.052, 0.03, 0.03), { kind: 'face', bone: 'maxilla', bleed: 3, art: 0.5, external: 0.6, air: 0.5, cav: 'tissue', label: 'midface (maxilla)', face: true, ais: [1, 2] }));
  add(ell('eye L', 'head', v(0.032, 1.688, 0.074), v(0.012, 0.012, 0.012), { kind: 'eye', label: 'left eye', side: 'L', face: true, ais: [1, 2] }), true);
  add(ell('oral cavity', 'head', v(0, 1.618, 0.052), v(0.03, 0.013, 0.034), { kind: 'oral', bleed: 2.5, art: 0.5, external: 0.35, air: 0.7, cav: 'tissue', label: 'tongue and mouth', face: true, ais: [1, 2] }));
  add(ell('jaw', 'head', v(0, 1.598, 0.04), v(0.05, 0.03, 0.05), { kind: 'bone', bone: 'mandible', label: 'mandible', face: true, ais: [1, 2] }));
  add(tube('temporal artery L', 'head', v(0.07, 1.65, 0.012), v(0.068, 1.73, 0.0), 0.002, { kind: 'artery', bleed: 2.5, external: 1, label: 'left superficial temporal artery', side: 'L', ais: [1, 1] }), true);

  // ---------------- neck ----------------
  add(tube('cervical cord (C1-C3)', 'neck', v(0, 1.605, -0.036), v(0, 1.548, -0.046), 0.012, { kind: 'cord', level: 'C1', label: 'upper cervical spinal cord', ais: [3, 6] }));
  add(tube('cervical cord (C4-C7)', 'neck', v(0, 1.548, -0.046), v(0, 1.47, -0.06), 0.012, { kind: 'cord', level: 'C5', label: 'lower cervical spinal cord', ais: [3, 5] }));
  add(tube('cervical vertebrae', 'neck', v(0, 1.6, -0.018), v(0, 1.47, -0.035), 0.017, { kind: 'bone', bone: 'cervical vertebrae', label: 'cervical vertebrae', nearCord: 'C5', ais: [2, 2] }));
  // an expanding neck haematoma compresses the airway; blood from vessels next to a torn trachea
  // is aspirated
  add(tube('carotid artery L', 'neck', v(0.022, 1.47, 0.0), v(0.03, 1.6, 0.0), 0.0055, { kind: 'artery', bleed: 26, external: 0.8, cav: 'neck', label: 'left carotid artery', side: 'L', ais: [3, 4] }), true);
  add(tube('jugular vein L', 'neck', v(0.036, 1.47, -0.008), v(0.044, 1.6, -0.01), 0.0065, { kind: 'vein', bleed: 11, external: 0.8, cav: 'neck', label: 'left jugular vein', side: 'L', ais: [2, 3] }), true);
  add(tube('vertebral artery L', 'neck', v(0.021, 1.47, -0.036), v(0.019, 1.6, -0.024), 0.0025, { kind: 'artery', bleed: 6, external: 0.3, cav: 'neck', label: 'left vertebral artery', side: 'L', ais: [3, 3] }), true);
  add(tube('trachea', 'neck', v(0, 1.46, 0.006), v(0, 1.585, 0.008), 0.0105, { kind: 'airway', label: 'trachea / larynx', ais: [2, 3] }));

  // ---------------- chest ----------------
  add(ell('heart', 'chest', v(0.018, 1.29, 0.006), v(0.05, 0.06, 0.045), { kind: 'heart', bleed: 90, art: 1, external: 0.2, cav: 'pericardium', label: 'heart', ais: [3, 5] }));
  add(tube('aortic arch', 'chest', v(0.008, 1.32, 0.0), v(0.0, 1.385, -0.03), 0.014, { kind: 'artery', bleed: 120, external: 0.12, cav: 'mediastinum', label: 'aortic arch', ais: [4, 5] }));
  add(tube('thoracic aorta', 'chest', v(0.0, 1.385, -0.045), v(0.01, 1.2, -0.06), 0.012, { kind: 'artery', bleed: 110, external: 0.1, cav: 'pleura', side: 'L', label: 'descending aorta', ais: [4, 5] }));
  // pulmonary hilum: the pulmonary arteries and veins (low pressure, very high flow)
  add(tube('pulmonary hilum L', 'chest', v(0.032, 1.345, -0.012), v(0.062, 1.335, -0.03), 0.011, { kind: 'vein', bleed: 40, external: 0.15, cav: 'pleura', label: 'left pulmonary hilum', side: 'L', ais: [4, 5] }), true);
  // lungs: parenchymal wounds bleed at pulmonary pressure (often self-limiting) but let air into the
  // pleural space (pneumothorax); a little blood is coughed up (haemoptysis)
  add(ell('lung L', 'chest', v(0.068, 1.33, -0.035), v(0.058, 0.105, 0.058), { kind: 'lung', bleed: 4.5, art: 0, external: 0.2, cav: 'pleura', air: 0.12, label: 'left lung', side: 'L', ais: [3, 3] }), true);
  add(tube('subclavian artery L', 'chest', v(0.02, 1.43, 0.004), v(0.16, 1.44, -0.022), 0.006, { kind: 'artery', bleed: 22, external: 0.45, cav: 'pleura', label: 'left subclavian artery', side: 'L', ais: [3, 4] }), true);
  add(tube('thoracic cord', 'chest', v(0, 1.47, -0.068), v(0, 1.2, -0.082), 0.012, { kind: 'cord', level: 'T6', label: 'thoracic spinal cord', ais: [3, 5] }));
  add(tube('thoracic vertebrae', 'chest', v(0, 1.47, -0.045), v(0, 1.2, -0.058), 0.018, { kind: 'bone', bone: 'thoracic vertebrae', label: 'thoracic vertebrae', nearCord: 'T6', ais: [2, 2] }));
  add(tube('clavicle L', 'chest', v(0.02, 1.45, 0.014), v(0.165, 1.463, -0.018), 0.008, { kind: 'bone', bone: 'clavicle', label: 'left clavicle', side: 'L', ais: [2, 2] }), true);
  add(tube('scapula L', 'chest', v(0.05, 1.42, -0.1), v(0.12, 1.33, -0.095), 0.02, { kind: 'bone', bone: 'scapula', label: 'left scapula', side: 'L', ais: [2, 2] }), true);

  // ---------------- abdomen ----------------
  // solid organs bleed persistently (non-compressible torso haemorrhage, poor clotting)
  add(ell('liver', 'abdomen', v(-0.055, 1.142, 0.0), v(0.085, 0.055, 0.065), { kind: 'organ', bleed: 12, art: 0.35, external: 0.15, cav: 'peritoneum', label: 'liver', ais: [2, 4] }));
  add(ell('spleen', 'abdomen', v(0.078, 1.158, -0.045), v(0.033, 0.045, 0.03), { kind: 'organ', bleed: 9, art: 0.75, external: 0.15, cav: 'peritoneum', label: 'spleen', ais: [2, 3] }));
  add(ell('kidney L', 'abdomen', v(0.056, 1.09, -0.066), v(0.025, 0.05, 0.022), { kind: 'organ', bleed: 6, art: 0.85, external: 0.2, cav: 'retro', label: 'left kidney', side: 'L', ais: [2, 3] }), true);
  add(tube('renal artery L', 'abdomen', v(0.012, 1.105, -0.05), v(0.042, 1.095, -0.062), 0.0035, { kind: 'artery', bleed: 12, external: 0.1, cav: 'retro', label: 'left renal artery', side: 'L', ais: [3, 4] }), true);
  add(ell('stomach', 'abdomen', v(0.035, 1.15, 0.022), v(0.05, 0.04, 0.04), { kind: 'gut', bleed: 2, art: 0.4, external: 0.3, cav: 'peritoneum', label: 'stomach', ais: [2, 3] }));
  add(ell('intestines', 'abdomen', v(0, 1.07, 0.022), v(0.1, 0.05, 0.06), { kind: 'gut', bleed: 1.8, art: 0.4, external: 0.35, cav: 'peritoneum', label: 'small intestine', ais: [2, 3] }));
  add(tube('mesenteric artery', 'abdomen', v(0.008, 1.16, -0.035), v(0.0, 1.07, 0.015), 0.005, { kind: 'artery', bleed: 22, external: 0.1, cav: 'peritoneum', label: 'superior mesenteric artery', ais: [3, 4] }));
  add(tube('abdominal aorta', 'abdomen', v(0.01, 1.2, -0.055), v(0.006, 1.03, -0.042), 0.011, { kind: 'artery', bleed: 100, external: 0.08, cav: 'retro', label: 'abdominal aorta', ais: [4, 5] }));
  add(tube('vena cava', 'abdomen', v(-0.018, 1.2, -0.05), v(-0.016, 1.03, -0.04), 0.012, { kind: 'vein', bleed: 45, external: 0.08, cav: 'retro', label: 'inferior vena cava', ais: [3, 4] }));
  add(tube('lumbar cord', 'abdomen', v(0, 1.2, -0.082), v(0, 1.03, -0.075), 0.013, { kind: 'cord', level: 'L1', label: 'lumbar spinal cord', ais: [3, 4] }));
  add(tube('lumbar vertebrae', 'abdomen', v(0, 1.2, -0.056), v(0, 1.03, -0.05), 0.022, { kind: 'bone', bone: 'lumbar vertebrae', label: 'lumbar vertebrae', nearCord: 'L1', ais: [2, 2] }));

  // ---------------- pelvis ----------------
  add(ell('lower intestine', 'pelvis', v(0, 0.985, 0.025), v(0.095, 0.045, 0.055), { kind: 'gut', bleed: 1.5, art: 0.4, external: 0.35, cav: 'peritoneum', label: 'large intestine', ais: [2, 3] }));
  add(ell('bladder', 'pelvis', v(0, 0.905, 0.04), v(0.034, 0.03, 0.03), { kind: 'gut', bleed: 1.5, art: 0.4, external: 0.35, cav: 'peritoneum', label: 'bladder', ais: [2, 3] }));
  add(tube('iliac artery L', 'pelvis', v(0.008, 1.03, -0.04), v(0.072, 0.93, 0.02), 0.0085, { kind: 'artery', bleed: 35, external: 0.2, cav: 'retro', label: 'left iliac artery', side: 'L', ais: [3, 4] }), true);
  add(tube('iliac vein L', 'pelvis', v(-0.004, 1.03, -0.046), v(0.062, 0.93, 0.012), 0.009, { kind: 'vein', bleed: 22, external: 0.2, cav: 'retro', label: 'left iliac vein', side: 'L', ais: [3, 3] }), true);
  add(tube('gluteal artery L', 'pelvis', v(0.06, 0.985, -0.075), v(0.092, 0.955, -0.1), 0.003, { kind: 'artery', bleed: 6, external: 0.6, cav: 'tissue', label: 'left superior gluteal artery', side: 'L', ais: [2, 3] }), true);
  add(ell('ilium L', 'pelvis', v(0.098, 0.975, -0.025), v(0.042, 0.06, 0.07), { kind: 'bone', bone: 'pelvis', label: 'pelvis (ilium)', side: 'L', ais: [2, 2] }), true);
  add(ell('sacrum', 'pelvis', v(0, 0.95, -0.085), v(0.042, 0.06, 0.022), { kind: 'bone', bone: 'pelvis', label: 'sacrum', nearCord: 'S1', ais: [2, 2] }));

  // ---------------- arm (left) ----------------
  const Sh = landmark('shoulderL'), El = landmark('elbowL'), Wr = landmark('wristL');
  const u = new Vec3().subVectors(El, Sh).normalize();
  const fo = new Vec3().subVectors(Wr, El).normalize();
  const brA = Sh.clone().addScaled(u, 0.07).add(v(-0.026, 0, 0.012)), brB = El.clone().addScaled(u, -0.02).add(v(-0.016, 0, 0.022));
  add(tube('humerus L', 'upperArmL', Sh.clone().addScaled(u, 0.02), El.clone().addScaled(u, -0.01), 0.012, { kind: 'bone', bone: 'humerus', long: true, label: 'left humerus', side: 'L', ais: [2, 2] }), true);
  add(tube('axillary artery L', 'upperArmL', Sh.clone().add(v(-0.034, -0.012, 0.01)), brA, 0.0055, { kind: 'artery', bleed: 16, external: 0.7, cav: 'tissue', label: 'left axillary artery', side: 'L', ais: [3, 3] }), true);
  add(tube('brachial artery L', 'upperArmL', brA, brB, 0.0045, { kind: 'artery', bleed: 9, external: 0.85, cav: 'tissue', label: 'left brachial artery', side: 'L', ais: [2, 3] }), true);
  // median / ulnar nerves run with the brachial artery; the radial nerve winds round the back of the
  // humerus (spiral groove). A cut nerve paralyses the muscles it supplies.
  add(tube('arm nerves L', 'upperArmL', brA.clone().add(v(-0.006, 0, -0.006)), brB.clone().add(v(-0.004, 0, -0.008)), 0.003, { kind: 'nerve', limb: 'armL', loss: 0.55, label: 'left median / ulnar nerves', side: 'L', ais: [2, 2] }), true);
  add(tube('radial nerve L', 'upperArmL', Sh.clone().addScaled(u, 0.12).add(v(0.012, 0, -0.018)), El.clone().addScaled(u, -0.06).add(v(0.02, 0, -0.005)), 0.003, { kind: 'nerve', limb: 'armL', loss: 0.4, label: 'left radial nerve', side: 'L', ais: [2, 2] }), true);
  add(tube('radius/ulna L', 'forearmL', El.clone().addScaled(fo, 0.015), Wr.clone().addScaled(fo, -0.01), 0.013, { kind: 'bone', bone: 'radius/ulna', long: true, label: 'left forearm bones', side: 'L', ais: [2, 2] }), true);
  add(tube('radial artery L', 'forearmL', El.clone().addScaled(fo, 0.06).add(v(0, 0, 0.018)), Wr.clone().addScaled(fo, -0.01).add(v(-0.006, 0, 0.016)), 0.0032, { kind: 'artery', bleed: 3.5, external: 0.95, cav: 'tissue', label: 'left radial artery', side: 'L', ais: [2, 2] }), true);
  add(tube('ulnar artery L', 'forearmL', El.clone().addScaled(fo, 0.06).add(v(-0.012, 0, -0.006)), Wr.clone().addScaled(fo, -0.01).add(v(-0.008, 0, -0.012)), 0.003, { kind: 'artery', bleed: 3, external: 0.95, cav: 'tissue', label: 'left ulnar artery', side: 'L', ais: [2, 2] }), true);
  add(tube('forearm nerves L', 'forearmL', El.clone().addScaled(fo, 0.05).add(v(-0.004, 0, 0.012)), Wr.clone().addScaled(fo, -0.01).add(v(-0.002, 0, 0.01)), 0.0025, { kind: 'nerve', limb: 'armL', loss: 0.3, label: 'left median nerve (forearm)', side: 'L', ais: [2, 2] }), true);
  add(ell('hand bones L', 'handL', Wr.clone().addScaled(fo, 0.05), v(0.012, 0.04, 0.035), { kind: 'bone', bone: 'hand bones', label: 'left hand bones', side: 'L', ais: [1, 2] }), true);

  // ---------------- leg (left) ----------------
  const Hp = landmark('hipL'), Kn = landmark('kneeL'), An = landmark('ankleL');
  const td = new Vec3().subVectors(Kn, Hp).normalize();
  const sd = new Vec3().subVectors(An, Kn).normalize();
  add(tube('femur L', 'thighL', Hp.clone().addScaled(td, 0.03), Kn.clone().addScaled(td, -0.015), 0.0145, { kind: 'bone', bone: 'femur', long: true, label: 'left femur', side: 'L', ais: [2, 3] }), true);
  add(tube('femoral artery L', 'thighL', v(0.072, 0.9, 0.04), v(0.078, 0.62, 0.006), 0.006, { kind: 'artery', bleed: 20, external: 0.8, cav: 'tissue', label: 'left femoral artery', side: 'L', ais: [3, 4] }), true);
  add(tube('femoral vein L', 'thighL', v(0.058, 0.9, 0.034), v(0.072, 0.62, 0.0), 0.0065, { kind: 'vein', bleed: 9, external: 0.8, cav: 'tissue', label: 'left femoral vein', side: 'L', ais: [2, 3] }), true);
  add(tube('deep femoral artery L', 'thighL', v(0.076, 0.86, 0.022), v(0.094, 0.64, -0.018), 0.0042, { kind: 'artery', bleed: 10, external: 0.6, cav: 'tissue', label: 'left deep femoral artery', side: 'L', ais: [3, 3] }), true);
  add(tube('popliteal artery L', 'thighL', v(0.08, 0.62, 0.0), v(0.094, 0.5, -0.03), 0.0055, { kind: 'artery', bleed: 13, external: 0.8, cav: 'tissue', label: 'left popliteal artery', side: 'L', ais: [3, 3] }), true);
  add(tube('femoral nerve L', 'thighL', v(0.086, 0.9, 0.046), v(0.09, 0.79, 0.042), 0.004, { kind: 'nerve', limb: 'legL', loss: 0.6, label: 'left femoral nerve', side: 'L', ais: [2, 2] }), true);
  add(tube('sciatic nerve L', 'thighL', v(0.082, 0.88, -0.068), v(0.092, 0.55, -0.035), 0.0055, { kind: 'nerve', limb: 'legL', loss: 0.45, label: 'left sciatic nerve', side: 'L', ais: [2, 2] }), true);
  add(tube('tibia L', 'shinL', Kn.clone().addScaled(sd, 0.02).add(v(-0.006, 0, 0.012)), An.clone().addScaled(sd, -0.015).add(v(-0.006, 0, 0.01)), 0.013, { kind: 'bone', bone: 'tibia', long: true, label: 'left tibia', side: 'L', ais: [2, 3] }), true);
  add(tube('tibial arteries L', 'shinL', v(0.1, 0.47, -0.02), v(0.1, 0.12, -0.03), 0.0035, { kind: 'artery', bleed: 3, external: 0.85, cav: 'tissue', label: 'left tibial arteries', side: 'L', ais: [2, 2] }), true);
  add(ell('foot bones L', 'footL', v(0.106, 0.035, 0.04), v(0.03, 0.022, 0.09), { kind: 'bone', bone: 'foot bones', label: 'left foot bones', side: 'L', ais: [1, 2] }), true);
  return S;
}

// ------------------------------------------------------------------------------------------------
// The rib cage (melee trauma: which ribs a blow loads, where a blade meets bone). Kept out of
// buildAnatomy() so the ballistics are unchanged.
//
// Rib n (1..12) leaves the spine beside thoracic vertebra n and runs round the side of the chest as
// an elliptical arc in a plane that tilts down toward the front: ribs 1-7 reach the sternum through
// their costal cartilages, 8-10 end in the cartilage of the costal margin, 11 and 12 end free in the
// flank. Arc parameter theta: 0 at the back midline, PI at the front midline. The lower ribs reach
// below the chest segment and guard the liver and spleen (bind coordinates are shared by all
// segments, so a blow to the upper abdomen finds them too).
const RIB_AXES = [
  null,
  [0.06, 0.045], [0.088, 0.062], [0.105, 0.075], [0.118, 0.085], [0.127, 0.091], [0.133, 0.095],
  [0.137, 0.097], [0.138, 0.097], [0.136, 0.095], [0.132, 0.091], [0.124, 0.085], [0.114, 0.078],
];
const RIB_DROP = [0, 0.03, 0.05, 0.065, 0.075, 0.085, 0.09, 0.095, 0.1, 0.1, 0.095, 0.07, 0.05];
// where the bony rib ends (costochondral junction, or the free tip of a floating rib)
const RIB_END = [0, 2.85, 2.85, 2.85, 2.85, 2.85, 2.85, 2.85, 2.6, 2.45, 2.3, 1.95, 1.55];
const RIB_T0 = 0.3; // rib head beside the vertebra
const RIB_ZC = -0.035; // centre of the cage (bind z)
export const RIB_SPACING = 0.0245; // vertical rib spacing at the spine (T1 at 1.47 m .. T12 at 1.2 m)

/** Bind-space point of rib n (1..12) on side 'L' (+x) or 'R' at arc parameter theta. */
export function ribPoint(n, side, theta, out = new Vec3()) {
  const [ax, az] = RIB_AXES[n];
  const yp = 1.47 - RIB_SPACING * (n - 1);
  return out.set((side === 'L' ? 1 : -1) * ax * Math.sin(theta), yp - RIB_DROP[n] * (1 - Math.cos(theta)) * 0.5, RIB_ZC - az * Math.cos(theta));
}

/** Arc range [start, end] of the bony part of rib n. */
export function ribRange(n) {
  return [RIB_T0, RIB_END[n]];
}

/**
 * The ribs around a bind-space point: for every rib on the point's side, its arc parameter at the
 * point's bearing, the vertical offset of the point from the rib (dy, m) and whether the bony rib
 * reaches that far round (bony). `radial` is the point's distance from the cage axis relative to the
 * cage at the nearest rib (1 = on the ribs, > 1 outside them). Sorted by |dy|.
 */
export function ribsNear(p) {
  const side = p.x >= 0 ? 'L' : 'R';
  const ax = Math.abs(p.x), dz = p.z - RIB_ZC;
  const out = [];
  for (let n = 1; n <= 12; n++) {
    const [a, c] = RIB_AXES[n];
    const theta = Math.atan2(ax / a, -dz / c);
    const y = 1.47 - RIB_SPACING * (n - 1) - RIB_DROP[n] * (1 - Math.cos(theta)) * 0.5;
    out.push({ n, side, theta, dy: p.y - y, radial: Math.hypot(ax / a, dz / c), bony: theta >= RIB_T0 && theta <= RIB_END[n] });
  }
  out.sort((u, w) => Math.abs(u.dy) - Math.abs(w.dy));
  return out;
}

/** AIS body region (Injury Severity Score) of a structure or of a soft-tissue wound in a segment. */
export function issRegion(segName, s = null) {
  if (s && s.face) return 'face';
  const k = segName.replace(/[LR]$/, '');
  if (k === 'head' || k === 'neck') return 'head';
  if (k === 'chest') return 'chest';
  if (k === 'abdomen') return 'abdomen';
  if (k === 'pelvis') return s && s.kind === 'bone' ? 'extremity' : s ? 'abdomen' : 'extremity';
  return 'extremity';
}

/** Long-bone axes per segment (bind pose) used for fractures. */
export function boneAxis(segName) {
  const side = segName.slice(-1);
  const map = {
    upperArm: ['shoulder', 'elbow'],
    forearm: ['elbow', 'wrist'],
    thigh: ['hip', 'knee'],
    shin: ['knee', 'ankle'],
  };
  const key = segName.slice(0, -1);
  const m = map[key];
  if (!m) return null;
  return { a: landmark(m[0] + side), b: landmark(m[1] + side) };
}

// ------------------------------------------------------------------------------------------------
// Geometry helpers (segment = path of a wound channel in bind coordinates)

const _d = new Vec3(), _e = new Vec3(), _w = new Vec3();

/** Closest distance between segment [p,q] and segment [a,b]. */
export function segSegDistance(p, q, a, b) {
  _d.subVectors(q, p);
  _e.subVectors(b, a);
  _w.subVectors(p, a);
  const A = _d.dot(_d), B = _d.dot(_e), C = _e.dot(_e), D = _d.dot(_w), E = _e.dot(_w);
  const den = A * C - B * B;
  let s, t;
  if (den < 1e-12) {
    s = 0;
    t = C > 1e-12 ? E / C : 0;
  } else {
    s = (B * E - C * D) / den;
    t = (A * E - B * D) / den;
  }
  s = Math.min(Math.max(s, 0), 1);
  t = C > 1e-12 ? Math.min(Math.max((B * s + E) / C, 0), 1) : 0;
  s = A > 1e-12 ? Math.min(Math.max((B * t - D) / A, 0), 1) : 0;
  const dx = p.x + _d.x * s - (a.x + _e.x * t);
  const dy = p.y + _d.y * s - (a.y + _e.y * t);
  const dz = p.z + _d.z * s - (a.z + _e.z * t);
  return { dist: Math.sqrt(dx * dx + dy * dy + dz * dz), s, t };
}

/** Approximate signed distance of a point to an axis-aligned ellipsoid. */
export function ellipsoidDistance(p, c, r) {
  const ax = (p.x - c.x) / r.x, ay = (p.y - c.y) / r.y, az = (p.z - c.z) / r.z;
  const k0 = Math.sqrt(ax * ax + ay * ay + az * az);
  const bx = ax / r.x, by = ay / r.y, bz = az / r.z;
  const k1 = Math.sqrt(bx * bx + by * by + bz * bz);
  if (k1 < 1e-12) return -Math.min(r.x, r.y, r.z);
  return (k0 * (k0 - 1)) / k1;
}

/**
 * Distance from a path segment to a structure's surface (negative = path passes through it) and
 * the parameter along the path of closest approach.
 */
export function pathToStructure(p, q, s) {
  if (s.type === 'tube') {
    const r = segSegDistance(p, q, s.a, s.b);
    return { dist: r.dist - s.r, at: r.s, along: r.t };
  }
  // ellipsoid: sample the path
  let best = Infinity, at = 0;
  const N = 24;
  const pt = new Vec3();
  for (let i = 0; i <= N; i++) {
    pt.lerpVectors(p, q, i / N);
    const d = ellipsoidDistance(pt, s.c, s.r);
    if (d < best) {
      best = d;
      at = i / N;
    }
  }
  return { dist: best, at, along: 0 };
}
