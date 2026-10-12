// HUD data contract (filled by Game.snapshot every frame) and the classic
// HUD geometry. Shared by the classic and the modern HUD.
import type { WeaponId } from '../config/weapons';
import type { ViewMode } from '../config/firstPerson';
import type { EnemyType } from '../config/enemies';

export interface HudWeaponSlot {
  id: WeaponId;
  price: number;
  owned: boolean;
  selected: boolean;
  affordable: boolean;
  /** "$500" when not owned, "x6" (rounds in magazine) when owned. */
  caption: string;
}

export interface HudSnapshot {
  mode: 'level' | 'boss';
  /** "Level 1:" or "Boss:" */
  label: string;
  /** 0..1 — level time elapsed, or remaining boss life in boss mode. */
  progress: number;
  money: number;
  kills: number;
  /** 10 slots (HUD_WEAPONS order). */
  slots: HudWeaponSlot[];
  /** Camera mode; the HUD may adapt (e.g. show the radar only in first person). */
  view?: ViewMode;
  /** 0..1 hunter health (regenerates; 0 = dead). */
  health?: number;
  /** Active weapon. */
  weapon?: HudWeapon;
  /** Top-down radar data (first person: creatures can be behind you). */
  radar?: HudRadar;
  /** Bot teammates (not you), for a small team list. Absent or empty when playing alone. */
  team?: HudTeammate[];
}

export interface HudWeapon {
  id: WeaponId;
  name: string;
  /** Rounds in the magazine. */
  bullets: number;
  clip: number;
  /** 0..1 reload progress, null when not reloading. */
  reload: number | null;
}

export interface HudRadar {
  /** World-space bounds of the play field (x left..right, z back..front). */
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  /** Creatures crossing this x escape (game over). */
  escapeX: number;
  player: { x: number; z: number; /** first-person yaw (config/firstPerson.ts convention) */ yaw: number };
  enemies: Array<{ x: number; z: number; type: EnemyType; boss: boolean }>;
  /** Bot teammates' positions (alive only), drawn in their colour. */
  teammates?: Array<{ x: number; z: number; color: string }>;
}

/** Slot geometry inside the panel (design px). */
export const HUD_GEOMETRY = {
  stripH: 17.5,
  panelY: 17.5,
  panelH: 48,
  slotX0: 1.2,
  slotPitch: 54.5,
  slotY: 4,
  slotW: 50,
  slotH: 40,
  boxX: 550.5,
  boxW: 87.5,
} as const;

export interface HudTeammate {
  name: string;
  /** CSS colour (their parka / crosshair colour). */
  color: string;
  kills: number;
  money: number;
  /** Current weapon's display name. */
  weapon: string;
  alive: boolean;
}
