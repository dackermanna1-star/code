// Minimal line icons (24×24, stroke = currentColor) for the tool hotbar.

import type { ToolId } from "../core/context.ts";

const PATHS: Readonly<Record<ToolId, string>> = {
  // clenched fist
  hands:
    '<path d="M6.5 10.5V8.2a1.6 1.6 0 0 1 3.2 0v1.6M9.7 9.4V7.4a1.6 1.6 0 0 1 3.2 0v2M12.9 9.4V7.8a1.6 1.6 0 0 1 3.2 0v2.2M16.1 10v-.6a1.6 1.6 0 0 1 3.2 0V14a6 6 0 0 1-6 6h-1.6a5.7 5.7 0 0 1-4.6-2.4L4.6 14a1.7 1.7 0 0 1 2.6-2.2l1.3 1.4"/>',
  // claw hammer
  hammer: '<path d="M14.2 9.8 4.6 19.4a1.5 1.5 0 0 0 2.1 2.1l9.6-9.6"/><path d="m11.6 7.2 5.2 5.2 2.6-2.6-1.3-1.3 1.7-1.7-1.3-1.3-1.7 1.7-2.6-2.6c-1.6-1.2-3.5-1-4.6.1Z"/>',
  // sledgehammer
  sledgehammer: '<path d="M13.2 10.8 3.8 20.2"/><rect x="11.2" y="2.6" width="6.2" height="10.2" rx="0.8" transform="rotate(45 14.3 7.7)"/>',
  // crowbar
  crowbar: '<path d="M5 20.5 17.6 7.9c.9-.9 1-2.4.1-3.3a2.4 2.4 0 0 0-3.4 0"/><path d="M5 20.5l-1.2-2.6"/>',
  // baseball bat
  bat: '<path d="M4.2 20.6 3.4 19.8l1.6-1.6.8.8Z"/><path d="m5.4 18.4 9.2-9.2c1.5-1.5 3.2-3.7 4.3-4.8a1.8 1.8 0 0 1 2.5 2.5c-1.1 1.1-3.3 2.8-4.8 4.3l-9.2 9.2"/>',
  // axe
  axe: '<path d="M14.5 9.5 4 20"/><path d="M12.6 7.6c2.2-2.2 3.6-3.5 6.4-4.1-.3 3-1.7 4.6-4.1 7l-2.6-2.6Z"/><path d="m13.8 4.6 5.6 5.6"/>',
  // fire extinguisher
  extinguisher:
    '<rect x="8" y="8" width="7" height="13" rx="3"/><path d="M11.5 8V5.5M9 5.5h6M15 5.5l3.5-1.5M11.5 3v2.5"/><path d="M8.5 13h6"/>',
};

export function toolIcon(id: ToolId): string {
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${PATHS[id] ?? PATHS.hands}</svg>`;
}

export const TOOL_NAMES: Readonly<Record<ToolId, string>> = {
  hands: "Fists",
  hammer: "Claw Hammer",
  sledgehammer: "Sledgehammer",
  crowbar: "Crowbar",
  bat: "Baseball Bat",
  axe: "Axe",
  extinguisher: "Extinguisher",
};

/** Short hotbar labels (the full name pops up above the hotbar when switching). */
export const TOOL_SHORT: Readonly<Record<ToolId, string>> = {
  hands: "Fists",
  hammer: "Hammer",
  sledgehammer: "Sledge",
  crowbar: "Crowbar",
  bat: "Bat",
  axe: "Axe",
  extinguisher: "Fire Ext.",
};
