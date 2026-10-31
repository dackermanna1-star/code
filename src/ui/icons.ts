/** Minimal inline SVG icon set (24×24 viewBox, currentColor). */
export const ICONS = {
  play: '<path d="M7 4.5v15l12.5-7.5z" fill="currentColor"/>',
  pause: '<path d="M6.5 4.5h4v15h-4zM13.5 4.5h4v15h-4z" fill="currentColor"/>',
  next: '<path d="M4.5 5v14l10-7z" fill="currentColor"/><path d="M15.5 5h3.5v14h-3.5z" fill="currentColor"/>',
  replay:
    '<path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><path d="M3.5 3.5v5h5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
  rematch:
    '<path d="M4 4l11 11M15 4L4 15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M13 17l4 4M7 17l-4 4M17.5 13.5l3 3M6.5 13.5l-3 3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  volume:
    '<path d="M4 9.5v5h3.5L13 19V5L7.5 9.5z" fill="currentColor"/><path d="M16 8.8a4.5 4.5 0 0 1 0 6.4M18.5 6.3a8 8 0 0 1 0 11.4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  mute:
    '<path d="M4 9.5v5h3.5L13 19V5L7.5 9.5z" fill="currentColor"/><path d="M16.5 9.5l5 5M21.5 9.5l-5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  hud:
    '<path d="M2 12s3.8-6.5 10-6.5S22 12 22 12s-3.8 6.5-10 6.5S2 12 2 12z" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="3" fill="currentColor"/>',
  feed:
    '<path d="M4 6.5h16M4 12h11M4 17.5h13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
  fullscreen:
    '<path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
  auto:
    '<path d="M8 8.2c-2.3 0-4 1.7-4 3.8s1.7 3.8 4 3.8c3.9 0 4.1-7.6 8-7.6 2.3 0 4 1.7 4 3.8s-1.7 3.8-4 3.8c-3.9 0-4.1-7.6-8-7.6z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
  link:
    '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
};

export type IconName = keyof typeof ICONS;
