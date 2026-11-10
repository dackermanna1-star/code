// Small per-prop state machines that react to damage (screens dying, sparks…).
import * as THREE from 'three';

const _p = new THREE.Vector3();

/**
 * A powered display. Screen fragments keep showing their piece of the picture
 * while they are still attached to the panel driver; damaged areas glitch or go
 * black; pieces that fall out, or a display whose power path is severed, go dark.
 *
 * o: { tag, mats (from makeScreenMaterials), driver: partName, power: [partNames], lightTag }
 */
export function screenBehavior(o) {
  return (prop, sim) => {
    const mats = o.mats;
    const st = { powered: true, damage: 0, flicker: 0, dying: false, t: 0 };
    const driver = () => prop.byName.get(o.driver);
    const setMat = (chunk, m) => {
      if (chunk.mats[0] === m) return;
      chunk.mats = [m, chunk.mats[1], chunk.mats[2]];
      if (chunk.mesh) chunk.mesh.material = chunk.mats;
    };
    const setLevel = (k) => {
      mats.live.emissiveIntensity = mats.brightness * k;
      mats.glitch.emissiveIntensity = mats.brightness * 1.1 * k;
      mats.backlight.emissiveIntensity = mats.brightness * 0.75 * k;
    };
    const refresh = () => {
      const d = driver();
      const home = d && !d.dead ? d.asm : null;
      for (const c of prop.chunks) {
        if (!c.tags || !c.tags.has(o.tag)) continue;
        if (c.asm !== home && c.mats[0] !== mats.dead) setMat(c, mats.dead);
      }
      if (st.powered && !st.dying) {
        let ok = !!home;
        for (const name of o.power || []) {
          const c = prop.byName.get(name);
          if (!c || c.dead || c.asm !== home) ok = false;
        }
        if (!ok) kill();
      }
    };
    const kill = () => {
      if (!st.powered || st.dying) return;
      st.dying = true;
      st.flicker = 0.5;
      const d = driver();
      if (d && d.asm && sim.fx) sim.fx.sparks(sim.chunkCenterWorld(d, _p), null, 26, 1.2);
      if (d && d.asm && sim.audio) sim.audio.spark(sim.chunkCenterWorld(d, _p), 0.9);
    };
    return {
      state: st,
      onFracture(old, frags, tags, P) {
        if (!tags || !tags.has(o.tag)) return;
        st.damage++;
        const pGlitch = Math.min(0.12 + 0.07 * st.damage, 0.4);
        const pDead = Math.min(0.08 + 0.06 * st.damage, 0.35);
        for (const f of frags) {
          if (old.mats[0] !== mats.live) continue;
          const r = sim.rng();
          if (r < pGlitch) setMat(f, mats.glitch);
          else if (r < pGlitch + pDead) setMat(f, mats.dead);
        }
        if (st.powered && !st.dying) {
          st.flicker = Math.max(st.flicker, 0.22);
          if (sim.fx) sim.fx.sparks(P, null, 10, 0.8);
          if (sim.audio) sim.audio.spark(P, 0.5);
          if (st.damage >= (o.maxDamage ?? 4)) kill();
        }
      },
      onSplit() {
        refresh();
      },
      update(dt) {
        if (st.flicker > 0) {
          st.flicker -= dt;
          st.t += dt;
          if (st.flicker <= 0) {
            if (st.dying) {
              st.powered = false;
              st.dying = false;
              setLevel(0);
            } else setLevel(1);
          } else {
            setLevel(Math.sin(st.t * 91) * Math.sin(st.t * 37) > -0.2 ? (st.dying ? 0.7 : 1) : 0.12);
          }
        }
      },
    };
  };
}

/** Electronics that throw sparks when their boards are smashed or torn out. */
export function sparkBehavior(tag = 'elec') {
  return (prop, sim) => ({
    onFracture(old, frags, tags, P) {
      if (!tags || !tags.has(tag)) return;
      if (sim.fx) sim.fx.sparks(P, null, 14, 1);
      if (sim.audio) sim.audio.spark(P, 0.7);
    },
  });
}
