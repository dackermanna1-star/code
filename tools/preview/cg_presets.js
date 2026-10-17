// Frames shown per CG on the preview sheets.
export const CG_PRESETS = {
  title_bg: [{ t: 0.4, p: {} }, { t: 2.0, p: { lightning: 1 } }, { t: 2.1, p: { lightning: 0.5 } }, { t: 9.3, p: {} }],
  car_interior: [{ t: 0.3, p: {} }, { t: 0.62, p: {} }, { t: 1.2, p: {} }, { t: 3.3, p: {} }],
  register_book: [{ t: 0, p: {} }, { t: 1.7, p: {} }],
  breaker_reveal: [{ t: 0, p: {} }, { t: 2.3, p: {} }],
  ending_dawn: [
    { t: 0, p: { who: ['tess', 'danny', 'leah', 'marcus'], uniform: true } },
    { t: 3, p: { who: ['tess', 'leah'], uniform: false } },
    { t: 5, p: { who: ['tess'], uniform: false } },
    { t: 7, p: { who: ['danny', 'marcus', 'tess'], uniform: false } },
  ],
  ending_present: [{ t: 0, p: {} }, { t: 3.3, p: {} }],
  ending_truant: [{ t: 0, p: {} }, { t: 2.4, p: {} }],
  coda_2013: [{ t: 0, p: {} }, { t: 0.9, p: {} }],
};
