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
  /** Not a plain melee hit: what happens at the clip's contact instead (see BossBrain). */
  special?: 'knife_throw' | 'shockwave' | 'taser' | 'slam';
  /** Minimum warning time for this attack (s), above the usual one. */
  tell?: number;
  /** Poisoned blade: the hit keeps hurting for a few seconds. */
  venom?: boolean;
  /** A shock baton: a landed hit jolts (sparks, a stagger) - see BossBrain.landed. */
  shock?: boolean;
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
  // elite martial artists reuse the player's strike clips (they step in closer first: those
  // strikes lunge less far than a thug's haymaker)
  elite_jab: { clip: 'jab', kind: 'punch', region: 'head', reach: 0.92, damage: 9, strength: 0.5, unblockable: false, weight: 1, startRange: 1.8 },
  elite_cross: { clip: 'cross', kind: 'punch', region: 'head', reach: 0.95, damage: 11, strength: 0.6, unblockable: false, weight: 1, startRange: 1.85 },
  elite_hook: { clip: 'hook', kind: 'punch', region: 'head', reach: 0.72, damage: 12, strength: 0.6, unblockable: false, weight: 0.8, startRange: 1.6 },
  elite_round: { clip: 'roundhouse', kind: 'kick', region: 'head', reach: 1.0, damage: 16, strength: 0.9, unblockable: false, weight: 0.9, startRange: 2.15 },
  elite_spin: { clip: 'spinkick', kind: 'kick', region: 'gut', reach: 1.05, damage: 20, strength: 1.2, unblockable: true, weight: 0.5, startRange: 2.25, knockdown: true },
  elite_side: { clip: 'sidekick', kind: 'kick', region: 'chest', reach: 1.1, damage: 14, strength: 1.0, unblockable: false, weight: 0.7, startRange: 2.25 },
  elite_fly: { clip: 'flyknee', kind: 'knee', region: 'head', reach: 0.62, damage: 18, strength: 1.1, unblockable: true, weight: 0.4, startRange: 5.5, knockdown: true },
  // ---- boss signature moves (weight 0: only ever chosen by a boss brain's combo scripts)
  kael_round_r: { clip: 'roundhouse', kind: 'kick', region: 'head', reach: 1.0, damage: 20, strength: 1.2, unblockable: true, weight: 0, startRange: 2.15, knockdown: true },
  kael_side_r: { clip: 'sidekick', kind: 'kick', region: 'chest', reach: 1.1, damage: 18, strength: 1.2, unblockable: true, weight: 0, startRange: 2.25, knockdown: true },
  kael_palm_r: { clip: 'stun_palm', kind: 'palm', region: 'chest', reach: 0.8, damage: 16, strength: 1.3, unblockable: true, weight: 0, startRange: 1.7, knockdown: true },
  kael_shockwave: { clip: 'stun_palm', kind: 'palm', region: 'chest', reach: 0.8, damage: 26, strength: 1.5, unblockable: true, weight: 0, startRange: 9, special: 'shockwave', tell: 1.0 },
  viper_slash: { clip: 'e_knife_slash', kind: 'blade', region: 'chest', reach: 0.85, damage: 12, strength: 0.6, unblockable: false, weight: 0, startRange: 2.4, weapon: 'knife', bleed: 0.8, venom: true },
  viper_stab_r: { clip: 'e_knife_stab', kind: 'blade', region: 'gut', reach: 0.85, damage: 18, strength: 0.8, unblockable: true, weight: 0, startRange: 3.4, weapon: 'knife', bleed: 1, venom: true },
  // the Warden: a stun baton in a professional's hands, and a taser
  warden_baton: { clip: 'e_club_swing', kind: 'blunt', region: 'head', reach: 1.0, damage: 13, strength: 0.9, unblockable: false, weight: 1, startRange: 2.6, weapon: 'club', shock: true },
  warden_overhead: { clip: 'e_club_overhead', kind: 'blunt', region: 'head', reach: 0.95, damage: 20, strength: 1.2, unblockable: true, weight: 0, startRange: 2.6, weapon: 'club', knockdown: true, shock: true },
  warden_jab: { clip: 'e_punch', kind: 'punch', region: 'head', reach: 0.9, damage: 9, strength: 0.6, unblockable: false, weight: 0, startRange: 2.2 },
  warden_kick: { clip: 'e_kick', kind: 'kick', region: 'gut', reach: 1.05, damage: 12, strength: 0.9, unblockable: false, weight: 0, startRange: 2.4 },
  warden_taser: { clip: 'e_punch', kind: 'punch', region: 'chest', reach: 12, damage: 12, strength: 0.6, unblockable: true, weight: 0, startRange: 12, special: 'taser', tell: 0.3 },
  // Subject Zero: what the lab made
  subject_punch: { clip: 'e_bruiser_punch', kind: 'punch', region: 'head', reach: 1.05, damage: 20, strength: 1.3, unblockable: false, weight: 0, startRange: 2.9 },
  subject_smash: { clip: 'e_bruiser_smash', kind: 'blunt', region: 'head', reach: 1.0, damage: 28, strength: 1.5, unblockable: true, weight: 0, startRange: 2.7, knockdown: true },
  subject_charge: { clip: 'e_bruiser_charge', kind: 'slam', region: 'chest', reach: 0.9, damage: 26, strength: 1.6, unblockable: true, weight: 0, startRange: 9, knockdown: true, tell: 0.75 },
  subject_slam: { clip: 'e_bruiser_smash', kind: 'blunt', region: 'chest', reach: 0.8, damage: 24, strength: 1.5, unblockable: true, weight: 0, startRange: 9, special: 'slam', tell: 0.9 },
  viper_throw: { clip: 'e_knife_slash', kind: 'blade', region: 'chest', reach: 0.85, damage: 11, strength: 0.6, unblockable: true, weight: 0, startRange: 12, special: 'knife_throw', bleed: 0.7, venom: true, tell: 0.55 },
};
