/**
 * Loot tables for POI containers. Each roll picks one weighted entry.
 * Tiers deliberately concentrate progression items (components, scrap,
 * blueprint-gated gear) in riskier locations.
 */
export interface LootEntry {
  item: string;
  min: number;
  max: number;
  weight: number;
}

export interface LootTable {
  rolls: [number, number];
  entries: LootEntry[];
}

export const LOOT: Record<string, LootTable> = {
  barrel: {
    rolls: [1, 2],
    entries: [
      { item: 'scrap', min: 2, max: 6, weight: 10 },
      { item: 'rope', min: 1, max: 1, weight: 3 },
      { item: 'metal_pipe', min: 1, max: 1, weight: 2 },
      { item: 'spring', min: 1, max: 1, weight: 1 },
      { item: 'gears', min: 1, max: 1, weight: 2 },
      { item: 'sewing_kit', min: 1, max: 1, weight: 1 },
      { item: 'cloth', min: 5, max: 15, weight: 3 },
      { item: 'low_grade_fuel', min: 3, max: 8, weight: 3 },
      { item: 'canned_beans', min: 1, max: 1, weight: 2 },
      { item: 'water_bottle', min: 1, max: 1, weight: 2 },
      { item: 'pistol_ammo', min: 4, max: 8, weight: 1 },
    ],
  },
  crate: {
    rolls: [2, 4],
    entries: [
      { item: 'scrap', min: 6, max: 14, weight: 10 },
      { item: 'metal_frag', min: 25, max: 75, weight: 6 },
      { item: 'metal_pipe', min: 1, max: 2, weight: 4 },
      { item: 'spring', min: 1, max: 2, weight: 3 },
      { item: 'gears', min: 1, max: 2, weight: 3 },
      { item: 'rope', min: 1, max: 2, weight: 3 },
      { item: 'sewing_kit', min: 1, max: 1, weight: 2 },
      { item: 'tech_parts', min: 1, max: 1, weight: 1 },
      { item: 'metal_hatchet', min: 1, max: 1, weight: 2 },
      { item: 'metal_pickaxe', min: 1, max: 1, weight: 2 },
      { item: 'machete', min: 1, max: 1, weight: 1 },
      { item: 'pipe_pistol', min: 1, max: 1, weight: 1 },
      { item: 'can_helmet', min: 1, max: 1, weight: 1 },
      { item: 'medical_syringe', min: 1, max: 2, weight: 2 },
      { item: 'anti_rad_pills', min: 1, max: 2, weight: 2 },
      { item: 'pistol_ammo', min: 8, max: 16, weight: 2 },
      { item: 'shotgun_shell', min: 4, max: 8, weight: 2 },
      { item: 'tin_grenade', min: 1, max: 2, weight: 1 },
    ],
  },
  military: {
    rolls: [2, 4],
    entries: [
      { item: 'scrap', min: 15, max: 30, weight: 8 },
      { item: 'hq_metal', min: 5, max: 15, weight: 5 },
      { item: 'tech_parts', min: 1, max: 3, weight: 5 },
      { item: 'spring', min: 1, max: 3, weight: 4 },
      { item: 'metal_pipe', min: 1, max: 3, weight: 4 },
      { item: 'rifle_ammo', min: 10, max: 30, weight: 4 },
      { item: 'explosive_compound', min: 2, max: 6, weight: 2 },
      { item: 'lever_rifle', min: 1, max: 1, weight: 2 },
      { item: 'scrap_shotgun', min: 1, max: 1, weight: 2 },
      { item: 'service_rifle', min: 1, max: 1, weight: 1 },
      { item: 'marksman_rifle', min: 1, max: 1, weight: 1 },
      { item: 'metal_chestplate', min: 1, max: 1, weight: 1 },
      { item: 'metal_facemask', min: 1, max: 1, weight: 1 },
      { item: 'hazmat_suit', min: 1, max: 1, weight: 2 },
      { item: 'large_medkit', min: 1, max: 1, weight: 2 },
      { item: 'breach_charge', min: 1, max: 1, weight: 1 },
    ],
  },
};

export function rollLoot(table: string, rnd: () => number): Array<[string, number]> {
  const t = LOOT[table];
  if (!t) return [];
  const total = t.entries.reduce((a, e) => a + e.weight, 0);
  const rolls = t.rolls[0] + Math.floor(rnd() * (t.rolls[1] - t.rolls[0] + 1));
  const out: Array<[string, number]> = [];
  for (let r = 0; r < rolls; r++) {
    let pick = rnd() * total;
    for (const e of t.entries) {
      pick -= e.weight;
      if (pick <= 0) {
        out.push([e.item, e.min + Math.floor(rnd() * (e.max - e.min + 1))]);
        break;
      }
    }
  }
  return out;
}
