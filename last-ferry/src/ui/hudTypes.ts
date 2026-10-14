// HUD data contract: the game app fills a snapshot every frame; the HUD renders it.
import type { WeaponId } from '../config/ids';

export interface HudSlot {
  id: WeaponId;
  name: string;
  price: number;
  owned: boolean;
  selected: boolean;
  affordable: boolean;
  /** Rounds in the magazine when owned. */
  ammo: number;
  /** 1-based key number. */
  key: number;
}

export interface HudSnapshot {
  chapter: number;
  chapterName: string;
  /** 'boss' shows the boss bar instead of the boarding bar; 'mopup' the stragglers left after the boss. */
  mode: 'boarding' | 'boss' | 'mopup';
  /** Boarding: survivors aboard / total. */
  boarded: number;
  passengers: number;
  /** Boss phase: remaining boss life 0..1 and its name. */
  bossLife: number;
  bossName: string;
  money: number;
  kills: number;
  slots: HudSlot[];
  weapon: { id: WeaponId; name: string; bullets: number; clip: number; reload: number | null; heat: number; spin: number };
  /** 0..1 */
  health: number;
  /** Captain's Favour 0..1 and whether the cannon strike is ready (F). */
  favour: number;
  favourReady: boolean;
  hornReady: boolean;
  craneReady: boolean;
  /** Optional: in-game clock shown next to the chapter ("18:52"). */
  clock?: string;
  /** Optional 0..1: a zombie is close to the gangway (the boarding bar pulses red). */
  danger?: number;
  /** Mop-up: zombies still to put down before the pier is held, and how many there were. */
  stragglers?: number;
  stragglersMax?: number;
  /** Zombies under the crane's pallet (the chip glows when it's worth dropping). */
  craneUnder?: number;
}

/** Big centred callouts (NICE SHOT, MASSACRE, HEADSHOT ×3, TIDY …). */
export type CalloutKind = 'nice' | 'massacre' | 'headshot' | 'tidy' | 'boss' | 'info' | 'danger';
