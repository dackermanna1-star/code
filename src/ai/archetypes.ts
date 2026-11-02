import { LocoStyle } from '../anim/locomotion';

export interface ArchetypeCfg {
  key: string;
  label: string;
  hp: number;
  speed: number; // run speed
  aggression: number; // 0..1 baseline
  attacks: string[]; // keys into ENEMY_ATTACKS
  style: LocoStyle;
  weapon?: 'knife' | 'club' | 'sword';
  block: number; // chance to block a player strike
  dodge: number; // chance to evade a player strike
  poise: number; // strikes absorbed without reacting (bruisers)
  needsStun: boolean;
  /** Seconds before contact that a counter still counts as perfect (default PERFECT_WINDOW). */
  perfectWindow?: number;
  comboHits: [number, number];
  feint: number;
  attackSpeed: number;
  score: number;
  rim: [number, number, number]; // readability tint
  boss?: boolean;
  phases?: number;
}

/** How close to contact a counter has to come to be perfect - all a boss accepts. */
export const PERFECT_WINDOW = 0.17;

export const ARCHETYPES: Record<string, ArchetypeCfg> = {
  brawler: { key: 'brawler', label: 'Thug', hp: 70, speed: 4.2, aggression: 0.5, attacks: ['punch', 'jab', 'haymaker', 'kick'], style: 'brawl', block: 0, dodge: 0, poise: 0, needsStun: false, comboHits: [1, 1], feint: 0, attackSpeed: 1, score: 100, rim: [0, 0, 0] },
  knife: { key: 'knife', label: 'Knife', hp: 60, speed: 4.6, aggression: 0.6, attacks: ['knife_slash', 'knife_slash', 'knife_stab'], style: 'weapon1h', weapon: 'knife', block: 0, dodge: 0.1, poise: 0, needsStun: false, comboHits: [1, 2], feint: 0, attackSpeed: 1.05, score: 150, rim: [0.8, 0.15, 0.1] },
  club: { key: 'club', label: 'Bat', hp: 85, speed: 4.0, aggression: 0.5, attacks: ['club_swing', 'club_swing', 'club_overhead'], style: 'weapon1h', weapon: 'club', block: 0, dodge: 0, poise: 0, needsStun: false, comboHits: [1, 1], feint: 0, attackSpeed: 1, score: 150, rim: [0.7, 0.5, 0.1] },
  sword: { key: 'sword', label: 'Blade', hp: 90, speed: 4.4, aggression: 0.6, attacks: ['sword_slash', 'sword_slash', 'sword_spin'], style: 'weapon1h', weapon: 'sword', block: 0.15, dodge: 0, poise: 0, needsStun: false, comboHits: [1, 2], feint: 0.05, attackSpeed: 1.05, score: 200, rim: [0.85, 0.85, 0.9] },
  agile: { key: 'agile', label: 'Runner', hp: 60, speed: 5.4, aggression: 0.7, attacks: ['lunge', 'punch', 'kick'], style: 'agile', block: 0, dodge: 0.45, poise: 0, needsStun: false, comboHits: [1, 2], feint: 0.15, attackSpeed: 1.15, score: 175, rim: [0.2, 0.6, 1] },
  bruiser: { key: 'bruiser', label: 'Brute', hp: 260, speed: 3.6, aggression: 0.45, attacks: ['bruiser_punch', 'bruiser_smash', 'bruiser_charge'], style: 'heavy', block: 0, dodge: 0, poise: 3, needsStun: true, comboHits: [1, 1], feint: 0, attackSpeed: 0.95, score: 400, rim: [0.9, 0.3, 0.1] },
  defender: { key: 'defender', label: 'Guard', hp: 110, speed: 3.8, aggression: 0.35, attacks: ['punch', 'jab', 'kick', 'haymaker'], style: 'brawl', block: 0.85, dodge: 0, poise: 0, needsStun: false, comboHits: [1, 1], feint: 0, attackSpeed: 1, score: 250, rim: [0.4, 0.8, 0.5] },
  elite: { key: 'elite', label: 'Fighter', hp: 130, speed: 4.8, aggression: 0.75, attacks: ['elite_jab', 'elite_cross', 'elite_hook', 'elite_round', 'elite_side', 'elite_spin'], style: 'fight', block: 0.3, dodge: 0.2, poise: 0, needsStun: false, comboHits: [2, 3], feint: 0.2, attackSpeed: 1.15, score: 350, rim: [0.8, 0.2, 0.8] },
  butcher: { key: 'butcher', label: 'THE BUTCHER', hp: 900, speed: 3.9, aggression: 0.55, attacks: ['club_swing', 'bruiser_punch', 'club_overhead', 'bruiser_charge'], style: 'heavy', weapon: 'club', block: 0, dodge: 0, poise: 4, needsStun: true, comboHits: [1, 2], feint: 0, attackSpeed: 1.0, score: 2500, rim: [1, 0.2, 0.1], boss: true, phases: 2 },
  viper: { key: 'viper', label: 'VIPER', hp: 950, speed: 6.0, aggression: 0.85, attacks: ['knife_slash', 'knife_stab', 'lunge', 'elite_round', 'elite_spin'], style: 'agile', weapon: 'knife', block: 0.2, dodge: 0.5, poise: 0, needsStun: false, comboHits: [2, 3], feint: 0.25, attackSpeed: 1.25, score: 3000, rim: [0.2, 1, 0.4], boss: true, phases: 2 },
  warden: { key: 'warden', label: 'THE WARDEN', hp: 1300, speed: 4.4, aggression: 0.75, attacks: ['warden_baton', 'warden_jab', 'warden_kick', 'warden_overhead'], style: 'heavy', weapon: 'club', block: 0.38, dodge: 0, poise: 2, needsStun: false, comboHits: [2, 3], feint: 0.15, attackSpeed: 1.0, score: 3200, rim: [0.35, 0.6, 1], boss: true, phases: 2 },
  subject: { key: 'subject', label: 'SUBJECT ZERO', hp: 1200, speed: 5.0, aggression: 0.85, attacks: ['subject_punch', 'subject_smash', 'subject_punch'], style: 'heavy', block: 0, dodge: 0, poise: 6, needsStun: true, perfectWindow: 0.2, comboHits: [2, 3], feint: 0, attackSpeed: 1.05, score: 5000, rim: [0.45, 1, 0.35], boss: true, phases: 3 },
  master: { key: 'master', label: 'GRANDMASTER KAEL', hp: 1600, speed: 5.2, aggression: 0.85, attacks: ['elite_jab', 'elite_cross', 'elite_hook', 'elite_round', 'elite_side', 'elite_spin', 'elite_fly'], style: 'master', block: 0.65, dodge: 0.25, poise: 2, needsStun: false, comboHits: [2, 4], feint: 0.3, attackSpeed: 1.25, score: 6000, rim: [1, 0.8, 0.2], boss: true, phases: 3 },
};
