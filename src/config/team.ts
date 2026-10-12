// Hunter colours per player slot: parka (3D model) and UI colour (crosshair,
// names, radar). Player 1 keeps the original blue parka and crosshair blue.
export interface TeamColor {
  parka: number;
  parkaDeep: number;
  /** CSS colour for crosshairs, names and the radar. */
  ui: string;
}

export const TEAM_COLORS: TeamColor[] = [
  { parka: 0x1a8cff, parkaDeep: 0x0a62e2, ui: '#3b6bcb' },
  { parka: 0xe0443a, parkaDeep: 0xb02a26, ui: '#d8463c' },
  { parka: 0x35a852, parkaDeep: 0x1f7d39, ui: '#2f9e4a' },
  { parka: 0xf2a52a, parkaDeep: 0xc9790f, ui: '#d98e14' },
];

export function teamColor(playerId: number): TeamColor {
  return TEAM_COLORS[playerId % TEAM_COLORS.length];
}
