// Chapter registry (lazy-loaded modules).
export const CHAPTERS = [
  { id: 'c1m1_hotel', chapter: 1, name: 'Hotel', tagline: 'The last chopper just left without you.', blurb: 'Fight down through the burning hotel.', load: () => import('./c1m1_hotel.js') },
  { id: 'c1m2_streets', chapter: 2, name: 'Streets', tagline: 'Every store in town is closed. Except one.', blurb: 'Cross Savannah to the gun store.', load: () => import('./c1m2_streets.js') },
  { id: 'c1m3_mall', chapter: 3, name: 'Mall', tagline: 'Everything must go.', blurb: 'Through the dead mall to the atrium.', load: () => import('./c1m3_mall.js') },
  { id: 'c1m4_atrium', chapter: 4, name: 'Atrium', tagline: 'Fill her up.', blurb: 'Fuel the stock car and crash out.', load: () => import('./c1m4_atrium.js') },
];
export const TEST_CHAPTER = { id: 'test', chapter: 0, name: 'Test Arena', tagline: 'Systems check.', load: () => import('./test_arena.js') };
