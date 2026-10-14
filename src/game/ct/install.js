// Appends the Chinatown tables (ct/info.js) to DOOM's (info.js). tables.js
// imports this first, so the additions are in place before it compiles the
// tables into index maps and typed arrays. Every original index is
// unchanged; tools/check-info.mjs imports info.js alone and still sees the
// original tables.

import { SPRNAMES, STATE_DEFS, MOBJ_DEFS, SFX_DEFS } from '../info.js';
import { CT_SPRNAMES, CT_STATE_DEFS, CT_MOBJ_DEFS, CT_SFX_DEFS } from './info.js';

function append(list, extra, key) {
  const have = new Set(list.map(key));
  for (const e of extra) if (!have.has(key(e))) list.push(e);
}

append(SPRNAMES, CT_SPRNAMES, (n) => n);
append(STATE_DEFS, CT_STATE_DEFS, (s) => s[0]);
append(MOBJ_DEFS, CT_MOBJ_DEFS, (m) => m.name);
append(SFX_DEFS, CT_SFX_DEFS, (s) => s.name);
