/**
 * UI contract (DOM overlay on top of the game canvas). The game calls these; the UI never
 * touches the simulation directly. Left/right refer to SCREEN SIDES at the start of the battle
 * (the HUD keeps each fighter on the side they started, even if they cross over).
 */

export type ScreenSide = 'left' | 'right';

export interface HudAbility {
  name: string;
  slot: 'mobility' | 'ranged' | 'special' | 'defense' | 'ultimate';
  /** 0 = ready, 1 = just used (remaining cooldown fraction). */
  cooldown: number;
  /** Can afford now (energy / wrath) and off cooldown. */
  ready: boolean;
  /** Short glyph to show in the slot icon (1–2 chars), e.g. "✦". */
  glyph: string;
}

export interface HudFighter {
  name: string;
  title: string;
  color: string;
  colorLight: string;
  aspectName: string;
  weaponName: string;
  personalityName: string;
  hp: number;
  maxHp: number;
  energy: number;
  maxEnergy: number;
  guard: number;
  maxGuard: number;
  wrath: number;
  maxWrath: number;
  abilities: HudAbility[];
  /** Status tags e.g. ["ASCENDED", "BURNING", "LAST STAND"]. */
  status: string[];
  /** Current AI intent label (e.g. "Baiting"), shown subtly under the bars. */
  intent: string;
  /** Running combo on the opponent (0 = none). */
  combo: number;
  comboDamage: number;
  ultimateReady: boolean;
  lastStandAvailable: boolean;
}

export interface HudState {
  left: HudFighter;
  right: HudFighter;
  /** Fight clock in seconds. */
  time: number;
  /** Phase label, e.g. "ESCALATION". */
  phase: string;
  /** Win probability for the LEFT fighter (0..1). */
  winProbLeft: number;
  seedCode: string;
  arenaName: string;
  paused: boolean;
  speed: number;
}

export interface CalloutOpts {
  side?: ScreenSide | 'center';
  color?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  sub?: string;
  /** Seconds (default ~1.2). */
  duration?: number;
}

export interface FeedLine {
  time: string;
  text: string;
  color?: string;
  important?: boolean;
}

export interface IHud {
  mount(root: HTMLElement): void;
  /** Called every frame — must be cheap (only touch DOM when values change). */
  update(state: HudState): void;
  /** Big animated text (COUNTER!, PERFECT PARRY, GUARD BREAK, 7 HITS, FINISH...). */
  callout(text: string, opts?: CalloutOpts): void;
  /** Battle narration feed (story of the fight). */
  feed(line: FeedLine): void;
  clearFeed(): void;
  /** Fighting-game style super cut-in banner sweeping across the screen. */
  ultimateCutIn(side: ScreenSide, fighterName: string, abilityName: string, color: string): void;
  /** Struggle meter for blade locks / beam struggles / final clash: v in -1 (left wins) .. 1 (right wins); null hides. */
  struggle(v: number | null, leftColor: string, rightColor: string, label?: string): void;
  /** Finisher title card ("FINAL DRAW"), shown center with a dramatic reveal. */
  finisherTitle(name: string, color: string): void;
  setVisible(v: boolean): void;
  setFeedVisible(v: boolean): void;
}

export interface FighterCard {
  name: string;
  title: string;
  color: string;
  colorLight: string;
  aspectName: string;
  aspectBlurb: string;
  weaponName: string;
  weaponBlurb: string;
  personalityName: string;
  personalityBlurb: string;
  abilities: { name: string; slot: string; description: string; glyph: string }[];
  /** Accessory id for the portrait drawing ('scarf' | 'ponytail' | 'headband' | 'cape' | 'horns' | 'halo' | 'longhair'). */
  accessory: string;
  /** Weapon id for the portrait drawing ('katana' | 'greatsword' | 'spear' | 'daggers' | 'scythe' | 'gauntlets' | 'staff'). */
  weaponId: string;
}

export interface VersusInfo {
  left: FighterCard;
  right: FighterCard;
  arenaName: string;
  arenaSubtitle: string;
  seedCode: string;
  battleNumber: number;
}

export interface ResultsSummary {
  winnerSide: ScreenSide;
  winner: FighterCard;
  loser: FighterCard;
  /** e.g. "Final Draw" */
  finisherName: string;
  /** e.g. "Counter", "Beam Struggle", "Ultimate"... */
  methodLabel: string;
  durationSec: number;
  /** Rows of [label, leftValue, rightValue]. */
  stats: [string, string, string][];
  /** Win probability for the LEFT fighter over time. */
  timeline: { t: number; p: number }[];
  /** Notable moments (also plotted as markers on the timeline). */
  moments: { t: number; text: string; side?: ScreenSide }[];
  /** e.g. "Biggest comeback: X won from 9% win probability". */
  headline: string;
  seedCode: string;
  arenaName: string;
}

export interface ControlsHandlers {
  onPauseToggle(): void;
  onSpeed(speed: number): void;
  onNewBattle(): void;
  onReplay(): void;
  onRematch(): void;
  onMuteToggle(): void;
  onVolume(v: number): void;
  onToggleHud(): void;
  onToggleFeed(): void;
  onFullscreen(): void;
  onAutoContinue(v: boolean): void;
  /** Load a specific seed code (e.g. "7F3A-91C2"). */
  onLoadSeed(code: string): void;
  onCopyLink(): void;
}

export interface ControlsState {
  paused: boolean;
  speed: number;
  muted: boolean;
  volume: number;
  autoContinue: boolean;
  hudVisible: boolean;
  feedVisible: boolean;
  seedCode: string;
}

export interface IScreens {
  mount(root: HTMLElement): void;
  /** Title screen; resolves when the viewer clicks BEGIN (a user gesture — audio can start). */
  showTitle(): Promise<void>;
  /** VS intro cards; resolves after durationMs (or early if the viewer clicks/skips). */
  showVersus(info: VersusInfo, durationMs: number): Promise<void>;
  showResults(summary: ResultsSummary, handlers: { onNext(): void; onReplay(): void; onRematch(): void }, autoNextSec: number | null): void;
  hideAll(): void;
  /** Brief toast message (e.g. "Link copied"). */
  toast(text: string): void;
}

export interface IControls {
  mount(root: HTMLElement, handlers: ControlsHandlers): void;
  update(state: ControlsState): void;
  setVisible(v: boolean): void;
}
