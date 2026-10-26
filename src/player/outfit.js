// Wearing clothes: slots, style score, comfy/stylish buffs, wardrobe actions.
import * as THREE from 'three';
import { G } from '../game.js';
import { registerBehaviors } from '../items/behaviors/index.js';
import { queueSave } from '../core/state.js';

export const SLOTS = ['hat', 'glasses', 'top', 'bottom', 'shoes', 'accessory'];
export const SLOT_LABEL = { hat: 'Hat', glasses: 'Eyewear', top: 'Top', bottom: 'Bottom', shoes: 'Shoes', accessory: 'Accessory' };
const VIBES = {
  cozy: 'Cozy Homebody', street: 'Streetwear Icon', formal: 'Dressed to Impress', sporty: 'Athleisure Ace', basic: 'Clean Basics',
  luxe: 'Quiet Luxury', y2k: 'Y2K Baby', cottage: 'Cottagecore Dreamer', dark: 'Dark Academia', retro: 'Retro Revival', preppy: 'Preppy Polished', boho: 'Boho Wanderer', techwear: 'Techwear Ninja', party: 'Party Ready',
};

export class Outfit {
  worn(slot) { const uid = G.state.outfit[slot]; return uid ? G.items.get(uid) : null; }

  wear(inst) {
    const slot = inst.def.use?.slot;
    if (!slot) return;
    const prev = this.worn(slot);
    if (prev && prev !== inst) G.items.setLoc(prev, 'wardrobe');
    if (G.hand.held === inst) G.hand.release(true);
    G.items.setLoc(inst, 'worn');
    G.state.outfit[slot] = inst.uid;
    G.audio.play('rustle');
    G.ui.toast(`Wearing ${inst.def.name}`, { icon: '👕' });
    this.after();
    G.events.emit('act', 'wear', { item: inst.def.id, slot });
  }

  takeOff(slot) {
    const prev = this.worn(slot);
    if (!prev) return;
    G.items.setLoc(prev, 'wardrobe');
    G.state.outfit[slot] = null;
    G.audio.play('rustle');
    this.after();
  }

  after() {
    // drop stale references
    for (const s of SLOTS) { const u = G.state.outfit[s]; if (u && G.items.get(u)?.data.loc !== 'worn') G.state.outfit[s] = null; }
    const r = this.styleReport();
    if (r.score >= 70) G.needs.addBuff('stylish', 240);
    if (r.comfy >= 2) G.needs.addBuff('comfy', 240);
    G.events.emit('outfitChanged');
    queueSave();
  }

  styleReport() {
    const items = SLOTS.map((s) => this.worn(s)).filter(Boolean);
    const lines = [];
    let score = 15;
    const vibeCount = {};
    let comfy = 0;
    for (const it of items) {
      const u = it.def.use;
      score += (u.points || 5) * 1.6;
      for (const v of u.vibe || []) vibeCount[v] = (vibeCount[v] || 0) + 1;
      if (u.comfy) comfy++;
      lines.push(`${it.def.name}`);
    }
    const hasCore = ['top', 'bottom', 'shoes'].every((s) => this.worn(s));
    if (hasCore) { score += 10; } else lines.push('<i>Missing pieces: ' + ['top', 'bottom', 'shoes'].filter((s) => !this.worn(s)).join(', ') + '</i>');
    const top = Object.entries(vibeCount).sort((a, b) => b[1] - a[1])[0];
    if (top && top[1] >= 3) score += 18; else if (top && top[1] >= 2) score += 9;
    // color harmony: reward a restrained palette
    const cols = items.map((i) => new THREE.Color(i.def.use.color || '#888'));
    if (cols.length >= 2) {
      const hsl = cols.map((c) => { const o = {}; c.getHSL(o); return o; });
      const sat = hsl.filter((h) => h.s > 0.35);
      const spread = sat.length > 1 ? Math.max(...sat.map((h) => h.h)) - Math.min(...sat.map((h) => h.h)) : 0;
      if (sat.length <= 2 || spread < 0.15) { score += 8; lines.push('🎨 Cohesive colors'); }
      else if (sat.length >= 4) { score -= 4; lines.push('🌈 Bold color clash'); }
    }
    if (G.needs.hasBuff('scented')) { score += 4; lines.push('🌸 Smelling amazing'); }
    if (G.needs.hasBuff('goodHair')) { score += 4; lines.push('💇 Good hair day'); }
    score = Math.max(0, Math.min(100, Math.round(score)));
    const vibe = top ? VIBES[top[0]] || 'Unique Style' : items.length ? 'Unique Style' : 'Barely Dressed';
    return { score, vibe, lines, comfy };
  }

  showStyleCard() { G.ui.showStyleCard(); G.avatar.pose = Math.random() < 0.5 ? 'wave' : 'peace'; setTimeout(() => (G.avatar.pose = 'idle'), 2500); }
}

registerBehaviors({
  wear: {
    held(inst) {
      return [{ key: 'LMB', label: 'Put it on', run: () => G.outfit.wear(inst) }];
    },
    world(inst) { return [{ key: 'F', label: 'Wear it', run: () => G.outfit.wear(inst) }]; },
    subtitle(inst) { const u = inst.def.use; return `${u.slot}${u.vibe?.length ? ' · ' + u.vibe.join(', ') : ''}`; },
  },
});
