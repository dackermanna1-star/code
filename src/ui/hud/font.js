// GoldSrc (Steam) HUD text metrics: the engine font is a bold Verdana with a drop
// shadow whose size steps with the screen height (VGUI2 scheme "yres" ranges).

export const ENGINE_FONT = 'Verdana, "DejaVu Sans", Tahoma, Arial, sans-serif';

/** Font size in screen pixels for DrawConsoleString-style HUD text. */
export function engineFontPx(vh) {
  if (vh < 480) return 10;
  if (vh < 600) return 11;
  if (vh < 768) return 12;
  if (vh < 1024) return 14;
  if (vh < 1200) return 18;
  if (vh < 1440) return 20;
  return Math.round(vh * 0.0167);
}

/** Pixel height of a console text line. */
export function engineLineHeight(vh) {
  return Math.round(engineFontPx(vh) * 1.22);
}

/** Minimum virtual height that switches to the double-size sprite set. */
export const HIRES_MIN_HEIGHT = 1440;

/**
 * GoldSrc picks 320 sprites below 640 wide, 640 sprites otherwise (drawn 1:1).
 * We add a double-size set for very tall screens so the HUD keeps its
 * proportions on 1440p+/4K canvases.
 */
export function spriteScale(vw, vh) {
  if (vw < 640) return 2 / 3;
  if (vh >= HIRES_MIN_HEIGHT) return 2;
  return 1;
}

export function fontString(px, bold = true) {
  return `${bold ? 'bold ' : ''}${px}px ${ENGINE_FONT}`;
}
