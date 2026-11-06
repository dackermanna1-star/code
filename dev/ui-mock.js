// Rich mock of the `game` object (docs/UI_API.md) for developing / screenshotting the UI in isolation.
import { ITEMS, getItemDef, createItem } from '../src/items/items.js';
import { PlayerInventory, EQUIP_SLOTS, moveStack } from '../src/inventory/Inventory.js';
import { PROFESSIONS, SKILLS, xpForLevel } from '../src/player/professions.js';

// ------------------------------------------------------------------ mock item defs (only added if missing)
const MOCK_ITEMS = {
  baseball_bat: { name: 'Baseball Bat', category: 'weapon', weight: 1.1, stack: 1, rarity: 'common', durability: 120, icon: { color: '#b08850' }, desc: 'Louisville’s finest. Good reach, decent knockback.', melee: { damage: 22, speed: 1.4, range: 2.6, knockback: 1.2, type: 'blunt', twoHanded: false } },
  kitchen_knife: { name: 'Kitchen Knife', category: 'weapon', weight: 0.3, stack: 1, rarity: 'common', durability: 60, icon: { color: '#c0c4c8' }, tags: ['blade'], melee: { damage: 14, speed: 2.4, range: 1.8, type: 'stab' } },
  fire_axe: { name: 'Fire Axe', category: 'weapon', weight: 2.6, stack: 1, rarity: 'rare', durability: 220, icon: { color: '#c83a2a' }, tags: ['chop'], melee: { damage: 44, speed: 0.8, range: 2.7, type: 'heavy', twoHanded: true } },
  police_baton: { name: 'Police Baton', category: 'weapon', weight: 0.6, stack: 1, rarity: 'uncommon', durability: 150, icon: { color: '#2a2a30' }, melee: { damage: 16, speed: 1.9, range: 2.2, type: 'blunt' } },
  hammer: { name: 'Claw Hammer', category: 'tool', weight: 0.7, stack: 1, rarity: 'common', durability: 140, icon: { color: '#8a6a4a' }, tags: ['hammer', 'pry'], melee: { damage: 15, speed: 1.8, range: 2.0, type: 'blunt' } },
  pistol_m9: { name: 'M9 Pistol', category: 'firearm', weight: 1.0, stack: 1, rarity: 'uncommon', durability: 300, icon: { color: '#3a3c40' }, desc: 'Standard-issue 9mm sidearm.', firearm: { ammo: ['ammo_9mm'], magSize: 15, damage: 30, fireRate: 4, modes: ['semi'], reload: 'mag', noise: 40 } },
  shotgun_pump: { name: 'Pump Shotgun', category: 'firearm', weight: 3.4, stack: 1, rarity: 'rare', durability: 350, icon: { color: '#5a3a24' }, firearm: { ammo: ['ammo_12g', 'ammo_12g_slug'], magSize: 6, damage: 14, pellets: 9, modes: ['pump'], reload: 'shell', noise: 70 } },
  rifle_hunting: { name: 'Hunting Rifle', category: 'firearm', weight: 3.9, stack: 1, rarity: 'epic', durability: 400, icon: { color: '#6a4a2a' }, firearm: { ammo: ['ammo_308'], magSize: 5, damage: 90, modes: ['bolt'], reload: 'single', scope: 4, noise: 90 } },
  ammo_9mm: { name: '9mm Rounds', category: 'ammo', weight: 0.012, stack: 60, rarity: 'common', icon: { color: '#d8b050' } },
  ammo_12g: { name: '12 Gauge Shells', category: 'ammo', weight: 0.04, stack: 24, rarity: 'common', icon: { color: '#c03020' } },
  ammo_308: { name: '.308 Rounds', category: 'ammo', weight: 0.025, stack: 30, rarity: 'uncommon', icon: { color: '#c8a040' } },
  chips: { name: 'Potato Chips', category: 'food', weight: 0.15, stack: 5, rarity: 'common', icon: { color: '#e8c040' }, food: { hunger: 12, thirst: -6 } },
  chocolate: { name: 'Chocolate Bar', category: 'food', weight: 0.1, stack: 10, rarity: 'common', icon: { color: '#6a3a1a' }, food: { hunger: 10, panic: -10 } },
  apple: { name: 'Apple', category: 'food', weight: 0.2, stack: 6, rarity: 'common', icon: { color: '#c82a1a' }, food: { hunger: 9, thirst: 4, spoils: 120 } },
  cooked_meat: { name: 'Cooked Venison', category: 'food', weight: 0.4, stack: 4, rarity: 'uncommon', icon: { color: '#8a4a2a' }, food: { hunger: 40, spoils: 48 } },
  canned_peaches: { name: 'Canned Peaches', category: 'food', weight: 0.45, stack: 4, rarity: 'common', icon: { color: '#e89a40' }, food: { hunger: 20, thirst: 10, needsOpener: true } },
  soda: { name: 'Pop Soda', category: 'drink', weight: 0.35, stack: 6, rarity: 'common', icon: { color: '#3a8ad0' }, drink: { thirst: 18 } },
  energy_drink: { name: 'Energy Drink', category: 'drink', weight: 0.3, stack: 6, rarity: 'uncommon', icon: { color: '#60d040' }, drink: { thirst: 10, energy: 25 } },
  bandage: { name: 'Bandage', category: 'medical', weight: 0.05, stack: 10, rarity: 'common', icon: { color: '#efe8d8' }, medical: { stopBleed: true } },
  sterile_bandage: { name: 'Sterile Bandage', category: 'medical', weight: 0.05, stack: 10, rarity: 'uncommon', icon: { color: '#ffffff' }, medical: { stopBleed: true, sterile: true } },
  disinfectant: { name: 'Disinfectant', category: 'medical', weight: 0.3, stack: 1, uses: 10, rarity: 'uncommon', icon: { color: '#a0d0e0' }, medical: { disinfect: true } },
  painkillers: { name: 'Painkillers', category: 'medical', weight: 0.1, stack: 1, uses: 10, rarity: 'common', icon: { color: '#e0e0e0' }, medical: { painkiller: 40 } },
  antibiotics: { name: 'Antibiotics', category: 'medical', weight: 0.1, stack: 1, uses: 6, rarity: 'rare', icon: { color: '#e05050' }, medical: { antibiotic: true } },
  splint: { name: 'Splint', category: 'medical', weight: 0.4, stack: 2, rarity: 'common', icon: { color: '#b08850' }, medical: { splint: true } },
  suture_kit: { name: 'Suture Kit', category: 'medical', weight: 0.15, stack: 1, uses: 5, rarity: 'rare', icon: { color: '#8a8ab0' }, medical: { suture: true } },
  flashlight: { name: 'Flashlight', category: 'tool', weight: 0.4, stack: 1, uses: 100, rarity: 'common', icon: { color: '#3a3a3a' }, light: { range: 22, cone: 0.5, drain: 3 } },
  lighter: { name: 'Lighter', category: 'tool', weight: 0.05, stack: 1, uses: 100, rarity: 'common', icon: { color: '#e04030' }, tags: ['fire_starter'] },
  can_opener: { name: 'Can Opener', category: 'tool', weight: 0.15, stack: 1, rarity: 'common', icon: { color: '#909090' }, tags: ['can_opener'] },
  watch: { name: 'Digital Watch', category: 'tool', weight: 0.05, stack: 1, rarity: 'uncommon', icon: { color: '#202020' }, tags: ['watch'] },
  compass: { name: 'Compass', category: 'tool', weight: 0.1, stack: 1, rarity: 'uncommon', icon: { color: '#c0a060' }, tags: ['compass'] },
  map_millbrook: { name: 'Map of Millbrook', category: 'misc', weight: 0.05, stack: 1, rarity: 'rare', icon: { color: '#d8c890' }, tags: ['map'] },
  radio_handheld: { name: 'Handheld Radio', category: 'tool', weight: 0.5, stack: 1, uses: 100, rarity: 'rare', icon: { color: '#2a3a2a' }, tags: ['radio'] },
  nails: { name: 'Nails', category: 'material', weight: 0.005, stack: 100, rarity: 'common', icon: { color: '#a0a0a8' } },
  rag: { name: 'Rag', category: 'material', weight: 0.05, stack: 10, rarity: 'common', icon: { color: '#d8d0b8' } },
  scrap_metal: { name: 'Scrap Metal', category: 'material', weight: 0.5, stack: 10, rarity: 'common', icon: { color: '#6a6a70' } },
  duct_tape: { name: 'Duct Tape', category: 'material', weight: 0.2, stack: 1, uses: 5, rarity: 'uncommon', icon: { color: '#8a8a90' } },
  rope: { name: 'Rope', category: 'material', weight: 0.6, stack: 4, rarity: 'common', icon: { color: '#b89a60' } },
  stick: { name: 'Stick', category: 'material', weight: 0.3, stack: 10, rarity: 'common', icon: { color: '#7a5a3a' } },
  glass_bottle: { name: 'Empty Bottle', category: 'material', weight: 0.3, stack: 4, rarity: 'common', icon: { color: '#7ab89a' } },
  molotov: { name: 'Molotov Cocktail', category: 'throwable', weight: 0.8, stack: 3, rarity: 'uncommon', icon: { color: '#d07020' }, throwable: { kind: 'molotov', radius: 3 } },
  pipe_bomb: { name: 'Pipe Bomb', category: 'throwable', weight: 1.0, stack: 3, rarity: 'rare', icon: { color: '#606060' }, throwable: { kind: 'pipebomb', radius: 5 } },
  note: { name: 'Handwritten Note', category: 'misc', weight: 0.01, stack: 1, rarity: 'common', icon: { color: '#e8dcb8' } },
  book_firstaid: { name: 'Field Medicine Vol. 1', category: 'book', weight: 0.6, stack: 1, rarity: 'rare', icon: { color: '#a02020' }, book: { skill: 'firstAid', mult: 2, hours: 3 } },
  wallet: { name: 'Wallet', category: 'misc', weight: 0.1, stack: 1, rarity: 'common', icon: { color: '#4a2a1a' } },
  photo: { name: 'Family Photo', category: 'misc', weight: 0.01, stack: 1, rarity: 'common', icon: { color: '#c8b890' } },
  key_pharmacy: { name: 'Pharmacy Key', category: 'key', weight: 0.02, stack: 1, rarity: 'epic', icon: { color: '#e0c040' } },
  baseball_cap: { name: 'Baseball Cap', category: 'clothing', weight: 0.1, stack: 1, durability: 60, rarity: 'common', icon: { color: '#2a4a8a' }, clothing: { slot: 'head', insulation: 0.05, scratch: 0.05 } },
  bandana: { name: 'Bandana', category: 'clothing', weight: 0.05, stack: 1, durability: 40, rarity: 'common', icon: { color: '#a02020' }, tags: ['fabric'], clothing: { slot: 'face', insulation: 0.02 } },
  tshirt: { name: 'T-Shirt', category: 'clothing', weight: 0.15, stack: 1, durability: 50, rarity: 'common', icon: { color: '#c8c0b0' }, tags: ['fabric'], clothing: { slot: 'torso', insulation: 0.08, scratch: 0.05 } },
  hoodie: { name: 'Hoodie', category: 'clothing', weight: 0.6, stack: 1, durability: 90, capacity: 2, rarity: 'common', icon: { color: '#5a5a5a' }, clothing: { slot: 'jacket', insulation: 0.25, water: 0.1, scratch: 0.2, bite: 0.05 } },
  leather_jacket: { name: 'Leather Jacket', category: 'clothing', weight: 1.6, stack: 1, durability: 200, capacity: 4, rarity: 'rare', icon: { color: '#3a2418' }, clothing: { slot: 'jacket', insulation: 0.35, water: 0.4, scratch: 0.6, bite: 0.35 } },
  cargo_pants: { name: 'Cargo Pants', category: 'clothing', weight: 0.7, stack: 1, durability: 110, capacity: 6, rarity: 'uncommon', icon: { color: '#5a6a3a' }, clothing: { slot: 'legs', insulation: 0.15, scratch: 0.3, bite: 0.1 } },
  sneakers: { name: 'Sneakers', category: 'clothing', weight: 0.6, stack: 1, durability: 80, rarity: 'common', icon: { color: '#e0e0e0' }, clothing: { slot: 'feet', insulation: 0.05, speed: 1.03 } },
  work_boots: { name: 'Work Boots', category: 'clothing', weight: 1.4, stack: 1, durability: 160, rarity: 'uncommon', icon: { color: '#6a4a2a' }, clothing: { slot: 'feet', insulation: 0.1, bite: 0.3 } },
  work_gloves: { name: 'Work Gloves', category: 'clothing', weight: 0.15, stack: 1, durability: 70, rarity: 'common', icon: { color: '#c8a050' }, clothing: { slot: 'hands', insulation: 0.05, scratch: 0.3 } },
  tactical_vest: { name: 'Tactical Vest', category: 'clothing', weight: 1.8, stack: 1, durability: 200, capacity: 6, rarity: 'rare', icon: { color: '#3a4a2a' }, clothing: { slot: 'vest', insulation: 0.05, bite: 0.2, scratch: 0.3 } },
  backpack_hiking: { name: 'Hiking Backpack', category: 'backpack', weight: 1.2, stack: 1, durability: 150, capacity: 18, weightReduction: 0.3, rarity: 'uncommon', icon: { color: '#2a6a5a' }, clothing: { slot: 'back', insulation: 0.05 } },
};
for (const [id, d] of Object.entries(MOCK_ITEMS)) if (!ITEMS[id]) ITEMS[id] = { id, ...d };

const NOTES = {
  note_hospital: {
    title: 'Found taped to the ER doors',
    text: 'To whoever finds this,\n\nThey brought in the first ones on Tuesday. Bites, they said. Some drunk from the county fair. By Wednesday night the waiting room was full and the doctors stopped calling them patients.\n\nDr. Hale locked the east wing. Do NOT open it. We could hear them in there for days.\n\nThe National Guard said they would set up at the high school. If you are reading this, go there. Do not go downtown after dark. Do not trust the quiet.\n\nI’m going to try for my sister’s place on Route 9.\n\n— Carol, RN',
  },
};

// ------------------------------------------------------------------ helpers
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const it = (id, opts) => createItem(id, opts);
const stackOf = (id, n, opts = {}) => { const s = createItem(id, opts); s.count = n; return s; };

function skill(level, f = 0.4) {
  const next = xpForLevel(level);
  return { level, xp: Math.round(next * f), next };
}

// ------------------------------------------------------------------ map
function drawMap() {
  const c = document.createElement('canvas');
  c.width = c.height = 1024;
  const g = c.getContext('2d');
  const r = rng(77);
  g.fillStyle = '#5a6a38';
  g.fillRect(0, 0, 1024, 1024);
  // terrain noise
  for (let i = 0; i < 9000; i++) {
    const x = r() * 1024, y = r() * 1024;
    g.fillStyle = r() < 0.5 ? 'rgba(70,90,40,0.5)' : 'rgba(110,120,60,0.35)';
    g.fillRect(x | 0, y | 0, 3 + (r() * 6) | 0, 3 + (r() * 6) | 0);
  }
  // forests
  for (let i = 0; i < 160; i++) {
    const cx = r() * 1024, cy = r() * 1024;
    if (Math.hypot(cx - 520, cy - 500) < 260) continue;
    const rad = 20 + r() * 70;
    for (let k = 0; k < rad * 3; k++) {
      const a = r() * 6.28, d = r() * rad;
      g.fillStyle = r() < 0.5 ? '#2e4a22' : '#36552a';
      g.fillRect((cx + Math.cos(a) * d) | 0, (cy + Math.sin(a) * d) | 0, 6, 6);
    }
  }
  // farm fields (east)
  for (let i = 0; i < 10; i++) {
    const x = 760 + (i % 3) * 80, y = 180 + Math.floor(i / 3) * 90;
    g.fillStyle = ['#b8a458', '#9a8a44', '#7a6a34', '#c8b468'][i % 4];
    g.fillRect(x, y, 70, 80);
    g.fillStyle = 'rgba(0,0,0,0.08)';
    for (let s = 0; s < 80; s += 4) g.fillRect(x, y + s, 70, 1);
  }
  // river
  g.strokeStyle = '#3a6a9a';
  g.lineWidth = 14;
  g.beginPath();
  g.moveTo(0, 760);
  g.bezierCurveTo(250, 700, 330, 860, 560, 800);
  g.bezierCurveTo(760, 750, 860, 900, 1024, 860);
  g.stroke();
  g.fillStyle = '#3a6a9a';
  g.beginPath(); g.ellipse(170, 230, 60, 40, 0.3, 0, 6.28); g.fill();
  // highway
  g.strokeStyle = '#2a2a2a'; g.lineWidth = 12;
  g.beginPath(); g.moveTo(0, 380); g.lineTo(1024, 300); g.stroke();
  g.strokeStyle = '#d8c040'; g.lineWidth = 1; g.setLineDash([6, 6]);
  g.beginPath(); g.moveTo(0, 380); g.lineTo(1024, 300); g.stroke();
  g.setLineDash([]);
  // town grid
  const x0 = 360, y0 = 400, x1 = 700, y1 = 680;
  g.fillStyle = '#6a6a52';
  g.fillRect(x0 - 10, y0 - 10, x1 - x0 + 20, y1 - y0 + 20);
  for (let x = x0; x <= x1; x += 48) { g.fillStyle = '#353535'; g.fillRect(x, y0 - 10, 6, y1 - y0 + 20); }
  for (let y = y0; y <= y1; y += 40) { g.fillStyle = '#353535'; g.fillRect(x0 - 10, y, x1 - x0 + 20, 6); }
  // main street
  g.fillStyle = '#2a2a2a';
  g.fillRect(x0 - 160, 536, x1 - x0 + 320, 9);
  g.fillRect(520, 300, 9, 520);
  // buildings
  for (let bx = x0; bx < x1; bx += 48) {
    for (let by = y0; by < y1; by += 40) {
      const downtown = Math.hypot(bx - 520, by - 540) < 90;
      for (let k = 0; k < (downtown ? 1 : 3); k++) {
        const w = downtown ? 36 : 10 + r() * 6, hh = downtown ? 28 : 10 + r() * 6;
        const px = bx + 9 + (downtown ? 0 : (k % 2) * 18 + r() * 4), py = by + 9 + (downtown ? 0 : Math.floor(k / 2) * 14);
        g.fillStyle = '#111';
        g.fillRect(px - 1, py - 1, w + 2, hh + 2);
        g.fillStyle = downtown ? ['#8a7060', '#7a6a5a', '#9a8a70', '#6a6470'][Math.floor(r() * 4)] : ['#a0624a', '#8a8070', '#706a64', '#9a8a5a', '#5a6a7a'][Math.floor(r() * 5)];
        g.fillRect(px, py, w, hh);
      }
    }
  }
  // hospital / school big buildings
  g.fillStyle = '#111'; g.fillRect(729, 449, 62, 52);
  g.fillStyle = '#d0ccc0'; g.fillRect(730, 450, 60, 50);
  g.fillStyle = '#c83020'; g.fillRect(756, 466, 8, 18); g.fillRect(751, 471, 18, 8);
  g.fillStyle = '#111'; g.fillRect(279, 579, 52, 42);
  g.fillStyle = '#9a6a4a'; g.fillRect(280, 580, 50, 40);
  // trailer park
  for (let i = 0; i < 14; i++) { g.fillStyle = '#c8c8b8'; g.fillRect(200 + (i % 7) * 14, 470 + Math.floor(i / 7) * 16, 10, 5); }
  // military checkpoint
  g.fillStyle = '#4a5a3a'; g.fillRect(880, 640, 70, 50);
  g.fillStyle = '#2a3a2a'; for (let i = 0; i < 4; i++) g.fillRect(888 + i * 15, 650, 10, 14);
  return c;
}

// ------------------------------------------------------------------ build mock
export function createMockGame(opts = {}) {
  const inv = new PlayerInventory();
  inv.maxWeight = 22;
  const eq = (slot, stack) => { inv.equipment[EQUIP_SLOTS.indexOf(slot)] = stack; return stack; };
  eq('head', it('baseball_cap', { dur: 0.7 }));
  eq('torso', it('tshirt', { dur: 0.55 }));
  const hoodie = eq('jacket', it('hoodie', { dur: 0.8 }));
  const vest = eq('vest', it('tactical_vest', { dur: 0.9 }));
  eq('hands', it('work_gloves', { dur: 0.4 }));
  const pants = eq('legs', it('cargo_pants', { dur: 0.85 }));
  eq('feet', it('sneakers', { dur: 0.6 }));
  const pack = eq('back', it('backpack_hiking', { dur: 0.95 }));

  inv.hotbar[0] = it('baseball_bat', { dur: 0.62 });
  inv.hotbar[1] = it('pistol_m9', { ammo: 12 });
  inv.hotbar[2] = it('kitchen_knife', { dur: 0.25 });
  inv.hotbar[3] = it('flashlight', { uses: 64 });
  inv.hotbar[4] = it('water_bottle', { uses: 3 });
  inv.hotbar[6] = stackOf('molotov', 2);
  inv.hotbar[8] = stackOf('bandage', 4);
  inv.selected = 1;

  hoodie.contents[0] = it('lighter', { uses: 40 });
  hoodie.contents[1] = stackOf('chocolate', 2);
  vest.contents[0] = stackOf('ammo_9mm', 30);
  vest.contents[1] = stackOf('ammo_12g', 8);
  vest.contents[2] = it('painkillers', { uses: 6 });
  vest.contents[4] = it('watch');
  pants.contents[0] = stackOf('nails', 36);
  pants.contents[1] = it('can_opener');
  pants.contents[3] = it('note', { data: { noteId: 'note_hospital' } });
  pack.contents[0] = stackOf('canned_beans', 3);
  pack.contents[1] = stackOf('canned_peaches', 2);
  pack.contents[2] = stackOf('soda', 2);
  pack.contents[3] = stackOf('rag', 5);
  pack.contents[4] = stackOf('plank', 4);
  pack.contents[5] = it('duct_tape');
  pack.contents[6] = it('disinfectant', { uses: 7 });
  pack.contents[7] = it('book_firstaid');
  pack.contents[8] = it('hammer', { dur: 0.9 });
  pack.contents[9] = it('antibiotics');
  pack.contents[10] = stackOf('scrap_metal', 3);
  pack.contents[12] = it('radio_handheld', { uses: 80 });

  const ground = {
    key: 'floor', name: 'Ground', kind: 'floor', slots: new Array(12).fill(null),
  };
  ground.slots[0] = stackOf('glass_bottle', 2);
  ground.slots[1] = stackOf('stick', 3);
  const cabinet = {
    key: 'world:412,21,233', name: 'Kitchen Cabinet', kind: 'world', slots: new Array(12).fill(null),
  };
  cabinet.slots[0] = stackOf('canned_beans', 2);
  cabinet.slots[1] = stackOf('chips', 3);
  cabinet.slots[2] = it('kitchen_knife', { dur: 0.9 });
  cabinet.slots[4] = stackOf('rag', 2);
  cabinet.slots[5] = stackOf('apple', 3);
  cabinet.slots[7] = it('map_millbrook');
  const corpse = {
    key: 'corpse:17', name: 'Dead Police Officer', kind: 'corpse', slots: new Array(10).fill(null),
  };
  corpse.slots[0] = it('police_baton', { dur: 0.7 });
  corpse.slots[1] = stackOf('ammo_9mm', 22);
  corpse.slots[2] = it('leather_jacket', { dur: 0.45 });
  corpse.slots[3] = stackOf('sterile_bandage', 2);
  corpse.slots[4] = it('key_pharmacy');
  corpse.slots[5] = it('wallet');
  corpse.slots[6] = it('work_boots', { dur: 0.8 });
  const trunk = {
    key: 'vehicle:3', name: 'Sedan — Trunk', kind: 'vehicle', slots: new Array(16).fill(null),
  };
  trunk.slots[0] = it('shotgun_pump', { ammo: 2, dur: 0.55 });
  trunk.slots[1] = stackOf('rope', 2);
  trunk.slots[2] = it('rifle_hunting', { ammo: 3 });
  const lootSources = [cabinet, corpse, trunk, ground];

  const mapCanvas = drawMap();
  const explored = new Uint8Array(128 * 128);
  for (let z = 0; z < 128; z++) {
    for (let x = 0; x < 128; x++) {
      const d = Math.hypot(x - 64, z - 66);
      const trail = Math.abs(z - (66 - (x - 64) * 0.35)) < 4 && x > 64 && x < 118;
      if (d < 26 + Math.sin(x * 0.7) * 2 || trail || Math.hypot(x - 22, z - 29) < 6) explored[z * 128 + x] = 1;
    }
  }

  const calls = [];
  const log = (name, ...args) => { calls.push([name, ...args]); if (window.__uiLog) window.__uiLog.push(name); };

  const player = {
    name: 'Mara Collins', profession: 'nurse', professionName: 'Nurse',
    health: 64, maxHealth: 100, hunger: 34, thirst: 58, stamina: 42, maxStamina: 100, energy: 38,
    bodyTemp: 35.8, wetness: 46, sickness: 12, pain: 55, panic: 72, infection: 18, infectionKnown: false,
    weight: 0, maxWeight: 22,
    wounds: [
      { part: 'armL', type: 'laceration', bleeding: true, bandaged: false, bandageDirty: false, disinfected: false, infected: false, splinted: false, heal: 0.08, severity: 0.62 },
      { part: 'torso', type: 'scratch', bleeding: false, bandaged: true, bandageDirty: true, disinfected: true, infected: false, splinted: false, heal: 0.55, severity: 0.25 },
      { part: 'legL', type: 'fracture', bleeding: false, bandaged: false, bandageDirty: false, disinfected: false, infected: false, splinted: true, heal: 0.2, severity: 0.8 },
      { part: 'armR', type: 'burn', bleeding: false, bandaged: false, bandageDirty: false, disinfected: false, infected: true, splinted: false, heal: 0.35, severity: 0.45 },
    ],
    moodles: [
      { id: 'bleeding', label: 'Bleeding', level: 2, bad: true, desc: 'You are losing blood.' },
      { id: 'panic', label: 'Panicked', level: 4, bad: true, desc: 'Your hands are shaking.' },
      { id: 'pain', label: 'Pain', level: 3, bad: true },
      { id: 'hungry', label: 'Hungry', level: 1, bad: true },
      { id: 'cold', label: 'Chilly', level: 1, bad: true },
      { id: 'wet', label: 'Wet', level: 2, bad: true },
      { id: 'tired', label: 'Tired', level: 2, bad: true },
      { id: 'hydrated', label: 'Hydrated', level: 1, bad: false },
    ],
    skills: {
      aiming: skill(2, 0.3), melee: skill(3, 0.65), strength: skill(2, 0.1), fitness: skill(1, 0.8),
      sneaking: skill(1, 0.2), firstAid: skill(5, 0.45), maintenance: skill(0, 0.5), scavenging: skill(2, 0.9),
    },
    kills: 37, daysSurvived: 2.7,
    x: 532, y: 21, z: 541, yaw: -1.2, pitch: 0,
    flashlightOn: false, hasWatch: opts.watch ?? true, hasCompass: opts.compass ?? true, scopeActive: !!opts.scope, aiming: false,
    inv,
    armor: { bite: 0.18, scratch: 0.42 }, insulation: 0.34,
  };
  Object.defineProperty(player, 'weight', { get: () => inv.totalWeight(), enumerable: true, configurable: true });

  const hud = {
    interaction: { key: 'E', text: 'Search Kitchen Cabinet', sub: 'Hold to search quietly' },
    progress: { label: 'Searching…', t: 0.45 },
    ammo: { loaded: 12, reserve: 30, mode: 'semi', name: 'M9 Pistol', jammed: false },
    heldName: 'M9 Pistol',
    durability: 0.82,
  };

  const RECIPES = [
    { id: 'rag', name: 'Rip Clothing into Rags', category: 'survival', desc: 'Tear fabric into rags. Useful as makeshift bandages, if dirty.', time: 4, result: { id: 'rag', count: 3 }, in: [['tshirt', 1]], tools: [['kitchen_knife', 'Blade']] },
    { id: 'bandage', name: 'Sterilise Bandages', category: 'medical', desc: 'Boil rags into clean bandages.', time: 8, result: { id: 'sterile_bandage', count: 2 }, in: [['rag', 2], ['water_bottle', 1]], tools: [], station: 'Campfire' },
    { id: 'splint', name: 'Makeshift Splint', category: 'medical', desc: 'Sticks and rags. Keeps a broken bone in place.', time: 6, result: { id: 'splint', count: 1 }, in: [['stick', 2], ['rag', 1]], tools: [] },
    { id: 'molotov', name: 'Molotov Cocktail', category: 'explosives', desc: 'A bottle, a rag, some fuel. Burns hot.', time: 5, result: { id: 'molotov', count: 1 }, in: [['glass_bottle', 1], ['rag', 1], ['gas_can', 1]], tools: [] },
    { id: 'pipe_bomb', name: 'Pipe Bomb', category: 'explosives', desc: 'Loud enough to draw every zombie in the county.', time: 15, result: { id: 'pipe_bomb', count: 1 }, in: [['metal_pipe', 1], ['gunpowder', 2], ['duct_tape', 1]], tools: [['hammer', 'Hammer']], station: 'Workbench' },
    { id: 'nail_bat', name: 'Nailed Baseball Bat', category: 'weapons', desc: 'Hammer nails through a bat. Nasty.', time: 10, result: { id: 'baseball_bat', count: 1 }, in: [['baseball_bat', 1], ['nails', 12]], tools: [['hammer', 'Hammer']] },
    { id: 'spear', name: 'Crafted Spear', category: 'weapons', desc: 'Lash a knife to a long stick.', time: 8, result: { id: 'kitchen_knife', count: 1 }, in: [['stick', 1], ['kitchen_knife', 1], ['duct_tape', 1]], tools: [] },
    { id: 'barricade', name: 'Window Barricade', category: 'building', desc: 'Planks nailed across a window or door.', time: 12, result: { id: 'plank', count: 1 }, in: [['plank', 3], ['nails', 6]], tools: [['hammer', 'Hammer']] },
    { id: 'workbench', name: 'Workbench', category: 'building', desc: 'A sturdy table for advanced crafting.', time: 30, result: { id: 'plank', count: 1 }, in: [['plank', 8], ['nails', 20], ['scrap_metal', 2]], tools: [['hammer', 'Hammer'], ['saw', 'Saw']] },
    { id: 'campfire', name: 'Campfire', category: 'survival', desc: 'Warmth, light and a place to cook. Smoke can be seen.', time: 10, result: { id: 'stick', count: 1 }, in: [['stick', 4], ['plank', 1]], tools: [['lighter', 'Fire starter']] },
    { id: 'cook_meat', name: 'Cook Raw Meat', category: 'cooking', desc: 'Cook it through. Raw meat makes you sick.', time: 20, result: { id: 'cooked_meat', count: 1 }, in: [['raw_meat', 1]], tools: [], station: 'Campfire' },
    { id: 'boil_water', name: 'Boil Water', category: 'cooking', desc: 'Purify dirty water over a fire.', time: 15, result: { id: 'water_bottle', count: 1 }, in: [['water_bottle', 1]], tools: [['pot', 'Cooking pot']], station: 'Campfire' },
    { id: 'repair_bat', name: 'Repair Weapon (tape)', category: 'repair', desc: 'Wrap a damaged melee weapon in duct tape.', time: 6, result: { id: 'baseball_bat', count: 1 }, in: [['duct_tape', 1]], tools: [] },
    { id: 'noise_maker', name: 'Noise Maker', category: 'electronics', desc: 'An alarm clock rigged to ring. Lures them away.', time: 12, result: { id: 'radio_handheld', count: 1 }, in: [['alarm_clock', 1], ['batteries', 1], ['duct_tape', 1]], tools: [['screwdriver', 'Screwdriver']] },
    { id: 'ammo_9', name: 'Reload 9mm Rounds', category: 'ammo', desc: 'Hand-load spent casings with gunpowder.', time: 20, result: { id: 'ammo_9mm', count: 10 }, in: [['gunpowder', 1], ['scrap_metal', 1]], tools: [], station: 'Workbench' },
  ];
  const haveItem = (id) => inv.count(id);
  const nearFire = false;

  const game = {
    state: opts.state || 'playing',
    settings: { sensitivity: 1, fov: 78, renderDistance: 8, quality: 'medium', masterVolume: 0.8, sfxVolume: 1, musicVolume: 0.55, invertY: false, showFps: true, headBob: true },
    applySettings() { log('applySettings', { ...this.settings }); },
    PROFESSIONS, SKILLS,
    newGame(o) { log('newGame', o); window.__lastNewGame = o; },
    async hasSave() { return opts.save !== false; },
    async getSaveInfo() { return opts.save === false ? null : { name: 'Earl Whitaker', day: 4, profession: 'carpenter', savedAt: Date.now() - 2.4 * 3600e3 }; },
    continueGame() { log('continueGame'); },
    saveGame() { log('saveGame'); },
    quitToMenu() { log('quitToMenu'); game.state = 'menu'; game.ui?.showMainMenu(); },
    resume() { log('resume'); game.state = 'playing'; game.ui?.hidePause(); },
    audio: { play(name, o) { if (window.__sounds) window.__sounds.push(name); return { stop() {} }; } },
    player,
    hud,
    time: { day: 3, hour: 16, minute: 42, totalHours: 64.7, isNight: false, phase: 'day' },
    weather: { type: 'overcast', label: 'Overcast', temperature: 11, wind: 0.4 },
    location: { name: 'Downtown Millbrook', zone: 'DOWNTOWN' },
    fps: 58,
    world: { SX: 1024, SZ: 1024 },
    mapExplored: explored,
    mapRevealed: !!opts.revealed,
    markers: [{ x: 905, z: 470, label: 'Airdrop', type: 'airdrop' }, { x: 300, z: 720, label: 'Smoke', type: 'smoke' }],
    getMapCanvas() { return mapCanvas; },
    getPOIs() {
      return [
        { name: 'Millbrook', type: 'town', x: 530, z: 470, discovered: true },
        { name: 'Millbrook General Hospital', type: 'hospital', x: 760, z: 475, discovered: true },
        { name: 'Millbrook PD', type: 'police', x: 470, z: 520, discovered: true },
        { name: 'Fire Station 2', type: 'fire_station', x: 600, z: 600, discovered: true },
        { name: 'Gas-N-Go', type: 'gas', x: 640, z: 325, discovered: true },
        { name: 'Millbrook High School', type: 'school', x: 305, z: 600, discovered: true },
        { name: 'Hollis Hardware', type: 'store', x: 420, z: 455, discovered: true },
        { name: 'Rite Pharmacy', type: 'pharmacy', x: 560, z: 650, discovered: true },
        { name: 'Pine Ridge Trailer Park', type: 'trailer', x: 245, z: 480, discovered: false },
        { name: 'Baker Farm', type: 'farm', x: 860, z: 270, discovered: true },
        { name: 'Military Checkpoint', type: 'military', x: 915, z: 665, discovered: false },
        { name: 'Ranger Station', type: 'ranger', x: 170, z: 180, discovered: true },
        { name: 'Route 9 Motel', type: 'motel', x: 150, z: 390, discovered: false },
      ];
    },
    getLootSources() { return lootSources; },
    getItemActions(desc, i) {
      const st = desc.slots[i];
      if (!st) return [];
      const def = getItemDef(st.id);
      const out = [];
      if (def.food) out.push({ label: 'Eat', run: () => { log('eat', st.id); consume(desc, i); } });
      if (def.drink) out.push({ label: 'Drink', run: () => log('drink', st.id) });
      if (def.medical) out.push({ label: 'Apply', run: () => log('apply', st.id) });
      if (def.clothing) out.push(desc.kind === 'equipment' ? { label: 'Unequip', run: () => log('unequip') } : { label: 'Wear', run: () => game.useItem(desc, i) });
      if (def.firearm) {
        out.push({ label: 'Unload', run: () => log('unload'), disabled: !st.ammo });
        out.push({ label: 'Toggle fire mode', run: () => log('mode'), disabled: (def.firearm.modes || []).length < 2 });
      }
      if (st.id === 'note') out.push({ label: 'Read', run: () => game.ui?.showNote(NOTES.note_hospital) });
      if (def.book) out.push({ label: 'Read', hint: '3 h', run: () => log('read') });
      if ((st.count || 1) > 1) out.push({ label: 'Split stack', run: () => log('split') });
      out.push({ separator: true });
      if (desc.kind !== 'floor') out.push({ label: 'Drop', run: () => game.dropItem(desc, i, 1) });
      if ((st.count || 1) > 1 && desc.kind !== 'floor') out.push({ label: `Drop all (${st.count})`, run: () => game.dropItem(desc, i) });
      if (def.tags?.includes('fabric')) out.push({ label: 'Rip into rags', run: () => log('rip'), danger: true });
      return out;
    },
    onItemMoved(src, si, dst, di) {
      log('onItemMoved', src.key, si, dst?.key, di);
      window.__moves = (window.__moves || 0) + 1;
      inv.changed();
    },
    dropItem(desc, i, count) {
      log('dropItem', desc.key, i, count);
      const j = ground.slots.indexOf(null);
      if (j < 0) { ground.slots.push(null); }
      moveStack(desc, i, ground, ground.slots.indexOf(null), count ?? Infinity);
      inv.changed();
    },
    useItem(desc, i) {
      const st = desc.slots[i];
      log('useItem', desc.key, i, st?.id);
      if (!st) return;
      if (st.id === 'note') { game.ui?.showNote(NOTES.note_hospital); return; }
      const def = getItemDef(st.id);
      if (def.food) consume(desc, i);
      inv.changed();
    },
    describeItem(stack) {
      const def = getItemDef(stack.id);
      const lines = [];
      if (def.melee) {
        lines.push(`Damage: ${def.melee.damage}`, `Speed: ${def.melee.speed} swings/s`, `Reach: ${def.melee.range} m`);
        if (def.melee.twoHanded) lines.push('Two-handed');
      }
      if (def.firearm) {
        lines.push(`Damage: ${def.firearm.damage}${def.firearm.pellets ? ' × ' + def.firearm.pellets : ''}`,
          `Magazine: ${stack.ammo ?? 0} / ${def.firearm.magSize}`, `Ammo: ${def.firearm.ammo.map((a) => getItemDef(a).name).join(', ')}`,
          `Fire mode: ${(stack.mode || def.firearm.modes[0]).toUpperCase()}`);
        if (def.firearm.scope) lines.push(`Scope: ${def.firearm.scope}×`);
      }
      if (def.food) {
        lines.push(`Hunger: +${def.food.hunger}`);
        if (def.food.thirst) lines.push(`Thirst: ${def.food.thirst > 0 ? '+' : ''}${def.food.thirst}`);
        if (def.food.needsOpener) lines.push('Needs a can opener or blade');
        if (def.food.spoils) lines.push('Freshness: Fresh');
      }
      if (def.drink) lines.push(`Thirst: +${def.drink.thirst}${def.uses ? ' per sip' : ''}`);
      if (def.uses && stack.uses != null) lines.push(`${def.light ? 'Battery' : 'Uses'}: ${stack.uses}${def.light ? '%' : ' / ' + def.uses}`);
      if (def.clothing) {
        lines.push(`Insulation: ${Math.round((def.clothing.insulation || 0) * 100)}%`);
        if (def.clothing.bite) lines.push(`Bite protection: ${Math.round(def.clothing.bite * 100)}%`);
        if (def.clothing.scratch) lines.push(`Scratch protection: ${Math.round(def.clothing.scratch * 100)}%`);
      }
      if (def.capacity) lines.push(`Storage: ${def.capacity} slots${def.weightReduction ? ` (−${Math.round(def.weightReduction * 100)}% weight)` : ''}`);
      if (def.desc) lines.push(def.desc);
      return {
        name: def.name, lines, rarity: def.rarity || 'common',
        condition: def.durability ? (stack.dur ?? def.durability) / def.durability : null,
      };
    },
    getRecipes() {
      return RECIPES.map((r) => {
        const inputs = r.in.map(([id, n]) => ({ label: getItemDef(id).id === 'unknown' ? id.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : getItemDef(id).name, have: haveItem(id), need: n, ok: haveItem(id) >= n, id }));
        const tools = r.tools.map(([id, label]) => ({ label, ok: haveItem(id) > 0 }));
        const station = r.station ? { label: r.station, ok: r.station === 'Campfire' ? nearFire : false } : null;
        const missing = [...inputs.filter((x) => !x.ok), ...tools.filter((t) => !t.ok).map((t) => ({ label: t.label, have: 0, need: 1 }))];
        const canCraft = !missing.length && (!station || station.ok);
        return { recipe: { id: r.id, name: r.name, category: r.category, desc: r.desc, time: r.time, result: r.result }, canCraft, missing, inputs, tools, station };
      });
    },
    craft(id) {
      log('craft', id);
      const r = RECIPES.find((x) => x.id === id);
      hud.progress = { label: `Crafting ${r?.name || id}`, t: 0 };
    },
    getTreatments(i) {
      const w = player.wounds[i];
      if (!w) return [];
      const out = [];
      if (w.bandaged) out.push({ label: 'Remove bandage', run: () => { w.bandaged = false; } });
      else out.push({ label: 'Bandage', run: () => { w.bandaged = true; w.bleeding = false; }, disabled: !inv.has('bandage') && !inv.has('rag') });
      if (!w.disinfected) out.push({ label: 'Disinfect', run: () => { w.disinfected = true; }, disabled: !inv.has('disinfectant') });
      if (w.type === 'fracture' && !w.splinted) out.push({ label: 'Splint', run: () => { w.splinted = true; }, disabled: !inv.has('splint') });
      if (w.type === 'laceration' || w.type === 'deep') out.push({ label: 'Stitch', run: () => { w.heal = Math.min(1, w.heal + 0.3); }, disabled: !inv.has('suture_kit') });
      return out;
    },
    calls,
  };

  function consume(desc, i) {
    const st = desc.slots[i];
    if (!st) return;
    st.count = (st.count || 1) - 1;
    if (st.count <= 0) desc.slots[i] = null;
    inv.changed();
  }

  // animate crafting progress
  setInterval(() => {
    if (hud.progress && hud.progress.label.startsWith('Crafting')) {
      hud.progress.t += 0.05;
      if (hud.progress.t >= 1) { hud.progress = null; game.ui?.toast('Crafted successfully', 'good'); }
    }
  }, 100);

  return game;
}

export { NOTES as MOCK_NOTES };
