// Dismemberment. A shotgun at close range, a very heavy round point blank or a grenade at someone's
// feet can take a head, an arm or a leg off. The ragdoll joint is removed, so the part tumbles away
// as a real body with the hit's impulse (it stays in the world with the rest of the corpse); the
// skinned mesh is split along the bone weights into the body and a separate piece, and both cut
// ends are capped with a wet stump (meat, a fat ring, bone and marrow). A burst head is gone
// entirely and leaves a ragged neck. Gore at the cut: blood burst and mist, arterial spurts that
// weaken over a few seconds, pools under the stumps, gib chunks and splatter on the walls behind.

const DISMEMBER = {
  weightCut: 0.5, // a vertex goes with the part when this much of its skin weight is on severed bones
  // shotgun-class hits (several pellets on one segment in one shot): deposited energy (J) and the
  // pellets it takes for a fair chance (~30%); the chance climbs to certain at about 1.5x. Buckshot
  // at 3 m puts 4-9 pellets and 400-1500 J into a limb, so up close most solid hits take it off; the
  // spread and the range factor make it rare past 6 m. The head also counts the neck's pellets (one
  // passing through both counts twice), so it needs more: about certain to 4 m, even at 4.5 m, rare at 5.5 m
  pellet: {
    head: { e: 850, n: 4 }, upperArm: { e: 680, n: 3 }, forearm: { e: 420, n: 3 }, hand: { e: 230, n: 2 },
    thigh: { e: 1150, n: 5 }, shin: { e: 560, n: 3 }, foot: { e: 330, n: 2 },
  },
  // single heavy rounds (>= 3 kJ at the muzzle) point blank: chance per hit at contact range
  heavy: { hand: 0.32, forearm: 0.16, head: 0.24, foot: 0.12 },
  severedHit: 0.3, // share of a cutting shot's hits on the part that came off counted as damage to its owner
  maxSpurts: 14,
  maxGibs: 56,
};

// cut definitions by the segment that comes off: its ragdoll joint is the one removed; `bone` roots
// the skeleton subtree that goes with it; `anchor` is the bone the stump stays fixed to
const DISMEMBER_CUTS = (() => {
  const c = { head: { bone: 'Bip01_Head', anchor: 'Bip01_Neck', part: 'head', side: '', speed: [3.2, 5.5] } };
  for (const s of ['L', 'R']) {
    c['upperArm' + s] = { bone: `Bip01_${s}_UpperArm`, anchor: `Bip01_${s}_Clavicle`, part: 'arm', side: s, speed: [2.4, 4] };
    c['forearm' + s] = { bone: `Bip01_${s}_Forearm`, anchor: `Bip01_${s}_UpperArm`, part: 'arm', side: s, speed: [3, 5] };
    c['hand' + s] = { bone: `Bip01_${s}_Hand`, anchor: `Bip01_${s}_Forearm`, part: 'arm', side: s, speed: [3.5, 6] };
    c['thigh' + s] = { bone: `Bip01_${s}_Thigh`, anchor: 'Bip01_Pelvis', part: 'leg', side: s, speed: [1.4, 2.4] };
    c['shin' + s] = { bone: `Bip01_${s}_Calf`, anchor: `Bip01_${s}_Thigh`, part: 'leg', side: s, speed: [2, 3.4] };
    c['foot' + s] = { bone: `Bip01_${s}_Foot`, anchor: `Bip01_${s}_Calf`, part: 'leg', side: s, speed: [3, 5] };
  }
  return c;
})();
// limb chains, nearest the torso first: a cut takes everything below it
const DISMEMBER_CHAINS = [['head'], ['upperArmL', 'forearmL', 'handL'], ['upperArmR', 'forearmR', 'handR'], ['thighL', 'shinL', 'footL'], ['thighR', 'shinR', 'footR']];

const _dmV = new T3.Vector3(), _dmV2 = new T3.Vector3(), _dmP = new I(), _dmP2 = new I();

// ---- the cut face (both ends of a cut) -----------------------------------------------------------
const STUMP_GLSL = /* glsl */ `
varying vec4 vCut;
float dmRough = 0.3;
float dmH(vec2 p) { p = fract(p * vec2(233.34, 851.73)); p += dot(p, p + 23.45); return fract(p.x * p.y); }
float dmN(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(dmH(i), dmH(i + vec2(1, 0)), f.x), mix(dmH(i + vec2(0, 1)), dmH(i + vec2(1, 1)), f.x), f.y); }
float dmF(vec2 p) { return 0.55 * dmN(p) + 0.3 * dmN(p * 2.3 + 5.1) + 0.15 * dmN(p * 5.1 + 1.7); }
`;
const STUMP_COLOR = /* glsl */ `
  {
    vec2 q = vCut.xy; float s = vCut.z; float kind = vCut.w;
    float r = length(q);
    vec2 dirq = r > 1e-4 ? q / r : vec2(1.0, 0.0);
    float n1 = dmF(q * 3.2 + s * 17.0), n2 = dmF(q * 8.5 + s * 9.0), n3 = dmN(q * 30.0 + s * 3.0);
    float ang = dmF(dirq * 2.2 + s * 11.0); // noise around the rim without a seam
    // muscle: deep crimson, glistening, with pale fascia between the bundles and black clots
    vec3 meat = mix(vec3(0.15, 0.007, 0.007), vec3(0.5, 0.055, 0.04), smoothstep(0.2, 0.85, n2));
    float ridge = 1.0 - abs(dmF(q * 3.4 + s * 3.1) * 2.0 - 1.0);
    meat = mix(meat, vec3(0.55, 0.32, 0.27), smoothstep(0.93, 0.99, ridge) * 0.3);
    meat = mix(meat, vec3(0.045, 0.002, 0.002), smoothstep(0.6, 0.82, n1) * 0.8);
    meat *= 0.82 + 0.34 * n3;
    vec3 col = meat;
    float rr = r + 0.1 * (ang - 0.5) + 0.04 * (n3 - 0.5);
    float rough = 0.16;
    if (kind < 1.5) {
      // under the torn skin a thin, ragged yellow layer of fat
      float fat = smoothstep(0.76, 0.82, rr) * (1.0 - smoothstep(0.88, 0.93, rr));
      col = mix(col, vec3(0.6, 0.45, 0.24) * (0.8 + 0.3 * n3), fat * 0.6 * smoothstep(0.3, 0.6, n2));
      col = mix(col, vec3(0.08, 0.006, 0.004), smoothstep(0.92, 1.0, rr));
      if (kind < 0.5) {
        // a long bone: ivory cortex round a red-yellow marrow cavity, splintered and blood smeared
        vec2 bc = vec2(0.1 * (dmH(vec2(s, 1.3)) - 0.5), 0.1 * (dmH(vec2(s, 7.1)) - 0.5));
        vec2 bq = q - bc; float bl = length(bq);
        vec2 bdir = bl > 1e-4 ? bq / bl : vec2(1.0, 0.0);
        float jag = 0.6 * dmF(bdir * 1.5 + s * 5.0) + 0.4 * dmN(bdir * 7.0 + s * 2.0);
        float br = 0.24 + 0.07 * (jag - 0.5);
        float bone = 1.0 - smoothstep(br - 0.02, br + 0.005, bl);
        vec3 cortex = mix(vec3(0.8, 0.74, 0.6), vec3(0.6, 0.5, 0.38), n3);
        float cav = 1.0 - smoothstep(br * 0.4, br * 0.52, bl + 0.025 * (jag - 0.5));
        vec3 marrow = mix(vec3(0.26, 0.04, 0.025), vec3(0.46, 0.26, 0.1), smoothstep(0.45, 0.85, n2)) * (0.7 + 0.4 * n3);
        vec3 bcol = mix(cortex, marrow, cav);
        bcol = mix(bcol, vec3(0.32, 0.03, 0.02), smoothstep(0.5, 0.8, n1) * 0.65); // blood over the bone
        col = mix(col, bcol, bone);
        rough = mix(rough, 0.42, bone * (1.0 - cav));
      } else {
        // a neck: vertebra and its canal at the back, windpipe and gullet in front, two arteries
        vec2 vq = (q - vec2(0.0, -0.3)) * vec2(1.0, 1.35);
        float vb = 1.0 - smoothstep(0.2, 0.235, length(vq) + 0.04 * (n3 - 0.5));
        float canal = 1.0 - smoothstep(0.055, 0.075, length(q - vec2(0.0, -0.5)));
        float arch = (1.0 - smoothstep(0.1, 0.13, length(q - vec2(0.0, -0.5)))) * (1.0 - canal);
        col = mix(col, mix(vec3(0.8, 0.74, 0.6), vec3(0.6, 0.48, 0.36), n3), max(vb, arch));
        col = mix(col, vec3(0.5, 0.42, 0.3), canal * 0.8);
        float tl = length((q - vec2(0.0, 0.42)) * vec2(1.0, 1.25));
        col = mix(col, vec3(0.65, 0.5, 0.46), (1.0 - smoothstep(0.13, 0.16, tl)) * smoothstep(0.08, 0.1, tl));
        col = mix(col, vec3(0.02, 0.0, 0.0), 1.0 - smoothstep(0.08, 0.1, tl));
        col = mix(col, vec3(0.08, 0.01, 0.01), 1.0 - smoothstep(0.03, 0.05, length((q - vec2(0.0, 0.18)) * vec2(0.6, 1.6))));
        for (int k = 0; k < 2; k++) {
          float ar = length(q - vec2(k == 0 ? 0.3 : -0.3, 0.15));
          col = mix(col, vec3(0.03, 0.0, 0.0), 1.0 - smoothstep(0.035, 0.05, ar));
        }
        rough = mix(rough, 0.42, vb);
      }
    } else {
      // an opened skull: a jagged ring of bone, then brain matter soaked in blood
      float skull = smoothstep(0.72, 0.78, rr) * (1.0 - smoothstep(0.94, 1.0, rr));
      vec3 brain = mix(vec3(0.4, 0.24, 0.23), vec3(0.66, 0.46, 0.43), n2);
      brain *= 0.72 + 0.34 * smoothstep(0.3, 0.7, abs(sin(n1 * 26.0)));
      col = mix(meat, brain, smoothstep(0.3, 0.65, n1) * (1.0 - smoothstep(0.55, 0.72, rr)));
      col = mix(col, mix(vec3(0.8, 0.74, 0.6), vec3(0.55, 0.45, 0.35), n3), skull);
      col = mix(col, vec3(0.06, 0.003, 0.002), smoothstep(0.98, 1.05, rr));
      rough = mix(0.14, 0.45, skull);
    }
    diffuseColor.rgb = col;
    dmRough = rough;
  }`;

// chunks of meat and bone thrown out by a cut
const GIB_COLOR = /* glsl */ `
  {
    float sp = fract(sin(dot(floor(vLatP * 140.0), vec3(12.9898, 78.233, 37.719))) * 43758.5453);
    diffuseColor.rgb *= 0.72 + 0.45 * sp;
  }`;

class Dismemberment {
  constructor(game) {
    this.game = game;
    this.people = new Map(); // person -> { cuts, render, severedParents }
    this.pending = new Map(); // person -> per-segment sums of this shot's hits
    this.fates = [];
    this.spurts = Array.from({ length: DISMEMBER.maxSpurts }, () => ({ on: false, body: null, local: new I(), dir: new I(), t: 0, dur: 1, k: 1, acc: 0, rate: 1.6, pool: 0 }));
    this.crawlers = new Set();
    this.oneArmed = []; // { p, lost: 'L' | 'R' }
    this.steady = []; // hollows just relieved of an arm: firmer balance for a moment
    this.drawn = []; // render states with proxies to pose each frame
    this.stepNo = 0;
    this.gibs = null;
    this.stats = { cuts: 0 };
    game.hooks.push(this);
    // a body's render going away (level change, corpse removal) takes its pieces and caps with it
    const detach = game.detachRender.bind(game);
    game.detachRender = (person) => { this.release(person); detach(person); };
  }

  // ---- level -----------------------------------------------------------------------------------------
  onLevel() {
    const g = this.game;
    for (const p of [...this.people.keys()]) this.release(p);
    this.people.clear();
    this.pending.clear();
    this.fates.length = 0;
    this.crawlers.clear();
    this.oneArmed.length = 0;
    this.steady.length = 0;
    this.drawn.length = 0;
    for (const s of this.spurts) { s.on = false; s.body = null; }
    // materials are lit by the level's light lattice: rebuild them for the new view
    if (this.capMat) this.capMat.dispose();
    this.capMat = patchLattice(new T3.MeshStandardMaterial({ roughness: 0.3, metalness: 0 }), g.view.shared, {
      key: 'stump',
      vertexHead: 'attribute vec4 aCut;\nvarying vec4 vCut;\n',
      vertexBody: 'vCut = aCut;',
      fragmentHead: STUMP_GLSL,
      color: STUMP_COLOR,
      roughness: 'roughnessFactor = dmRough;',
    });
    this.buildGibs();
    // every queued engine effect passes here too: collect this shot's flesh hits per body segment
    const sb = g.sb, inner = sb.fx;
    sb.fx = (e) => {
      if (e.type === 'fleshHit' && e.person && e.person.severed && e.seg && e.person.severed.has(e.seg.name)) e.severedPart = true;
      inner(e);
      if (e.type === 'fleshHit') this.collect(e);
      else if (e.type === 'shot') this.onFire(e);
    };
  }

  // the sandbox's own fire() names the round it just traced: that is what the hits came from
  onFire(e) {
    const ball = Lab.Ballistics[e.weapon];
    if (!ball) return;
    for (const acc of this.pending.values()) {
      if (acc.by !== e.by || acc.shot) continue;
      acc.ball = ball;
      acc.from = e.origin.clone();
      acc.shot = true;
    }
  }

  // ---- what each shot did to each body -----------------------------------------------------------
  collect(e) {
    const g = this.game, p = e.person;
    if (!p || !p.enemy || !g.settings.gore || !e.seg || e.severedPart) return;
    let acc = this.pending.get(p);
    if (!acc) {
      const by = e.by;
      let ball = null, from = null;
      if (by === 'player') {
        const gun = g.arsenal.gun;
        ball = Lab.Ballistics[gun.ballisticKey] || Lab.Ballistics[gun.def.ballistic];
        from = g.player.eye(new I());
      } else if (by && by.gun) {
        ball = { ...Lab.Ballistics[by.gun.ballistic], pellets: by.gun.pellets || 1 };
        from = toP3(by.headPos);
      }
      // grenade fragments are handled by the blast (onExplosion)
      acc = { by, ball, from, segs: {}, events: [] };
      this.pending.set(p, acc);
    }
    const name = e.seg.name;
    const s = acc.segs[name] || (acc.segs[name] = { e: 0, n: 0, bone: 0, at: new I(), dir: new I() });
    s.e += e.energy || 0;
    s.n++;
    if (e.bone) s.bone++;
    s.at.add(e.entry);
    s.dir.add(e.dir);
    acc.events.push(e);
  }

  onShot() { this.flush(); }

  flush() {
    if (!this.pending.size) return;
    const list = [...this.pending];
    this.pending.clear();
    for (const [p, acc] of list) if (acc.ball) this.evaluate(p, acc);
  }

  // decide which parts of one body this shot takes off
  evaluate(p, acc) {
    const g = this.game;
    if (!g.settings.gore || !g.sb.people.includes(p)) return;
    const ball = acc.ball, pellets = ball.pellets || 1;
    const e0 = 0.5 * (ball.mass || 0) * (ball.speed || 0) ** 2;
    const S = acc.segs, from = acc.from;
    const plans = [];
    const dirOf = (s) => (s.dir.lengthSq() > 1e-9 ? s.dir.clone().normalize() : new I(0, 0, 1));
    for (const chain of DISMEMBER_CHAINS) {
      for (const key of chain) {
        let s = S[key];
        if (key === 'head' && S.neck) {
          // the neck's pellets count towards taking the head
          const n = S.neck;
          s = s ? { e: s.e + n.e, n: s.n + n.n, bone: s.bone + n.bone, at: s.at.clone().add(n.at), dir: s.dir.clone().add(n.dir) } : n;
        }
        if (!s || !s.n) continue;
        const at = s.at.clone().scale(1 / s.n);
        const d = from ? Math.hypot(at.x - from.x, at.y - from.y, at.z - from.z) : 5;
        const type = key.replace(/[LR]$/, '');
        let chance = 0, score = 0;
        if (pellets > 1) {
          const T = DISMEMBER.pellet[type];
          const rangeK = clamp((8 - d) / 4.5, 0, 1);
          score = (s.e / T.e) * Math.min(1, s.n / T.n) * rangeK;
          chance = clamp((score - 0.8) / 0.7, 0, 1);
        } else if (e0 >= 3000) {
          const rangeK = clamp((6 - d) / 4, 0, 1);
          chance = (DISMEMBER.heavy[type] || 0) * rangeK * (e0 >= 6000 ? 1.6 : 1) * (s.e > 700 ? 1 : 0.5);
          score = e0 / 3000;
        }
        if (chance <= 0 || Math.random() >= chance) continue;
        let kind = 'limb';
        if (key === 'head') {
          // the closer the muzzle, the likelier the whole head goes to pieces rather than off
          if (pellets > 1) kind = score > 1.3 && Math.random() < clamp((3.2 - d) / 1.6, 0, 0.8) ? 'burst' : 'limb';
          else kind = e0 >= 6000 && d < 4 && Math.random() < 0.45 ? 'burst' : 'skull';
        }
        plans.push({ key, kind, dir: dirOf(s), point: at, energy: s.e, d });
        break; // the most proximal cut in a chain takes the rest
      }
    }
    if (!plans.length) return;
    // a head always goes; otherwise at most two parts from one shot
    plans.sort((a, b) => (b.key === 'head') - (a.key === 'head') || b.energy - a.energy);
    for (const pl of plans.slice(0, pellets > 1 ? 2 : 1)) this.sever(p, pl.key, { ...pl, by: acc.by, events: acc.events });
  }

  // a grenade: limbs near the blast are torn off, a head right on top of it bursts
  onExplosion(pos, gr) {
    const g = this.game, sb = g.sb, L = g.level;
    this.pending.clear(); // the fragments' hits: the blast decides
    if (!g.settings.gore) return;
    const from = { x: pos.x, y: pos.y + 0.3, z: pos.z };
    for (const p of [...sb.people]) {
      if (!p.enemy) continue;
      const pv = p.rd.pelvis.pos;
      if (Math.hypot(pv.x - pos.x, pv.z - pos.z) > 3) continue;
      const plans = [];
      for (const chain of DISMEMBER_CHAINS) {
        // the part of the chain nearest the blast
        let best = null, bd = 1e9;
        for (const key of chain) {
          const seg = p.rd.segments[key];
          if (!seg) continue;
          const b = seg.body.pos, d = Math.hypot(b.x - pos.x, b.y - pos.y, b.z - pos.z);
          if (d < bd) { bd = d; best = key; }
        }
        if (!best) continue;
        const head = best === 'head';
        const chance = head ? clamp(1.1 - bd / 0.6, 0, 0.75) : clamp(1.35 - bd / 0.85, 0, 0.9);
        if (Math.random() >= chance) continue;
        const b = p.rd.segments[best].body.pos;
        if (!L.visible(from, b)) continue;
        // feet and hands nearest the blast usually go with the shin or forearm above them
        let key = best;
        if (/^(foot|hand)/.test(best) && Math.random() < 0.55) key = chain[1];
        const dir = new I(b.x - pos.x, Math.max(0.2, b.y - pos.y) + 0.5, b.z - pos.z).normalize();
        plans.push({ key, kind: head ? 'burst' : 'limb', dir, point: new I(b.x, b.y, b.z), energy: 2000 * clamp(1.4 - bd, 0.3, 1.4), d: bd, blast: true });
      }
      plans.sort((a, b) => a.d - b.d);
      for (const pl of plans.slice(0, plans[0] && plans[0].d < 0.45 ? 3 : 2)) this.sever(p, pl.key, { ...pl, by: gr.by });
    }
  }

  // ---- the cut ---------------------------------------------------------------------------------------
  // o: { kind: 'limb' | 'burst' | 'skull', dir (unit, the way the force went), point, energy, by }
  sever(p, key, o = {}) {
    const g = this.game, sb = g.sb, rd = p.rd;
    const def = DISMEMBER_CUTS[key], seg = rd.segments[key];
    if (!def || !seg || !sb.people.includes(p)) return null;
    const st = this.stateOf(p);
    const kind = o.kind || 'limb';
    if (kind === 'skull') {
      if (st.skull || (p.severed && p.severed.has('head'))) return null;
    } else {
      if (!seg.parent || (p.severed && p.severed.has(key))) return null; // already off (or on a part that is)
      for (let s = seg; s; s = s.parent) if (p.severed && p.severed.has(s.name)) return null;
    }
    const ai = p.enemy;
    // the part has to be a live ragdoll before it can fly
    if (ai && ai.anim && ai.anim.active) ai.anim.wake('dismember');
    if (p.dormant) sb.setDormant(p, false, { mode: 'balance' });
    // a charging hollow handed to the physical walker at full sprint would only fall: it keeps
    // coming at the pace the ragdoll can hold
    const keepOn = !!(ai && ai.hollow) && kind === 'limb' && DISMEMBER_CUTS[key] && DISMEMBER_CUTS[key].part === 'arm' && p.injury.alive;
    if (keepOn) {
      for (const b of p.rd.allBodies()) {
        const h = Math.hypot(b.vel.x, b.vel.z);
        if (h > 2) { b.vel.x *= 2 / h; b.vel.z *= 2 / h; }
      }
      p.ctl.startle = 0;
      if (p.ctl.sens) { const cv = p.ctl.sens.comVel, h = Math.hypot(cv.x, cv.z); if (h > 2) { cv.x *= 2 / h; cv.z *= 2 / h; } }
      // and the balance controller gets a firmer hand while it learns the new weight
      const c = p.ctl;
      if (!this.steady.some((s) => s.p === p)) {
        this.steady.push({ p, until: g.time + 1.6, gain: c.assistGain, v: c.vAssist });
        c.assistGain *= 1.9; c.vAssist *= 1.6;
      }
    }
    const dir = o.dir ? new I(o.dir.x, o.dir.y, o.dir.z).normalize() : new I(0, 0.3, 1).normalize();
    const rec = { key, kind, def, seg, dir, by: o.by, t: g.time, energy: o.energy || 1000, blast: !!o.blast };
    if (kind === 'skull') {
      // the top of the skull goes, the head stays on
      rec.parentBody = seg.body;
      const hb = seg.body;
      const exitL = hb.worldDirToLocal(dir, new I());
      rec.anchorP = new I(exitL.x * 0.05, 0.07, exitL.z * 0.05);
      rec.dirP = new I(exitL.x * 0.7, 1, exitL.z * 0.7).normalize();
      st.skull = rec;
    } else {
      const joint = seg.joint, parent = seg.parent;
      rec.joint = joint;
      rec.parentSeg = parent;
      rec.parentBody = joint.parent;
      rec.anchorP = joint.anchorP.clone();
      rec.anchorC = joint.anchorC.clone();
      // outward normals of the two cut faces, in their bodies' frames (the bind frames are aligned)
      rec.dirP = joint.anchorC.clone().scale(-1).normalize();
      rec.dirC = joint.anchorC.clone().normalize();
      // detach: out of the world, out of the ragdoll's joint list and family tree
      sb.world.removeJoint(joint);
      joint.enabled = false;
      const ji = rd.jointList.indexOf(joint);
      if (ji >= 0) rd.jointList.splice(ji, 1);
      const ci = parent.children.indexOf(seg);
      if (ci >= 0) parent.children.splice(ci, 1);
      seg.parent = null;
      st.stumpParents.add(parent.name);
      const parts = [];
      const walk = (s) => { parts.push(s); for (const c of s.children) walk(c); };
      walk(seg);
      rec.parts = parts;
      p.severed = p.severed || new Set();
      for (const s of parts) p.severed.add(s.name);
      p.dismembered = true;
      rec.bodies = rd.allBodies().filter((b) => b.userData && b.userData.segment && parts.includes(b.userData.segment));
      // the pellets that took the part off spent themselves on it: they count for little towards
      // putting the owner down (the cut itself is weighed in applyFate)
      if (o.events) for (const e of o.events) if (e.seg && parts.includes(e.seg)) e.dmScale = DISMEMBER.severedHit;
      for (const s of ['L', 'R']) if (p.severed.has('foot' + s)) this.dropFootSpring(p, s);
      this.patchMass(p);
      const inj = p.injury, c = p.ctl;
      if (def.part === 'arm') {
        inj.nerve['arm' + def.side] = 0; c.armStrength[def.side] = 0;
        if (ai && ai.hollow && ai.anim && p.injury.alive && kind === 'limb') this.animateArmless(ai);
        if (p.zombie && p.zombie.side) {
          const other = def.side === 'L' ? 'R' : 'L';
          const both = this.oneArmed.find((o) => o.p === p);
          if (both) { if (both.lost !== def.side) this.oneArmed.splice(this.oneArmed.indexOf(both), 1); }
          else if (!p.severed.has('upperArm' + other) && !p.severed.has('forearm' + other) && !p.severed.has('hand' + other)) this.oneArmed.push({ p, lost: def.side });
        }
      }
      if (def.part === 'leg') { inj.nerve['leg' + def.side] = 0; c.legStrength[def.side] = 0; }
      if (kind === 'burst') {
        // nothing left to fly: the head is gone from the world
        for (const b of rec.bodies) {
          sb.world.removeBody(b);
          b.pos.y = -60; b.prevPos.copy(b.pos); b.framePos.copy(b.pos);
          b.vel.setZero(); b.angVel.setZero();
        }
      } else {
        // the part flies with the hit
        const [v0, v1] = def.speed;
        const sp = (v0 + Math.random() * (v1 - v0)) * (o.blast ? 1.4 : clamp(rec.energy / 900, 0.7, 1.3));
        const kick = new I(dir.x * sp, dir.y * sp + 0.8 + Math.random() * 1.2, dir.z * sp);
        const spin = new I((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14);
        for (const b of rec.bodies) { b.vel.add(kick); b.angVel.add(spin); b.wake(); }
        // the stump side is shoved along with the blast (a hollow that keeps coming, barely)
        const pb = rec.parentBody, sh = keepOn ? 1.2 : 6;
        pb.applyImpulse(new I(dir.x * sh, 1, dir.z * sh), pb.localToWorld(rec.anchorP, new I()));
        // (the shot's queued hits must not wake it again when the manager counts them)
        if (keepOn && this.resumeCharge(ai, rec, dir) && o.events) for (const e of o.events) e.soft = true;
      }
    }
    // the wound: an arterial bleed at the stump (a destroyed head too: the pool spreads from the neck)
    this.stumpWound(p, rec);
    st.cuts.push(rec);
    rec.idx = st.cuts.length - 1;
    this.stats.cuts++;
    // the mesh
    const r = g.renders.get(p);
    if (r) {
      try { this.cutMesh(p, st, r, rec); } catch (err) { console.warn('[dismember] mesh cut failed', err); }
    }
    // credit and fate
    if (ai) {
      if (o.by === 'player' || o.by === 'player-grenade') {
        ai.lastHit = { by: 'player', seg: key === 'head' ? 'head' : key, time: g.time, weapon: o.by === 'player' ? g.arsenal.gun.id : undefined, grenade: o.by === 'player-grenade' };
      }
      if (!ai.downed && ai.cool !== undefined) { ai.cool = Math.max(ai.cool, 0.6); ai.aiming = false; ai.wantFire = false; }
      if (kind === 'burst' || (kind === 'limb' && key === 'head') || kind === 'skull') {
        // headless (or the skull open) is dead at once
        if (p.injury.alive) p.injury.kill(kind === 'skull' ? 'gunshot wound to the head (skull blown open)' : 'decapitation');
        ai.agony = null;
        if (!ai.downed) this.game.enemies.down(ai);
      } else this.fates.push({ ai, rec, at: this.stepNo + 1 });
      if (ai.downed && ai.diedAt !== undefined) ai.diedAt = Math.max(ai.diedAt, g.time - 4); // let the parts land before the corpse freezes
    }
    this.gore(p, rec);
    return rec;
  }

  stateOf(p) {
    let st = this.people.get(p);
    if (!st) { st = { cuts: [], render: null, stumpParents: new Set(), skull: null }; this.people.set(p, st); }
    return st;
  }

  // A hollow that has lost only arms goes back to its motion-captured charge once the arm has
  // landed. AnimBody refuses a dismembered body (it would pose the missing part back on), so its
  // enter() is let through for arm cuts only, and around each sync() the severed parts are put back
  // where they lie: the animation poses everything still attached and nothing else. (Dormant, the
  // severed arm is out of the world like the rest, so it simply stays where it fell.)
  animateArmless(ai) {
    const an = ai.anim, p = ai.p;
    if (!an) return;
    const sev = p.rd.allBodies().filter((b) => b.userData && b.userData.segment && p.severed.has(b.userData.segment.name));
    an._dmSev = sev.map((b) => ({ b, pos: b.pos.clone(), rot: b.rot.clone(), fp: b.framePos.clone(), fr: b.frameRot.clone(), vel: b.vel.clone(), av: b.angVel.clone() }));
    if (an._dmWrapped) return;
    an._dmWrapped = true;
    const proto = Object.getPrototypeOf(an);
    const armsOnly = () => { for (const n of p.severed) if (!/^(upperArm|forearm|hand)/.test(n)) return false; return true; };
    an.enter = (fade) => {
      if (!armsOnly() || (p.rd.extraBodies && p.rd.extraBodies.length)) return false;
      if (!an._dmForce) for (const s of an._dmSev) if (s.b.vel.lengthSq() > 0.09 || s.b.angVel.lengthSq() > 9) return false; // let it land first
      const was = p.dismembered;
      p.dismembered = false;
      try { return proto.enter.call(an, fade); } finally { p.dismembered = was; }
    };
    // joints of a part left flying while the rest is animated come out before the body wakes, which
    // puts every joint back itself
    an.wake = (reason) => {
      if (an._dmJoints) { const w = this.game.sb.world; for (const j of an._dmJoints) w.removeJoint(j); an._dmJoints = null; }
      return proto.wake.call(an, reason);
    };
    an.sync = (dt) => {
      const S = an._dmSev;
      for (let i = 0; i < S.length; i++) { const s = S[i], b = s.b; s.pos.copy(b.pos); s.rot.copy(b.rot); s.fp.copy(b.framePos); s.fr.copy(b.frameRot); s.vel.copy(b.vel); s.av.copy(b.angVel); }
      proto.sync.call(an, dt);
      for (let i = 0; i < S.length; i++) {
        const s = S[i], b = s.b;
        b.pos.copy(s.pos); b.rot.copy(s.rot); b.framePos.copy(s.fp); b.frameRot.copy(s.fr); b.vel.copy(s.vel); b.angVel.copy(s.av);
        b.computeAABB(0, 0);
      }
    };
  }

  // straight back into the charge: the body runs on the animation (with a flinch) while the arm
  // flies on its own through the world
  resumeCharge(ai, rec, dir) {
    const an = ai.anim, p = ai.p, w = this.game.sb.world;
    if (!an || !an._dmWrapped || an.active) return false;
    an._dmForce = true;
    let ok = false;
    try { ok = an.enter(0.12); } finally { an._dmForce = false; }
    if (!ok) return false;
    const parts = new Set(rec.bodies);
    for (const b of rec.bodies) { w.addBody(b); b.wake(); }
    const js = [];
    for (const j of p.rd.jointList) if (parts.has(j.parent) && parts.has(j.child)) { w.addJoint(j); js.push(j); }
    for (const j of p.rd.fractureJoints) if (parts.has(j.parent) && parts.has(j.child)) { w.addJoint(j); js.push(j); }
    an._dmJoints = js;
    an.flinch({ type: 'fleshHit', dir, energy: 800, seg: rec.parentSeg, entry: rec.parentBody.localToWorld(rec.anchorP, new I()) });
    return true;
  }

  // the controller balances, and the sandbox weighs, only what is still attached
  patchMass(p) {
    const rd = p.rd, sev = p.severed;
    const on = (b) => !(b.userData && b.userData.segment && sev.has(b.userData.segment.name));
    if (!rd._dmMass) {
      rd._dmMass = true;
      rd.computeCOM = function (A = new I()) {
        A.setZero();
        let t = 0;
        for (const b of this.allBodies()) if (on(b)) { A.addScaled(b.pos, b.mass); t += b.mass; }
        return t > 0 ? A.scale(1 / t) : A;
      };
      rd.computeCOMVelocity = function (A = new I()) {
        A.setZero();
        let t = 0;
        for (const b of this.allBodies()) if (on(b)) { A.addScaled(b.vel, b.mass); t += b.mass; }
        return t > 0 ? A.scale(1 / t) : A;
      };
    }
    let m = 0;
    for (const b of rd.allBodies()) if (on(b)) m += b.mass;
    rd.totalMass = Math.max(10, m);
  }

  // the stepping spring between a foot and the pelvis must not reel a severed foot back in
  dropFootSpring(p, side) {
    const c = p.ctl, fs = c.footSpring[side];
    if (!fs || fs._dm) return;
    this.game.sb.world.removeConstraint(fs);
    c.footSpring[side] = { _dm: true, enabled: false, offset: new I(), maxForce: 0, damping: 0, solvePosition() {}, solveVelocity() {} };
  }

  stumpWound(p, rec) {
    const inj = p.injury;
    if (!inj || !inj.addWound || !rec.parentBody) return;
    const seg = rec.kind === 'skull' ? rec.seg : rec.parentSeg;
    const q = rec.def.part === 'leg' ? 46 : rec.def.part === 'arm' ? (rec.key.startsWith('hand') ? 12 : 26) : 40;
    try {
      inj.addWound({
        body: rec.parentBody, seg, kind: 'laceration',
        local: rec.anchorP.clone().addScaled(rec.dirP, -0.01), normal: rec.dirP.clone(), dir: rec.dirP.clone(),
        radius: 0.035, severity: 1, pain: 2.4, cause: 'traumatic amputation', energy: rec.energy,
        bleeds: [inj.makeBleed(q, 'artery', { art: 0.85, ext: 1, label: 'traumatic amputation' })],
      });
      // torn skin round the rim soaks the skin and clothes about the stump (drawn, not bled from)
      const n = rec.dirP, u = new I(n.y, -n.x, 0);
      if (u.lengthSq() < 1e-4) u.set(0, n.z, -n.y);
      u.normalize();
      const v = new I().crossVectors(n, u);
      const rr = rec.def.part === 'leg' && rec.key.startsWith('thigh') ? 0.07 : rec.key === 'head' ? 0.05 : 0.045;
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * TAU + Math.random() * 1.2;
        const rad = new I().addScaled(u, Math.cos(a)).addScaled(v, Math.sin(a));
        inj.addWound({
          body: rec.parentBody, seg, kind: 'laceration',
          local: rec.anchorP.clone().addScaled(rad, rr).addScaled(n, -0.02), normal: rad.clone(), dir: rad.clone(),
          radius: 0.02, severity: 0.6, pain: 0, cause: 'traumatic amputation', energy: 0, bleeds: [],
        });
      }
    } catch (err) { console.warn('[dismember] wound', err); }
  }

  // ---- after the shot's hits have been counted: how they go down ------------------------------------
  applyFate(f) {
    const { ai, rec } = f, g = this.game, mgr = g.enemies, p = ai.p, inj = p.injury;
    if (ai.downed || !inj.alive) return;
    if (ai.hollow) {
      // the hollowed keep coming with an arm gone, and drag themselves on without a leg
      ai.tough -= ai.toughMax * (rec.def.part === 'leg' ? 0.3 : 0.22);
      if (ai.tough <= 0) { inj.kill('dismembered'); mgr.down(ai); return; }
      if (rec.def.part === 'leg') this.crawlers.add(ai);
      return;
    }
    // the living: a lost limb ends the fight; most writhe and bleed out, some die of shock at once
    ai.tough = Math.min(ai.tough, 0);
    if (Math.random() < 0.62) mgr.agonize(ai);
    else { inj.kill('traumatic amputation'); mgr.down(ai); }
  }

  // ---- per step ----------------------------------------------------------------------------------------
  step(dt) {
    const g = this.game;
    this.stepNo++;
    if (!g.sb) return;
    this.flush(); // enemy fire (friendly fire counts too)
    if (this.fates.length) {
      const due = this.fates.filter((f) => f.at < this.stepNo);
      if (due.length) {
        this.fates = this.fates.filter((f) => f.at >= this.stepNo);
        for (const f of due) this.applyFate(f);
      }
    }
    this.updateSpurts(dt);
    if (this.crawlers.size) this.updateCrawlers(dt);
    for (let i = this.steady.length - 1; i >= 0; i--) {
      const s = this.steady[i];
      if (g.time < s.until) continue;
      s.p.ctl.assistGain = s.gain; s.p.ctl.vAssist = s.v;
      this.steady.splice(i, 1);
    }
    // a one-armed hollow swings with the arm it has left (its brain alternates sides, and never
    // swings an arm too weak to strike)
    for (let i = this.oneArmed.length - 1; i >= 0; i--) {
      const o = this.oneArmed[i], br = o.p.zombie;
      if (!br || o.p.frozen || !o.p.injury.alive) { this.oneArmed.splice(i, 1); continue; }
      if (br.side === o.lost) br.side = o.lost === 'L' ? 'R' : 'L';
      // the physical walker's rake is clumsier than the animated one: a swipe in its strike window
      // that passes close to the player connects
      const atk = br.attack, tg = br.target;
      if (!atk || atk.hit || !tg || !tg.player || o.p.ctl.mode !== 'balance' || o.p.dormant) continue;
      const wu = br.def.windup, st = br.def.strike;
      if (atk.t < wu * 0.7 || atk.t > wu + st + 0.06) continue;
      const h = o.p.rd.segments['hand' + atk.side].body.pos, P = tg.player.pos;
      const yy = clamp(h.y, P.y + 0.45, P.y + tg.height);
      if (Math.hypot(h.x - P.x, h.y - yy, h.z - P.z) < tg.radius + 0.38) {
        atk.hit = true;
        g.sb.hitPlayer(br.def.damage * (0.85 + 0.3 * Math.random()), toP3(h, new I()), 'claw', o.p);
      }
    }
  }

  // a legless hollow claws itself along the floor at the player and rakes at anything in reach
  updateCrawlers(dt) {
    const g = this.game, P = g.player;
    for (const ai of this.crawlers) {
      const p = ai.p, c = p.ctl;
      if (ai.downed || !p.injury.alive || p.frozen || !g.sb.people.includes(p)) { this.crawlers.delete(ai); continue; }
      c.autoGetUp = false;
      if (c.walking) c.stopWalk('crawl');
      const cr = ai.crawl || (ai.crawl = { t: 0.4, claw: 0.8, groan: 1 + Math.random() * 2, side: 'L' });
      cr.t -= dt; cr.claw -= dt; cr.groan -= dt;
      if (c.mode === 'balance' || c.mode === 'getup') continue;
      const S = p.rd.segments, ch = S.chest.body, head = S.head.body.pos;
      const dist = Math.hypot(P.pos.x - ch.pos.x, P.pos.z - ch.pos.z) || 1;
      // round the maze, not through its walls: steer at the next corner of a path to the player
      cr.pathT = (cr.pathT || 0) - dt;
      if (cr.pathT <= 0) { cr.pathT = 1; cr.path = g.level.findPath(ch.pos, P.pos, 0.3); }
      let tx = P.pos.x, tz = P.pos.z;
      if (cr.path && cr.path.length) {
        while (cr.path.length > 1 && Math.hypot(cr.path[0].x - ch.pos.x, cr.path[0].z - ch.pos.z) < 0.5) cr.path.shift();
        tx = cr.path[0].x; tz = cr.path[0].z;
      }
      const dx = tx - ch.pos.x, dz = tz - ch.pos.z, dl = Math.hypot(dx, dz) || 1;
      const ux = dx / dl, uz = dz / dl;
      if (cr.groan <= 0) { cr.groan = 2 + Math.random() * 3; g.audio.zombieGroan('runner', head, 0.8); }
      const has = (s) => !(p.severed && (p.severed.has('hand' + s) || p.severed.has('forearm' + s) || p.severed.has('upperArm' + s)));
      // within reach: a rake at the legs
      if (dist < 1.05 && cr.claw <= 0 && P.alive) {
        cr.claw = 0.9 + Math.random() * 0.4;
        const side = has('L') ? (has('R') && Math.random() < 0.5 ? 'R' : 'L') : has('R') ? 'R' : null;
        if (side) {
          const h = S['hand' + side].body;
          h.applyImpulse(new I(ux * 3, 1.5, uz * 3), h.pos);
          g.audio.zombieSnarl('runner', head);
          g.sb.hitPlayer(HOLLOW.damage * 0.55, toP3(h.pos, new I()), 'claw', p);
        }
        continue;
      }
      if (cr.t > 0 || dist < 0.8) continue;
      // reach out with one arm, then (a beat later) haul the body after it: the torso heaves up off
      // the carpet and lurches forward a hand's length
      if (!cr.haul) {
        cr.t = 0.22;
        cr.haul = true;
        cr.side = cr.side === 'L' ? 'R' : 'L';
        cr.arm = has(cr.side) ? cr.side : has(cr.side === 'L' ? 'R' : 'L') ? (cr.side === 'L' ? 'R' : 'L') : null;
        if (cr.arm) {
          const h = S['hand' + cr.arm].body, fa = S['forearm' + cr.arm].body;
          h.applyImpulse(new I(ux * 2.8, 1.4, uz * 2.8), h.pos);
          fa.applyImpulse(new I(ux * 1.6, 0.8, uz * 1.6), fa.pos);
        }
        continue;
      }
      cr.haul = false;
      cr.t = 0.36 + Math.random() * 0.26;
      const pull = cr.arm ? 1 : 0.6;
      ch.applyImpulse(new I(ux * 38 * pull, 22, uz * 38 * pull), ch.pos);
      S.abdomen.body.applyImpulse(new I(ux * 19 * pull, 9, uz * 19 * pull), S.abdomen.body.pos);
      S.pelvis.body.applyImpulse(new I(ux * 16 * pull, 6, uz * 16 * pull), S.pelvis.body.pos);
      S.head.body.applyImpulse(new I(ux * 1.5, 2, uz * 1.5), head);
      if (cr.arm) { const h = S['hand' + cr.arm].body; h.applyImpulse(new I(-ux * 1.5, -1, -uz * 1.5), h.pos); } // the hand pulls back against the floor
    }
  }

  // ---- gore ----------------------------------------------------------------------------------------------
  gore(p, rec) {
    const g = this.game, P = g.particles, au = g.audio;
    const pb = rec.parentBody;
    const cut = toV3(pb.localToWorld(rec.anchorP, _dmP));
    const dir = toV3(rec.dir);
    const big = rec.kind === 'burst' ? 1.6 : rec.kind === 'skull' ? 1.1 : rec.def.part === 'leg' && rec.key.startsWith('thigh') ? 1.2 : rec.key === 'head' ? 1.2 : rec.key.startsWith('hand') || rec.key.startsWith('foot') ? 0.7 : 1;
    if (P) {
      // the burst: droplets and a red mist along the shot, some thrown back
      P.spray(cut, dir, Math.round(40 * big), 3 + 3 * big, 0.65, 8e-4, 0.0042, 1, 0.08);
      P.spray(cut, dir.clone().negate().add(_dmV.set(0, 0.6, 0)).normalize(), Math.round(14 * big), 1.6, 0.8, 7e-4, 0.003, 0, 0.04);
      P.spray(cut, dir, Math.round(10 * big), 2.5 + 2 * big, 0.6, 0.003, 0.009, 1, 0.25);
      P.spray(cut, dir, Math.round(3 * big), 3 + 3 * big, 0.7, 0.0012, 0.003, 2, 0.05);
      // a fine red mist thrown along the shot, and a darker cloud that hangs a moment
      P.addMist(cut, dir, Math.round(30 * big), 3.5 + 2 * big, 9047052, 0.09 + 0.05 * big, 0.7 + 0.3 * big);
      P.addMist(cut, _dmV.set(dir.x * 0.5, 0.4, dir.z * 0.5), Math.round(14 * big), 1.2, 5899782, 0.16 * big, 1.4);
      if (rec.kind !== 'limb') {
        // brain and bone
        P.spray(cut, dir, 10, 4.5, 0.7, 0.0015, 0.005, 2, 0.05);
        P.spray(cut, dir, 16, 4, 0.8, 0.003, 0.008, 3, 0.1);
        P.addMist(cut, dir, 36, 5, 9047052, 0.1, 0.9);
      }
    }
    // chunks
    const nGib = rec.kind === 'burst' ? 12 : rec.kind === 'skull' ? 7 : Math.round(3 + 3 * big);
    for (let k = 0; k < nGib; k++) {
      const brain = rec.kind !== 'limb' && Math.random() < 0.45, bone = !brain && Math.random() < 0.28;
      this.spawnGib(cut, dir, 2.2 + Math.random() * 3.2 * big, bone ? 'bone' : brain ? 'brain' : 'meat', rec.kind === 'burst' ? 1.25 : 1);
    }
    // the wall behind takes the spray
    this.wallSplats(cut, dir, rec.kind === 'burst' ? 7 : 4, 0.22 + 0.2 * big);
    // the floor under the cut
    const fy = g.sb.world.surfaceAt(cut.x, cut.z, cut.y + 0.2);
    if (cut.y - fy < 1.4) g.view.decals.addPoolVolume(cut.x, cut.z, 60 * big);
    // arterial spurts from the stump, a dribble from the part
    if (rec.kind !== 'skull') {
      this.addSpurt(pb, rec.anchorP, rec.dirP, rec.kind === 'burst' || rec.key === 'head' ? 1.25 : rec.def.part === 'leg' ? 1.1 : rec.key.startsWith('hand') ? 0.6 : 0.9, 3.2 + Math.random() * 2.2, p.injury.alive ? 1.55 : 1.9);
      if (rec.kind === 'limb' && rec.seg) this.addSpurt(rec.seg.body, rec.anchorC, rec.dirC, 0.35, 1.6 + Math.random(), 2.4);
    } else this.addSpurt(pb, rec.anchorP, rec.dirP, 0.55, 2.5, 1.7);
    // the sound: a wet tear, a bone giving way
    au.splat(1, toP3(cut));
    au.boneCrack(rec.key.startsWith('hand') || rec.key.startsWith('foot') ? 0.7 : 1, toP3(cut));
    if (g.sfx && g.sfx.gore) g.sfx.gore(toP3(cut), clamp(big, 0.5, 1.5));
  }

  wallSplats(from, dir, n, size) {
    const g = this.game, world = g.sb.world;
    const o = toP3(from, _dmP2);
    for (let k = 0; k < n; k++) {
      const d = new I(dir.x + (Math.random() - 0.5) * 0.7, dir.y + (Math.random() - 0.5) * 0.5 + 0.05, dir.z + (Math.random() - 0.5) * 0.7).normalize();
      const h = world.raycast(o, d, 3.2, (b) => b.userData && b.userData.level);
      if (!h || h.ground || !h.body) continue;
      const nrm = toV3(h.normal, new T3.Vector3()), pt = toV3(h.point, new T3.Vector3());
      const s = clamp(size * (1.25 - h.tIn / 3.5) * (0.6 + Math.random() * 0.8), 0.08, 0.75);
      g.view.wallDecals.add(Math.abs(nrm.y) > 0.7 || Math.random() < 0.6 ? 'blood' : 'drip', pt, nrm, s);
    }
  }

  addSpurt(body, local, dirLocal, k, dur, rate) {
    let s = this.spurts.find((x) => !x.on);
    if (!s) { s = this.spurts.reduce((a, b) => (a.t / a.dur > b.t / b.dur ? a : b)); }
    s.on = true; s.body = body; s.local.copy(local); s.dir.copy(dirLocal);
    s.t = 0; s.dur = dur; s.k = k; s.acc = 0; s.rate = rate; s.phase = Math.random();
  }

  updateSpurts(dt) {
    const g = this.game, P = g.particles, decals = g.view.decals, world = g.sb.world;
    if (!P) return;
    for (const s of this.spurts) {
      if (!s.on) continue;
      s.t += dt;
      if (s.t >= s.dur || !s.body) { s.on = false; s.body = null; continue; }
      const life = 1 - s.t / s.dur;
      // the heart pushes in beats: a hard pulse, then a dribble between
      const ph = (s.phase + s.t * s.rate) % 1;
      const pulse = ph < 0.28 ? Math.sin((ph / 0.28) * Math.PI) : 0;
      const flow = s.k * life * (0.18 + 0.82 * pulse);
      s.acc += flow * dt * 70;
      const o = s.body.localToWorld(s.local, _dmP), d = s.body.localDirToWorld(s.dir, _dmP2);
      if (s.acc >= 1) {
        const n = Math.floor(s.acc);
        s.acc -= n;
        _dmV.set(o.x, o.y, o.z);
        _dmV2.set(d.x, d.y - 0.15, d.z).normalize();
        P.spray(_dmV, _dmV2, n, 0.5 + 3.4 * flow * (0.4 + 0.6 * pulse), 0.16 + 0.12 * (1 - pulse), 7e-4, 0.0032, pulse > 0.5 ? 1 : 0, 0.06);
        if (pulse > 0.85 && Math.random() < 0.3) P.addMist(_dmV, _dmV2, 4, 1.2 * flow, 10490386, 0.03, 0.35);
      }
      // a stump lying on the floor pools where it lies
      const fy = world.surfaceAt(o.x, o.z, o.y + 0.2);
      if (o.y - fy < 0.35) decals.addPoolVolume(o.x + d.x * 0.05, o.z + d.z * 0.05, flow * dt * 160);
    }
  }

  // ---- gibs: pooled instanced chunks with a little ballistics ------------------------------------------
  buildGibs() {
    const g = this.game;
    if (!this.gibs) {
      const geo = new T3.SphereGeometry(1, 8, 6);
      const pos = geo.attributes.position;
      // lumpy: a jitter hashed from the position, so the seam's doubled vertices stay together
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
        const h = Math.sin(Math.round(x * 1e3) * 12.9898 + Math.round(y * 1e3) * 78.233 + Math.round(z * 1e3) * 37.719) * 43758.5453;
        const k = 0.6 + 0.65 * (h - Math.floor(h));
        pos.setXYZ(i, x * k, y * k * 0.75, z * k);
      }
      geo.computeVertexNormals();
      const n = DISMEMBER.maxGibs;
      this.gibs = { geo, mesh: null, list: Array.from({ length: n }, () => ({ on: false, p: new T3.Vector3(), v: new T3.Vector3(), q: new T3.Quaternion(), w: new T3.Vector3(), s: new T3.Vector3(1, 1, 1), t: 0, rest: false, landed: false })), next: 0, m: new T3.Matrix4(), dq: new T3.Quaternion(), col: new T3.Color() };
    }
    const G = this.gibs;
    if (G.mesh) { G.mesh.removeFromParent(); G.mesh.material.dispose(); G.mesh.dispose(); }
    const mat = patchLattice(new T3.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5, metalness: 0 }), g.view.shared, { key: 'gib', color: GIB_COLOR });
    G.mesh = new T3.InstancedMesh(G.geo, mat, DISMEMBER.maxGibs);
    G.mesh.instanceMatrix.setUsage(T3.DynamicDrawUsage);
    G.mesh.frustumCulled = false;
    G.mesh.castShadow = true;
    G.mesh.count = 0;
    for (let i = 0; i < DISMEMBER.maxGibs; i++) G.mesh.setColorAt(i, G.col.setRGB(0.3, 0.02, 0.02));
    for (const gb of G.list) gb.on = false;
    g.view.scene.add(G.mesh);
  }

  spawnGib(at, dir, speed, kind, size = 1) {
    const G = this.gibs;
    if (!G) return;
    // the oldest chunk is recycled when the pool is full
    const gb = G.list[G.next];
    const i = G.next;
    G.next = (G.next + 1) % G.list.length;
    gb.on = true; gb.t = 0; gb.rest = false; gb.landed = false;
    gb.p.set(at.x, at.y, at.z);
    gb.v.set(dir.x + (Math.random() - 0.5) * 1.1, dir.y + 0.35 + Math.random() * 0.6, dir.z + (Math.random() - 0.5) * 1.1).normalize().multiplyScalar(speed);
    gb.q.setFromEuler(new T3.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6));
    gb.w.set((Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30);
    const r = (kind === 'bone' ? 0.005 + Math.random() * 0.007 : 0.008 + Math.random() * 0.016) * size;
    gb.s.set(r * (0.8 + Math.random() * 0.6), r * (0.55 + Math.random() * 0.45), r * (kind === 'bone' ? 1.8 + Math.random() * 1.2 : 0.8 + Math.random() * 0.7));
    gb.kind = kind;
    const c = G.col;
    if (kind === 'bone') c.setRGB(0.34, 0.26, 0.19);
    else if (kind === 'brain') c.setRGB(0.5, 0.3, 0.28);
    else c.setRGB(0.2 + Math.random() * 0.14, 0.015, 0.012);
    G.mesh.setColorAt(i, c);
    G.mesh.instanceColor.needsUpdate = true;
    G.mesh.count = Math.max(G.mesh.count, i + 1);
  }

  frame(dt, simDt) {
    const G = this.gibs, g = this.game;
    if (!G || !G.mesh || !g.sb) return;
    const L = g.level, world = g.sb.world;
    let any = false;
    for (let i = 0; i < G.mesh.count; i++) {
      const gb = G.list[i];
      if (!gb.on) { G.m.makeScale(0, 0, 0); G.mesh.setMatrixAt(i, G.m); continue; }
      if (!gb.rest && simDt > 0) {
        any = true;
        const h = simDt;
        gb.t += h;
        gb.v.y -= 9.81 * h;
        gb.v.multiplyScalar(Math.exp(-h * 0.4));
        const nx = gb.p.x + gb.v.x * h, nz = gb.p.z + gb.v.z * h;
        // walls and props: bounce off with most of the speed gone (a wet smack leaves a mark)
        if (!L.free(nx, nz, 0.01) && gb.p.y < L.ceiling) {
          if (!L.free(nx, gb.p.z, 0.01)) gb.v.x *= -0.25;
          if (!L.free(gb.p.x, nz, 0.01)) gb.v.z *= -0.25;
          gb.v.y *= 0.5;
          if (Math.random() < 0.5) {
            const n = new T3.Vector3(-Math.sign(gb.v.x) * (Math.abs(gb.v.x) > Math.abs(gb.v.z) ? 1 : 0), 0, -Math.sign(gb.v.z) * (Math.abs(gb.v.z) >= Math.abs(gb.v.x) ? 1 : 0));
            if (n.lengthSq() > 0) g.view.wallDecals.add('blood', gb.p.clone(), n, 0.06 + Math.random() * 0.06);
          }
        } else { gb.p.x = nx; gb.p.z = nz; }
        gb.p.y += gb.v.y * h;
        const fy = world.surfaceAt(gb.p.x, gb.p.z, gb.p.y + 0.3) + gb.s.y * 0.7;
        if (gb.p.y <= fy) {
          gb.p.y = fy;
          if (!gb.landed) {
            gb.landed = true;
            g.view.decals.splat(gb.p.x, gb.p.z, 0.02 + gb.s.x * 1.6, 0, 0.9, 1 + Math.min(2, Math.hypot(gb.v.x, gb.v.z) * 0.5), Math.atan2(gb.v.z, gb.v.x), Math.random());
            if (Math.random() < 0.4) g.audio.impact('flesh', 0.25, toP3(gb.p));
          }
          gb.v.y = -gb.v.y * 0.18;
          gb.v.x *= 0.45; gb.v.z *= 0.45;
          gb.w.multiplyScalar(0.4);
          if (Math.abs(gb.v.y) < 0.2 && Math.hypot(gb.v.x, gb.v.z) < 0.12) gb.rest = true;
        }
        if (gb.t > 8) gb.rest = true;
        const wl = gb.w.length();
        if (wl > 1e-3) { G.dq.setFromAxisAngle(_dmV.copy(gb.w).multiplyScalar(1 / wl), wl * h); gb.q.premultiply(G.dq); }
      }
      G.m.compose(gb.p, gb.q, gb.s);
      G.mesh.setMatrixAt(i, G.m);
    }
    G.mesh.instanceMatrix.needsUpdate = true;
    void any;
  }

  // stump proxies follow their anchor bones; done after the characters are posed this frame
  beforeRender() {
    for (let i = 0; i < this.drawn.length; i++) {
      const R = this.drawn[i];
      if (R.person.frozen && R.still) continue; // a frozen corpse's bones no longer move
      const xs = R.proxies;
      for (let k = 0; k < xs.length; k++) xs[k].obj.matrixWorld.multiplyMatrices(xs[k].anchor.matrixWorld, xs[k].K);
      R.still = !!R.person.frozen;
    }
  }

  // ---- mesh: split the skinned character along the cut -------------------------------------------------
  renderOf(p, r) {
    const st = this.stateOf(p);
    if (st.render) return st.render;
    const meshes = r.binder.meshes.map((mesh) => {
      const geo = mesh.geometry;
      return { mesh, geo0: geo, skel0: mesh.skeleton, n: geo.attributes.position.count, owner: new Int8Array(geo.attributes.position.count).fill(-1), keep: null, geo: null, skel: null };
    });
    const skel0 = meshes[0].skel0;
    const bones = new Map(), inv = new Map();
    skel0.bones.forEach((b, i) => { bones.set(b.name, b); inv.set(b.name, skel0.boneInverses[i]); });
    // which way the face looks in the model's own (attribute) space: from the head to the eyes
    const bindPos = (name) => (inv.has(name) ? new T3.Vector3().setFromMatrixPosition(new T3.Matrix4().copy(inv.get(name)).invert()) : null);
    const hp = bindPos('Bip01_Head'), el = bindPos('Bip01_LEye'), er = bindPos('Bip01_REye');
    const fwd = new T3.Vector3(0, 0, 1);
    if (hp && el && er) { fwd.copy(el).add(er).multiplyScalar(0.5).sub(hp); fwd.y = 0; if (fwd.lengthSq() < 1e-8) fwd.set(0, 0, 1); fwd.normalize(); }
    fwd.transformDirection(new T3.Matrix4().copy(meshes[0].mesh.bindMatrix).invert());
    st.render = { person: p, r, meshes, bones, inv, bindPos, fwd, proxies: [], mainProxy: new Map(), mainSkels: new Map(), pieces: [], caps: [], still: false, scene: r.scene };
    this.drawn.push(st.render);
    return st.render;
  }

  // a bone's subtree, by name
  subtree(root) {
    const out = new Set();
    const walk = (b) => { out.add(b.name); for (const c of b.children) if (c.isBone) walk(c); };
    walk(root);
    return out;
  }

  cutMesh(p, st, r, rec) {
    const R = this.renderOf(p, r);
    const root = R.bones.get(rec.def.bone);
    if (!root) return;
    const cutIdx = rec.idx;
    const destroy = rec.kind === 'burst' || rec.kind === 'skull';
    // bones that go with this cut (minus anything already off)
    let set;
    if (rec.kind === 'skull') set = this.subtree(R.bones.get('Bip01_Head'));
    else {
      set = this.subtree(root);
      for (const c of st.cuts) if (c !== rec && c.boneSet) for (const n of c.boneSet) set.delete(n);
    }
    rec.boneSet = rec.kind === 'skull' ? new Set() : set;
    // the skull's cut plane, in bind space: above the brow, tilted towards the exit
    let plane = null;
    if (rec.kind === 'skull') {
      // in bind space: a plane just above the brow, dropping towards the side the round left by
      const hb = new T3.Matrix4().copy(R.inv.get('Bip01_Head')).invert();
      const hp = R.bindPos('Bip01_Head'), el = R.bindPos('Bip01_LEye'), er = R.bindPos('Bip01_REye');
      const ep = el && er ? el.clone().add(er).multiplyScalar(0.5) : hp.clone();
      const head = R.bones.get('Bip01_Head');
      const exit = toV3(rec.dir, new T3.Vector3()).transformDirection(new T3.Matrix4().copy(head.matrixWorld).invert()).transformDirection(hb);
      exit.y = 0;
      const n = new T3.Vector3(0, 1, 0).addScaledVector(exit, 0.55).normalize();
      const p0 = ep.clone().add(new T3.Vector3(0, 0.03, 0));
      plane = { n, d: n.dot(p0) };
    }
    const bm = new T3.Vector3();
    // ownership: which vertices go with the cut
    for (const m of R.meshes) {
      const geo = m.geo0, si = geo.attributes.skinIndex, sw = geo.attributes.skinWeight, pos = geo.attributes.position;
      const inSet = m.skel0.bones.map((b) => set.has(b.name));
      const bmat = m.mesh.bindMatrix;
      for (let v = 0; v < m.n; v++) {
        if (m.owner[v] !== -1) continue;
        const w = (inSet[si.getX(v)] ? sw.getX(v) : 0) + (inSet[si.getY(v)] ? sw.getY(v) : 0) + (inSet[si.getZ(v)] ? sw.getZ(v) : 0) + (inSet[si.getW(v)] ? sw.getW(v) : 0);
        if (w < DISMEMBER.weightCut) continue;
        if (plane) {
          bm.set(pos.getX(v), pos.getY(v), pos.getZ(v)).applyMatrix4(bmat);
          if (bm.dot(plane.n) < plane.d) continue;
        }
        m.owner[v] = destroy ? -2 : cutIdx;
      }
    }
    // the body: proxies hold severed bones fixed to the stump
    for (const n of set) {
      if (rec.kind === 'skull') break;
      let x = R.mainProxy.get(n);
      if (!x) { x = { obj: new T3.Object3D(), anchor: null, K: new T3.Matrix4(), name: n }; R.mainProxy.set(n, x); R.proxies.push(x); }
      x.cut = rec;
    }
    // re-anchor every proxy on the body to the nearest bone still attached
    const anchorOf = (cutRec) => {
      let a = cutRec.def.anchor;
      for (let guard = 0; guard < 8; guard++) {
        const owner = st.cuts.find((c) => c.boneSet && c.boneSet.has(a));
        if (!owner) break;
        a = owner.def.anchor;
      }
      return a;
    };
    for (const [n, x] of R.mainProxy) this.setProxy(R, x, n, anchorOf(x.cut));
    // body geometry and skeleton
    const capsMain = [];
    for (const m of R.meshes) {
      const tri = m.geo0.index.array, nt = tri.length / 3;
      const prevKeep = m.keep;
      const keep = new Uint8Array(nt);
      let count = 0;
      for (let t = 0; t < nt; t++) {
        if (prevKeep && !prevKeep[t]) continue;
        if (m.owner[tri[3 * t]] === -1 && m.owner[tri[3 * t + 1]] === -1 && m.owner[tri[3 * t + 2]] === -1) { keep[t] = 1; count++; }
      }
      // newly opened edges: shared between a kept triangle and one just removed
      const info = this.meshInfo(m.geo0);
      const removed = new Set();
      for (let t = 0; t < nt; t++) {
        if ((prevKeep ? prevKeep[t] : 1) && !keep[t]) for (let k = 0; k < 3; k++) removed.add(info.key(tri[3 * t + k], tri[3 * t + (k + 1) % 3]));
      }
      const edges = [];
      for (let t = 0; t < nt; t++) {
        if (!keep[t]) continue;
        for (let k = 0; k < 3; k++) {
          const a = tri[3 * t + k], b = tri[3 * t + (k + 1) % 3];
          if (removed.has(info.key(a, b))) edges.push(a, b);
        }
      }
      m.keep = keep;
      const idx = new (m.n > 65535 ? Uint32Array : Uint16Array)(count * 3);
      let j = 0;
      for (let t = 0; t < nt; t++) if (keep[t]) { idx[j++] = tri[3 * t]; idx[j++] = tri[3 * t + 1]; idx[j++] = tri[3 * t + 2]; }
      const old = m.geo;
      m.geo = this.sharedGeo(m.geo0, idx);
      m.mesh.geometry = m.geo;
      if (old) this.disposeShared(old);
      if (!m.skel) {
        m.skel = this.skeletonFor(R, R.mainSkels, m.skel0, (name, bone) => (R.mainProxy.has(name) ? R.mainProxy.get(name).obj : bone));
        m.mesh.bind(m.skel, m.mesh.bindMatrix);
      } else this.refreshSkeleton(m.skel, m.skel0, (name, bone) => (R.mainProxy.has(name) ? R.mainProxy.get(name).obj : bone));
      if (edges.length) capsMain.push({ m, edges });
    }
    const anchorName = rec.kind === 'skull' ? 'Bip01_Head' : anchorOf(rec);
    const kindCode = rec.kind === 'skull' ? 2 : rec.key === 'head' ? 1 : 0;
    // stump caps already on this side that now belong to the part that came off move with it
    const moving = R.caps.filter((c) => c.side === 'main' && set.has(c.anchor));
    for (const cm of this.buildCaps(R, capsMain, anchorName, kindCode, 'main', (m) => m.skel)) R.caps.push(cm);
    if (destroy) {
      for (const c of moving) { c.mesh.removeFromParent(); this.disposeCap(c); R.caps.splice(R.caps.indexOf(c), 1); }
      return;
    }
    // the part: its own meshes over the same vertices, bones it lost proxied to its root
    const piece = { rec, meshes: [], skels: new Map(), proxy: new Map() };
    const capsPiece = [];
    for (const m of R.meshes) {
      const tri = m.geo0.index.array, nt = tri.length / 3;
      const mine = new Uint8Array(nt);
      let count = 0;
      for (let t = 0; t < nt; t++) if (m.owner[tri[3 * t]] === cutIdx && m.owner[tri[3 * t + 1]] === cutIdx && m.owner[tri[3 * t + 2]] === cutIdx) { mine[t] = 1; count++; }
      if (!count) continue;
      const info = this.meshInfo(m.geo0);
      // its open edges: shared with a triangle that is not part of the piece
      const touch = new Set();
      for (let t = 0; t < nt; t++) if (mine[t]) for (let k = 0; k < 3; k++) touch.add(info.weld[tri[3 * t + k]]);
      const other = new Set();
      for (let t = 0; t < nt; t++) {
        if (mine[t]) continue;
        const a = tri[3 * t], b = tri[3 * t + 1], c = tri[3 * t + 2];
        if (!touch.has(info.weld[a]) && !touch.has(info.weld[b]) && !touch.has(info.weld[c])) continue;
        other.add(info.key(a, b)); other.add(info.key(b, c)); other.add(info.key(c, a));
      }
      const edges = [];
      const idx = new (m.n > 65535 ? Uint32Array : Uint16Array)(count * 3);
      let j = 0;
      for (let t = 0; t < nt; t++) {
        if (!mine[t]) continue;
        for (let k = 0; k < 3; k++) {
          const a = tri[3 * t + k], b = tri[3 * t + (k + 1) % 3];
          idx[j++] = a;
          if (other.has(info.key(a, b))) edges.push(a, b);
        }
      }
      const pmSkel = this.skeletonFor(R, piece.skels, m.skel0, (name, bone) => {
        if (set.has(name)) return bone;
        let x = piece.proxy.get(name);
        if (!x) { x = { obj: new T3.Object3D(), anchor: null, K: new T3.Matrix4(), name }; this.setProxy(R, x, name, rec.def.bone); piece.proxy.set(name, x); R.proxies.push(x); }
        return x.obj;
      });
      const geo = this.sharedGeo(m.geo0, idx);
      const pm = new T3.SkinnedMesh(geo, m.mesh.material);
      this.mirrorSkinned(pm, m.mesh, pmSkel);
      R.scene.add(pm);
      piece.meshes.push(pm);
      if (edges.length) capsPiece.push({ m, edges, skel: pmSkel });
    }
    for (const cm of this.buildCaps(R, capsPiece, rec.def.bone, kindCode === 1 ? 1 : 0, 'piece', (m) => capsPiece.find((x) => x.m === m).skel)) { cm.piece = piece; R.caps.push(cm); }
    for (const c of moving) {
      // a cap from an earlier cut rides on the part now
      const sk = piece.skels.values().next().value;
      if (sk) { c.mesh.bind(sk, c.mesh.bindMatrix); c.side = 'piece'; }
    }
    R.pieces.push(piece);
  }

  setProxy(R, x, name, anchorName) {
    if (!R.bones.has(anchorName)) anchorName = R.bones.has('Bip01_Pelvis') ? 'Bip01_Pelvis' : R.bones.keys().next().value;
    const anchor = R.bones.get(anchorName);
    x.anchor = anchor;
    // skin(bone) == skin(anchor): proxy world = anchorWorld * inv(anchor) * inverse(inv(bone))
    x.K.copy(R.inv.get(name)).invert().premultiply(R.inv.get(anchorName));
    x.obj.matrixWorld.multiplyMatrices(anchor.matrixWorld, x.K);
  }

  // one skeleton per distinct original skin (the character's meshes normally share one)
  skeletonFor(R, cache, skel0, pick) {
    let s = cache.get(skel0.boneInverses);
    if (s && s.bones.length === skel0.bones.length) return s;
    s = new skel0.constructor(skel0.bones.map((b) => pick(b.name, b)), skel0.boneInverses);
    cache.set(skel0.boneInverses, s);
    return s;
  }
  refreshSkeleton(skel, skel0, pick) {
    for (let i = 0; i < skel0.bones.length; i++) skel.bones[i] = pick(skel0.bones[i].name, skel0.bones[i]);
  }

  mirrorSkinned(dst, src, skel) {
    dst.bindMode = src.bindMode;
    dst.position.set(0, 0, 0); dst.quaternion.identity(); dst.scale.set(1, 1, 1);
    dst.updateMatrix();
    dst.bind(skel, src.bindMatrix);
    dst.updateMatrixWorld(true);
    dst.matrixAutoUpdate = false;
    dst.frustumCulled = false;
    dst.castShadow = true;
    dst.receiveShadow = true;
  }

  // a geometry over the original's vertex buffers with its own index
  sharedGeo(geo0, idx) {
    const g = new T3.BufferGeometry();
    for (const k in geo0.attributes) g.setAttribute(k, geo0.attributes[k]);
    g.setIndex(new T3.BufferAttribute(idx, 1));
    g.userData.dmShared = true;
    return g;
  }
  // free only what is ours (the index): the vertex buffers belong to the shared character model
  disposeShared(g) {
    for (const k of Object.keys(g.attributes)) g.deleteAttribute(k);
    g.dispose();
  }

  // welded vertex ids (UV seams split vertices) and an edge key
  meshInfo(geo) {
    const cache = this._info || (this._info = new WeakMap());
    let info = cache.get(geo);
    if (info) return info;
    const pos = geo.attributes.position, n = pos.count, weld = new Int32Array(n), map = new Map();
    for (let i = 0; i < n; i++) {
      const k = Math.round(pos.getX(i) * 2e4) + ',' + Math.round(pos.getY(i) * 2e4) + ',' + Math.round(pos.getZ(i) * 2e4);
      let w = map.get(k);
      if (w === undefined) { w = i; map.set(k, w); }
      weld[i] = w;
    }
    info = { weld, n, key: (a, b) => { const x = weld[a], y = weld[b]; return x < y ? x * n + y : y * n + x; } };
    cache.set(geo, info);
    return info;
  }

  // fill the openings with a cut face: a fan from each loop's centre, through a bulging ring of meat
  buildCaps(R, groups, anchorName, kind, side, skelOf) {
    const out = [];
    // group by skeleton so the caps of meshes sharing a skin become one draw
    const bySkel = new Map();
    for (const gr of groups) {
      const sk = skelOf(gr.m);
      if (!bySkel.has(sk)) bySkel.set(sk, []);
      bySkel.get(sk).push(gr);
    }
    const seed = Math.random();
    for (const [skel, list] of bySkel) {
      const P = [], N = [], SI = [], SW = [], C = [], IDX = [];
      const anchorIdx = list[0].m.skel0.bones.findIndex((b) => b.name === anchorName);
      for (const { m, edges } of list) {
        const geo = m.geo0, pos = geo.attributes.position, si = geo.attributes.skinIndex, sw = geo.attributes.skinWeight;
        const info = this.meshInfo(geo);
        // loops: union-find over welded vertices
        const parent = new Map();
        const find = (a) => { while (parent.get(a) !== a) { parent.set(a, parent.get(parent.get(a))); a = parent.get(a); } return a; };
        const join = (a, b) => { if (!parent.has(a)) parent.set(a, a); if (!parent.has(b)) parent.set(b, b); const x = find(a), y = find(b); if (x !== y) parent.set(x, y); };
        for (let e = 0; e < edges.length; e += 2) join(info.weld[edges[e]], info.weld[edges[e + 1]]);
        const loops = new Map();
        for (let e = 0; e < edges.length; e += 2) {
          const r = find(info.weld[edges[e]]);
          if (!loops.has(r)) loops.set(r, []);
          loops.get(r).push(edges[e], edges[e + 1]);
        }
        const vp = (i, out) => out.set(pos.getX(i), pos.getY(i), pos.getZ(i));
        const A = new T3.Vector3(), B = new T3.Vector3(), c = new T3.Vector3(), nrm = new T3.Vector3(), t1 = new T3.Vector3(), t2 = new T3.Vector3();
        for (const le of loops.values()) {
          if (le.length < 6) continue;
          // centre of the loop's distinct vertices
          const uniq = new Map();
          for (const v of le) if (!uniq.has(info.weld[v])) uniq.set(info.weld[v], v);
          c.set(0, 0, 0);
          for (const v of uniq.values()) c.add(vp(v, A));
          c.multiplyScalar(1 / uniq.size);
          // facing: the fan (b, a, centre) continues the surface's winding
          nrm.set(0, 0, 0);
          for (let e = 0; e < le.length; e += 2) {
            vp(le[e], A); vp(le[e + 1], B);
            t1.subVectors(A, B); t2.subVectors(c, B);
            nrm.add(t1.cross(t2));
          }
          if (nrm.lengthSq() < 1e-14) continue;
          nrm.normalize();
          let rad = 0;
          for (const v of uniq.values()) { vp(v, A).sub(c); A.addScaledVector(nrm, -A.dot(nrm)); rad += A.length(); }
          rad = Math.max(0.01, (rad / uniq.size) * 1.12);
          // in-plane axes: for a neck +w is the throat (the face's side), for a limb anything
          const w = new T3.Vector3().copy(kind === 1 ? R.fwd : _dmV.set(0.3, 0.2, 1));
          w.addScaledVector(nrm, -w.dot(nrm));
          if (w.lengthSq() < 1e-6) w.set(0, 1, 0).addScaledVector(nrm, -nrm.y);
          w.normalize();
          const u = new T3.Vector3().crossVectors(w, nrm);
          const base = P.length / 3;
          const ring = new Map(); // welded -> [boundary vertex, ring vertex]
          const pushV = (x, y, z, nx, ny, nz, src, cx, cy, flags) => {
            P.push(x, y, z); N.push(nx, ny, nz);
            if (src >= 0) { SI.push(si.getX(src), si.getY(src), si.getZ(src), si.getW(src)); SW.push(sw.getX(src), sw.getY(src), sw.getZ(src), sw.getW(src)); }
            else { SI.push(Math.max(0, anchorIdx), 0, 0, 0); SW.push(1, 0, 0, 0); }
            C.push(cx, cy, seed * 7.3 + flags, kind);
            return P.length / 3 - 1;
          };
          const bulge = kind === 2 ? -0.12 : kind === 1 ? 0.04 : 0.12;
          const ci = pushV(c.x + nrm.x * rad * (bulge + 0.04), c.y + nrm.y * rad * (bulge + 0.04), c.z + nrm.z * rad * (bulge + 0.04), nrm.x, nrm.y, nrm.z, -1, 0, 0, 0);
          for (const [wid, v] of uniq) {
            vp(v, A);
            const d = t1.subVectors(A, c), rr = d.length() || 1e-6;
            const cx = d.dot(u) / rad, cy = d.dot(w) / rad;
            const radial = t2.copy(d).addScaledVector(nrm, -d.dot(nrm)).normalize();
            const bn = B.copy(nrm).addScaledVector(radial, 0.55).normalize();
            const bi = pushV(A.x, A.y, A.z, bn.x, bn.y, bn.z, v, cx, cy, 0);
            const jag = kind === 1 ? (Math.random() - 0.4) * 0.14 : (Math.random() - 0.5) * 0.1;
            const k = 0.6 + (kind === 1 ? (Math.random() - 0.5) * 0.12 : 0);
            const rp = B.copy(c).addScaledVector(d, k).addScaledVector(nrm, rad * (bulge + jag));
            const rn = t1.copy(nrm).addScaledVector(radial, 0.25 + (Math.random() - 0.5) * 0.3).normalize();
            const ri = pushV(rp.x, rp.y, rp.z, rn.x, rn.y, rn.z, v, cx * k, cy * k, 0);
            ring.set(wid, [bi, ri]);
            void rr;
          }
          for (let e = 0; e < le.length; e += 2) {
            const a = ring.get(info.weld[le[e]]), b = ring.get(info.weld[le[e + 1]]);
            if (!a || !b) continue;
            // (b, a, centre) split through the ring
            IDX.push(b[0], a[0], a[1], b[0], a[1], b[1], b[1], a[1], ci);
          }
          void base;
        }
      }
      if (!IDX.length) continue;
      const geo = new T3.BufferGeometry();
      geo.setAttribute('position', new T3.Float32BufferAttribute(P, 3));
      geo.setAttribute('normal', new T3.Float32BufferAttribute(N, 3));
      geo.setAttribute('skinIndex', new T3.BufferAttribute(new Uint16Array(SI), 4));
      geo.setAttribute('skinWeight', new T3.Float32BufferAttribute(SW, 4));
      geo.setAttribute('aCut', new T3.Float32BufferAttribute(C, 4));
      geo.setIndex(IDX);
      const mesh = new T3.SkinnedMesh(geo, this.capMat);
      this.mirrorSkinned(mesh, list[0].m.mesh, skel);
      R.scene.add(mesh);
      out.push({ mesh, side, anchor: anchorName });
    }
    return out;
  }

  disposeCap(c) {
    c.mesh.geometry.dispose();
  }

  // ---- teardown --------------------------------------------------------------------------------------------
  release(p) {
    const st = this.people.get(p);
    if (!st) return;
    this.people.delete(p);
    this.crawlers.forEach((ai) => { if (ai.p === p) this.crawlers.delete(ai); });
    this.oneArmed = this.oneArmed.filter((o) => o.p !== p);
    this.steady = this.steady.filter((s) => s.p !== p);
    this.fates = this.fates.filter((f) => f.ai.p !== p);
    for (const s of this.spurts) if (s.on && st.cuts.some((c) => c.parentBody === s.body || (c.seg && c.seg.body === s.body))) { s.on = false; s.body = null; }
    const R = st.render;
    if (!R) return;
    const di = this.drawn.indexOf(R);
    if (di >= 0) this.drawn.splice(di, 1);
    for (const c of R.caps) { c.mesh.removeFromParent(); this.disposeCap(c); }
    for (const pc of R.pieces) {
      for (const pm of pc.meshes) { pm.removeFromParent(); this.disposeShared(pm.geometry); }
      for (const sk of pc.skels.values()) sk.dispose();
    }
    for (const m of R.meshes) {
      if (m.geo) { m.mesh.geometry = m.geo0; this.disposeShared(m.geo); m.geo = null; }
      if (m.skel) { m.mesh.bind(m.skel0, m.mesh.bindMatrix); m.skel = null; }
    }
    for (const sk of R.mainSkels.values()) sk.dispose();
    R.caps.length = 0; R.pieces.length = 0; R.proxies.length = 0;
  }
}
