import { HitKind, Region } from './types';

export interface MoveDef {
  name: string;
  clip: string;
  kind: HitKind;
  region: Region;
  reach: number; // root-to-root distance at contact
  damage: number;
  strength: number; // reaction size 0.2..1.5
  bleed: number;
  range: 'close' | 'mid' | 'far' | 'back';
  knockdown?: boolean;
  launch?: number;
  weight: number; // selection weight
  minCombo?: number;
  speed?: number;
  tags?: string[];
}

/** Player unarmed strikes. Mirrored variants (_m) are used for targets on the other side. */
export const PLAYER_STRIKES: MoveDef[] = [
  { name: 'jab', clip: 'jab', kind: 'punch', region: 'head', reach: 0.92, damage: 8, strength: 0.35, bleed: 0.25, range: 'mid', weight: 1.2 },
  { name: 'cross', clip: 'cross', kind: 'punch', region: 'head', reach: 0.95, damage: 11, strength: 0.55, bleed: 0.35, range: 'mid', weight: 1.2 },
  { name: 'hook', clip: 'hook', kind: 'punch', region: 'head', reach: 0.72, damage: 12, strength: 0.6, bleed: 0.4, range: 'mid', weight: 1.1 },
  { name: 'bodyhook', clip: 'bodyhook', kind: 'punch', region: 'gut', reach: 0.66, damage: 11, strength: 0.6, bleed: 0.05, range: 'close', weight: 0.9 },
  { name: 'uppercut', clip: 'uppercut', kind: 'punch', region: 'head', reach: 0.62, damage: 14, strength: 0.8, bleed: 0.5, range: 'close', weight: 0.9 },
  { name: 'elbow', clip: 'elbow', kind: 'elbow', region: 'head', reach: 0.55, damage: 15, strength: 0.75, bleed: 0.6, range: 'close', weight: 0.9 },
  { name: 'knee', clip: 'knee', kind: 'knee', region: 'gut', reach: 0.5, damage: 15, strength: 0.85, bleed: 0.1, range: 'close', weight: 0.7, minCombo: 2 },
  { name: 'frontkick', clip: 'frontkick', kind: 'kick', region: 'gut', reach: 1.05, damage: 13, strength: 0.9, bleed: 0.05, range: 'mid', weight: 0.8, launch: 1.5 },
  { name: 'roundhouse', clip: 'roundhouse', kind: 'kick', region: 'head', reach: 1.0, damage: 18, strength: 1.0, bleed: 0.6, range: 'mid', weight: 0.8, minCombo: 2 },
  { name: 'sidekick', clip: 'sidekick', kind: 'kick', region: 'chest', reach: 1.12, damage: 16, strength: 1.1, bleed: 0.1, range: 'mid', weight: 0.7, minCombo: 1, launch: 2.5 },
  { name: 'spinkick', clip: 'spinkick', kind: 'kick', region: 'gut', reach: 1.05, damage: 20, strength: 1.2, bleed: 0.1, range: 'mid', weight: 0.6, minCombo: 4, launch: 3 },
  { name: 'flyknee', clip: 'flyknee', kind: 'knee', region: 'head', reach: 0.62, damage: 20, strength: 1.2, bleed: 0.7, range: 'far', weight: 1, launch: 1.5 },
  { name: 'backelbow', clip: 'backelbow', kind: 'elbow', region: 'head', reach: 0.55, damage: 12, strength: 0.7, bleed: 0.5, range: 'back', weight: 1 },
  { name: 'backkick', clip: 'backkick', kind: 'kick', region: 'gut', reach: 1.0, damage: 14, strength: 1.0, bleed: 0.05, range: 'back', weight: 1, launch: 2 },
];

export interface EnemyAttack {
  clip: string;
  kind: HitKind;
  region: Region;
  reach: number;
  damage: number;
  strength: number;
  unblockable: boolean;
  /** Weight for selection. */
  weight: number;
  /** Range from which this attack is started (m). */
  startRange: number;
  knockdown?: boolean;
  weapon?: 'knife' | 'club' | 'sword';
  bleed?: number;
}

export const ENEMY_ATTACKS: Record<string, EnemyAttack> = {
  punch: { clip: 'e_punch', kind: 'punch', region: 'head', reach: 0.9, damage: 9, strength: 0.6, unblockable: false, weight: 1, startRange: 2.4 },
  haymaker: { clip: 'e_haymaker', kind: 'punch', region: 'head', reach: 0.72, damage: 12, strength: 0.8, unblockable: false, weight: 0.8, startRange: 2.4 },
  kick: { clip: 'e_kick', kind: 'kick', region: 'gut', reach: 1.05, damage: 10, strength: 0.8, unblockable: false, weight: 0.6, startRange: 2.6 },
  lunge: { clip: 'e_lunge', kind: 'punch', region: 'head', reach: 0.92, damage: 9, strength: 0.6, unblockable: false, weight: 1, startRange: 3.6 },
  knife_slash: { clip: 'e_knife_slash', kind: 'blade', region: 'chest', reach: 0.85, damage: 13, strength: 0.6, unblockable: false, weight: 1, startRange: 2.4, weapon: 'knife', bleed: 0.8 },
  knife_stab: { clip: 'e_knife_stab', kind: 'blade', region: 'gut', reach: 0.85, damage: 18, strength: 0.7, unblockable: true, weight: 0.6, startRange: 3.4, weapon: 'knife', bleed: 1 },
  club_swing: { clip: 'e_club_swing', kind: 'blunt', region: 'head', reach: 1.0, damage: 15, strength: 0.9, unblockable: false, weight: 1, startRange: 2.6, weapon: 'club' },
  club_overhead: { clip: 'e_club_overhead', kind: 'blunt', region: 'head', reach: 0.95, damage: 22, strength: 1.2, unblockable: true, weight: 0.5, startRange: 2.6, weapon: 'club', knockdown: true },
  sword_slash: { clip: 'e_sword_slash', kind: 'blade', region: 'chest', reach: 1.05, damage: 16, strength: 0.8, unblockable: false, weight: 1, startRange: 2.8, weapon: 'sword', bleed: 1 },
  sword_spin: { clip: 'e_sword_spin', kind: 'blade', region: 'gut', reach: 1.1, damage: 22, strength: 1.0, unblockable: true, weight: 0.5, startRange: 3.0, weapon: 'sword', bleed: 1 },
  bruiser_punch: { clip: 'e_bruiser_punch', kind: 'punch', region: 'head', reach: 1.0, damage: 18, strength: 1.2, unblockable: false, weight: 1, startRange: 2.8 },
  bruiser_smash: { clip: 'e_bruiser_smash', kind: 'blunt', region: 'head', reach: 0.95, damage: 26, strength: 1.4, unblockable: true, weight: 0.7, startRange: 2.6, knockdown: true },
  bruiser_charge: { clip: 'e_bruiser_charge', kind: 'slam', region: 'chest', reach: 0.8, damage: 24, strength: 1.5, unblockable: true, weight: 0.5, startRange: 7, knockdown: true },
  // elite martial artists reuse the player's strike clips
  elite_jab: { clip: 'jab', kind: 'punch', region: 'head', reach: 0.92, damage: 9, strength: 0.5, unblockable: false, weight: 1, startRange: 2.4 },
  elite_cross: { clip: 'cross', kind: 'punch', region: 'head', reach: 0.95, damage: 11, strength: 0.6, unblockable: false, weight: 1, startRange: 2.4 },
  elite_hook: { clip: 'hook', kind: 'punch', region: 'head', reach: 0.72, damage: 12, strength: 0.6, unblockable: false, weight: 0.8, startRange: 2.2 },
  elite_round: { clip: 'roundhouse', kind: 'kick', region: 'head', reach: 1.0, damage: 16, strength: 0.9, unblockable: false, weight: 0.9, startRange: 2.6 },
  elite_spin: { clip: 'spinkick', kind: 'kick', region: 'gut', reach: 1.05, damage: 20, strength: 1.2, unblockable: true, weight: 0.5, startRange: 2.8, knockdown: true },
  elite_side: { clip: 'sidekick', kind: 'kick', region: 'chest', reach: 1.1, damage: 14, strength: 1.0, unblockable: false, weight: 0.7, startRange: 2.8 },
  elite_fly: { clip: 'flyknee', kind: 'knee', region: 'head', reach: 0.62, damage: 18, strength: 1.1, unblockable: true, weight: 0.4, startRange: 5.5, knockdown: true },
};
