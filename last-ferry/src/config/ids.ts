// Shared identifiers (logic, models, game view, UI, audio all agree on these).

export type ZombieKind =
  | 'shambler'
  | 'jogger'
  | 'bloater'
  | 'medic'
  | 'patient'
  | 'riot'
  | 'bigdave';

export type WeaponId = 'revolver' | 'nailgun' | 'shotgun' | 'flare' | 'harpoon' | 'outboard';

/** Weapon bar order (keys 1..6). */
export const WEAPON_ORDER: WeaponId[] = ['revolver', 'nailgun', 'shotgun', 'flare', 'harpoon', 'outboard'];

/** Which part of a zombie a hit landed on. 'plate' = riot armour, 'stretcher' = paramedics' stretcher. */
export type HitPart = 'head' | 'body' | 'legs' | 'plate' | 'stretcher';

/** Riot brute armour pieces (bit flags in Zombie.plates). */
export const PLATE_HELMET = 1;
export const PLATE_SHIELD = 2;
export const PLATE_CHEST = 4;

/** How a zombie died — selects the ragdoll / gore treatment. */
export type DeathKind =
  | 'down' // ordinary kill: falls, the body may rise again later
  | 'headshot' // head destroyed: stays dead
  | 'headoff' // head blown off (shotgun / outboard at close range)
  | 'gib' // explosion / cannon / crate drop: torn apart
  | 'burn' // burned to death: charred, collapses
  | 'pop' // bloater bursting
  | 'harpoon' // skewered: dragged on the harpoon line
  | 'stomp' // crawler / downed body stomped by the hunter
  | 'drown'; // knocked into the sea

/** Ejected shells / dropped magazines (presentation debris). */
export type ShellKind = 'none' | 'small' | 'normal' | 'shotgun' | 'awp' | 'minigun';
export type ClipKind = 'none' | 'small' | 'mp5' | 'mac' | 'awp' | 'drum' | 'belt';
