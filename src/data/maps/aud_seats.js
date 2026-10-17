// AUD SEATS — the house of the auditorium (helper for aud.js, maps-A). CONTENT §2.11, DESIGN §6 VII.
//
// 8 rows × 2 banks of 13 folding seats, all facing the stage (`dir: 'up'`). Row 1 is the front
// row (y 16), row 8 the back (y 30); a walkway row between each pair of seat rows. Every seat
// carries `row` (1..8, the Assembly system fires roll call #3 on the first sit in rows 1–4) and
// `bank` ('w' | 'e').
//
// Chart legend
//   h  a husk (≈ 70% of the house): state 'occupied' with an `occupant` husk_a..f (little ones up
//      front, older at the back), present from Chapter 7 while !husks_gone; an empty twin `<id>_e`
//      stands in otherwise (DISMISSED: the ending script crumbles them, then sets husks_gone +
//      g.refresh()).
//   t  a husk whose head has turned around toward the doors (occupant '...:turned'); examinable.
//   .  an empty seat (hide spot) — every aisle/walkway tile is within 2 tiles of one.
//   D L M  the friends' seats (empty; scripts seat Danny / Leah / Marcus on them):
//          aud_seat_danny, aud_seat_leah, aud_seat_marcus.
//   N  Denise's husk beside Marcus: aud_seat_denise (occupied, occupant husk_e).
//   1 2 3  the empty seat beside Danny / Leah / Marcus (Tess's front-row seats):
//          aud_seat_beside_danny / _leah / _marcus, with `front: '<friend>'` (→ ch7.front_<friend>).
//   Ids otherwise: aud_seat_<row>_<x>.

export const HUSKS = (s) => (s.chapter || 0) >= 7 && !s.flags.husks_gone;

//   row  y    west bank x 8–20   east bank x 23–35
const CHART = [
  [1, 16, '.hD1hh.hhL2h.', '.hhNM3hh.hhh.'],
  [2, 18, 'h.hhh.hhhh.hh', 'hhh.hhhh.hh.h'],
  [3, 20, '.hhhh.hhh.hh.', 'hh.hhh.hhh.h.'],
  [4, 22, 'hh.hhh.hhhh.h', 'h.hhhh.hh.hhh'],
  [5, 24, '.hhh.hhhh.hhh', '.hhh.hhh.hhh.'],
  [6, 26, 'hhh.thhh.hh.h', 'h.hhth.hhh.hh'],
  [7, 28, '.hhhh.hht.hh.', 'hh.hhh.hh.th.'],
  [8, 30, '.hh.hhh.hh.h.', '.hh.hh.hhh.h.'],
];
const BANKS = [['w', 8, 2], ['e', 23, 3]];         // [bank, first x, chart column]
const SIZES = { 1: 'abc', 2: 'abc', 3: 'abcd', 4: 'bcde', 5: 'bcde', 6: 'cdef', 7: 'cdef', 8: 'def' };
const FRIEND = { D: 'danny', L: 'leah', M: 'marcus' };
const BESIDE = { 1: 'danny', 2: 'leah', 3: 'marcus' };

const TURNED_EXAMINE = [
  '[n] A husk, sitting up straight like the others. Except its head is turned all the way around, toward the doors.',
  '[terrified] Toward me. It wasn\'t like that when I came in.',
];

function hash(row, x) {
  let h = Math.imul(row * 73 + 11, 2654435761) ^ Math.imul(x * 131 + 7, 40503);
  h ^= h >>> 15;
  return (h >>> 0) % 997;
}

/** The seat props for aud.js `objects`. */
export function audSeats() {
  const out = [];
  for (const row of CHART) {
    const [r, y] = row;
    for (const [bank, x0, col] of BANKS) {
      [...row[col]].forEach((ch, i) => {
        const x = x0 + i;
        const base = { type: 'aud_seat', x, y, dir: 'up', row: r, bank };
        const id = `aud_seat_${r}_${x}`;
        if (ch === '.') out.push({ ...base, id });
        else if (ch === 'h' || ch === 't') {
          const sizes = SIZES[r];
          const occupant = `husk_${sizes[hash(r, x) % sizes.length]}${ch === 't' ? ':turned' : ''}`;
          const husk = { ...base, id, state: 'occupied', occupant, cond: HUSKS };
          if (ch === 't') husk.examine = TURNED_EXAMINE;
          out.push(husk, { ...base, id: `${id}_e`, cond: (s) => !HUSKS(s) });
        } else if (FRIEND[ch]) {
          out.push({ ...base, id: `aud_seat_${FRIEND[ch]}`, friend: FRIEND[ch] });
        } else if (ch === 'N') {
          out.push({ ...base, id: 'aud_seat_denise', state: 'occupied', occupant: 'husk_e', cond: HUSKS },
            { ...base, id: 'aud_seat_denise_e', cond: (s) => !HUSKS(s) });
        } else if (BESIDE[ch]) {
          out.push({ ...base, id: `aud_seat_beside_${BESIDE[ch]}`, front: BESIDE[ch] });
        }
      });
    }
  }
  return out;
}
