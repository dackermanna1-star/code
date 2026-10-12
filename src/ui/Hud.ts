// In-game HUD. Two looks, switchable at runtime (Options.hudStyle):
//   'modern'  (default) a quiet, minimal HUD anchored to the view edges —
//             level/boss progress top centre, money and kills top right,
//             a compact weapon bar bottom centre, the active weapon's ammo
//             bottom right and a health bar that only appears when hurt;
//   'classic' the original 2005 top bar, unchanged (HudClassic.ts).
// In first person a small top-down radar shows the field behind the hunter.
import type { WeaponId } from '../config/weapons';
import { ClassicHud } from './HudClassic';
import { ModernHud } from './HudModern';
import { Radar } from './Radar';
import { storageGet } from './dom';
import type { HudSnapshot } from './hudTypes';

export { HUD_GEOMETRY } from './hudTypes';
export type { HudRadar, HudSnapshot, HudWeapon, HudWeaponSlot } from './hudTypes';

export type HudStyle = 'modern' | 'classic';

/** The HUD style saved in the options (so the first frame already has the right look). */
function savedStyle(): HudStyle {
  const o = storageGet<{ hudStyle?: unknown }>('sealhunter3d.options');
  return o && o.hudStyle === 'classic' ? 'classic' : 'modern';
}

export class Hud {
  /** Called when a weapon slot is clicked. */
  onSlotClick: ((id: WeaponId) => void) | null = null;
  /**
   * Classic HUD: tint the level bar toward red near the end, as py-sealhunter
   * does: rgb(255, 255-255k^8, 255-255k^8). The 2005 frames (ref2: white bar
   * at ~96%) suggest the original did not, so this can be switched off.
   */
  levelBarTint = true;

  private readonly view: HTMLElement;
  private icons: Partial<Record<WeaponId, string>>;
  private classic: ClassicHud | null = null;
  private modern: ModernHud | null = null;
  private readonly radar: Radar;
  private style: HudStyle;
  private visible = true;
  private last: HudSnapshot | null = null;

  constructor(view: HTMLElement, icons: Partial<Record<WeaponId, string>> = {}) {
    this.view = view;
    this.icons = { ...icons };
    this.style = savedStyle();
    this.radar = new Radar(view);
    this.build();
  }

  get currentStyle(): HudStyle {
    return this.style;
  }

  setIcons(icons: Partial<Record<WeaponId, string>>): void {
    this.icons = { ...icons };
    this.classic?.setIcons(this.icons);
    this.modern?.setIcons(this.icons);
  }

  /** HUD look (Options.hudStyle). */
  setStyle(style: HudStyle): void {
    if (style !== 'classic') style = 'modern';
    if (style === this.style) return;
    this.style = style;
    this.build();
    if (this.last) this.update(this.last);
  }

  setVisible(v: boolean): void {
    if (v === this.visible) return;
    this.visible = v;
    this.classic?.setVisible(v && this.style === 'classic');
    this.modern?.setVisible(v && this.style === 'modern');
    if (!v) this.radar.update(undefined, false);
  }

  update(s: HudSnapshot): void {
    this.last = s;
    if (this.style === 'classic') {
      const c = this.classic!;
      c.levelBarTint = this.levelBarTint;
      c.update(s);
    } else {
      this.modern!.update(s);
    }
    this.radar.update(s.radar, this.visible && s.view === 'first', this.style);
  }

  /** Create the active look on demand and show only it. */
  private build(): void {
    const click = (id: WeaponId) => this.onSlotClick?.(id);
    if (this.style === 'classic' && !this.classic) {
      this.classic = new ClassicHud(this.view, this.icons);
      this.classic.onSlotClick = click;
    }
    if (this.style === 'modern' && !this.modern) {
      this.modern = new ModernHud(this.view, this.icons);
      this.modern.onSlotClick = click;
    }
    this.classic?.setVisible(this.visible && this.style === 'classic');
    this.modern?.setVisible(this.visible && this.style === 'modern');
  }
}
