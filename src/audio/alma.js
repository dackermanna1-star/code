// "Hallowell Alma Mater" — original melody (stately hymn-waltz, 3/4, 16 bars), arr. for every
// version heard in the game (music box, warped 78, Leah's tape, piano, credits).
//
//   Hallowell, our Hallowell, upon the valley's breast,
//   where all thy children gather in, and none shall leave thy rest.
//   Hallowell, our Hallowell, we answer to thy call —
//   present, present, every one, and none shall leave at all.
//
// Pitches are semitones above the tonic (major key); durations in beats (quarter notes).
// Form: A (1–4) rises to the sixth and settles; A' (5–8) sequences a step higher to a half
// cadence; B (9–12) climbs to the high second over ii7–V7; A'' (13–16) answers home.

export const BEATS_PER_BAR = 3;
export const BARS = 16;

/** Melody per bar: [beatInBar, degree, durBeats]. */
export const MELODY_BARS = [
  [[0, 4, 2], [2, 2, 1]],               // 1  Hal- lo-
  [[0, 0, 1], [1, 4, 1], [2, 7, 1]],    // 2  well, our Hal-
  [[0, 9, 2], [2, 7, 1]],               // 3  lo- well, u-
  [[0, 4, 3]],                          // 4  pon…breast
  [[0, 5, 2], [2, 4, 1]],               // 5  where all
  [[0, 2, 1], [1, 5, 1], [2, 9, 1]],    // 6  thy chil-dren
  [[0, 7, 1.5], [1.5, 5, 0.5], [2, 2, 1]], // 7  gath- er in, and
  [[0, 7, 3]],                          // 8  …rest.
  [[0, 12, 2], [2, 11, 1]],             // 9  Hal- lo-
  [[0, 9, 1], [1, 7, 1], [2, 4, 1]],    // 10 well, our Hal-
  [[0, 5, 1], [1, 9, 1], [2, 12, 1]],   // 11 lo-well, we an-
  [[0, 14, 2], [2, 11, 1]],             // 12 swer to thy call —
  [[0, 12, 2], [2, 7, 1]],              // 13 pre- sent,
  [[0, 9, 1], [1, 5, 1], [2, 2, 1]],    // 14 pre-sent, ev-ery
  [[0, 4, 2], [2, 2, 1]],               // 15 one, and none
  [[0, 0, 3]],                          // 16 …at all.
];

// Chords (semitones above the tonic; first entry = bass/root).
const I = [0, 4, 7], I6 = [4, 7, 12], IV = [5, 9, 12], ii = [2, 5, 9], ii6 = [5, 9, 14];
const V7 = [7, 11, 14, 17], V = [7, 11, 14], ii7 = [2, 5, 9, 12], I64 = [7, 12, 16];

/** Harmony per bar: [[beatInBar, chord, durBeats], ...]. */
export const HARMONY_BARS = [
  [[0, I, 3]], [[0, I6, 3]], [[0, IV, 3]], [[0, I, 3]],
  [[0, ii, 3]], [[0, ii6, 3]], [[0, V7, 3]], [[0, V, 3]],
  [[0, IV, 3]], [[0, I6, 3]], [[0, ii7, 3]], [[0, V7, 3]],
  [[0, I, 3]], [[0, ii, 3]], [[0, I64, 2], [2, V7, 1]], [[0, I, 3]],
];

/** Chord tones of a chord as pitch classes (mod 12). */
export const pcs = (chord) => chord.map((x) => ((x % 12) + 12) % 12);

/** The nearest chord tone strictly below `deg` by at least `min` semitones (for a harmony line). */
export function below(deg, chord, min = 3) {
  const set = pcs(chord);
  for (let d = deg - min; d > deg - 13; d--) if (set.includes(((d % 12) + 12) % 12)) return d;
  return deg - 5;
}
