// LOBBY MEMORIAL — flag-driven looks for `lobby_memorial` (helper for lobby.js, maps-A).
// CONTENT §4: Polaroids appear as each friend is taken (danny: ch1_danny_vanished, leah:
// ch2_leah_taken, marcus: ch6_marcus_taken), labelled in pencil when that friend is bonded and in
// ink when not; Tess's frame appears from ch7_started (0 answers: empty · 1: pencil sketch · ≥2: a
// developed photo).
//
// The engine copies prop params when a map loads, so instead of asking scripts to keep params in
// sync, the board is drawn by exactly one of a set of visual-only variants, each present only
// when memorialKey(state) matches. They are non-interactive (`interact: false`) and hidden in
// compact views (the board did not exist on Oct 19, 1979). The interactive boards
// (`lobby_memorial`, Ch1 script; `lobby_memorial_later`, examine) sit underneath at the same cell.
// Scripts only need to set the flags and call g.refresh().

const bonded = (s, id) => !!(s.bonds?.[id] || s.flags?.[`bond_${id}`]);

/** 'd l m t': each friend '-' (not taken) | 'p' (pencil) | 'i' (ink); t = '-' | '0' | '1' | '2'. */
export function memorialKey(s) {
  const f = s.flags || {};
  const pol = (taken, id) => (!taken ? '-' : bonded(s, id) ? 'p' : 'i');
  const t = f.ch7_started ? String(Math.min(2, Math.max(0, s.rollAnswered || 0))) : '-';
  return pol(f.ch1_danny_vanished, 'danny') + pol(f.ch2_leah_taken, 'leah') + pol(f.ch6_marcus_taken, 'marcus') + t;
}

const INK = { p: 'pencil', i: 'ink' };

/** All 108 looks of the board at (x, y), each gated on its key. */
export function memorialVariants(x, y) {
  const out = [];
  for (const d of '-pi') for (const l of '-pi') for (const m of '-pi') for (const t of '-012') {
    const key = d + l + m + t;
    const polaroids = {};
    if (d !== '-') polaroids.danny = INK[d];
    if (l !== '-') polaroids.leah = INK[l];
    if (m !== '-') polaroids.marcus = INK[m];
    const v = {
      id: `lobby_memorial_v_${key.replace(/-/g, 'x')}`, type: 'memorial_board', x, y,
      interact: false, hideInPast: true,
      cond: (s) => memorialKey(s) === key,
    };
    if (Object.keys(polaroids).length) v.polaroids = polaroids;
    if (t !== '-') v.tessFrame = Number(t);
    out.push(v);
  }
  return out;
}

/** Examine text for the board after Chapter 1, in Tess's voice, built from the same flags. */
export function memorialExamine(s) {
  const f = s.flags || {};
  const lines = [];
  if (!f.ch1_danny_vanished) return '[n] THE HOMECOMING NINE — FOREVER IN OUR HEARTS. Nine school pictures, gone the color of weak tea.';
  const who = [];
  const how = (id) => (bonded(s, id) ? 'in pencil' : 'in ink');
  if (f.ch1_danny_vanished) who.push(['Danny', how('danny')]);
  if (f.ch2_leah_taken) who.push(['Leah', how('leah')]);
  if (f.ch6_marcus_taken) who.push(['Marcus', how('marcus')]);
  if (who.length === 1) {
    lines.push('[n] THE HOMECOMING NINE. Nine school pictures, and pinned over the corner of them, a Polaroid.');
    lines.push(`[n] ${who[0][0]}. Under it, ${who[0][1]}: 1996.`);
  } else {
    lines.push('[n] THE HOMECOMING NINE. Nine school pictures, and pinned over them now, Polaroids.');
    lines.push(`[n] ${who.map(([n, h]) => `${n}, labelled ${h}`).join('. ')}. 1996, every one.`);
  }
  if (f.ch7_started) {
    const r = Math.min(2, s.rollAnswered || 0);
    lines.push('[n] Under them, a little frame. A typed card: THERESA DOLAN.');
    lines.push(r === 0 ? '[scared] It\'s empty. For now.'
      : r === 1 ? '[scared] There\'s a pencil sketch in it. A girl at a desk. It\'s me.'
        : '[terrified] There\'s a photo in it. Me, at a desk, head down. I never sat for that.');
  } else if (f.ch6_marcus_taken) {
    lines.push('[devastated] All three of them. Like they were always going to be up here.');
  } else {
    lines.push('[worried] Somebody took that picture tonight. Nobody had a Polaroid.');
  }
  return lines;
}
