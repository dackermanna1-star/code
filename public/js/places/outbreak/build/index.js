// Every kind of building, its size (picked per site) and how it's built.
// size(r, place) -> { w, d, yard?, o? } (o: extra settings stored on the site).
import { house, cottage, shed, barn } from './houses.js';
import { apartment, shop, supermarket, office, police, clinic, hospital, school, church, fireStation } from './civic.js';
import { garages, warehouse, factory, gas, silo } from './industrial.js';
import { barracks, hq, tower, tent, hangar, controlTower, bunker } from './military.js';
import { castle, lighthouse, radio } from './landmarks.js';

const between = (r, a, b) => a + r() * (b - a);
const step = (r, a, b, s = 2) => a + Math.round(r() * (b - a) / s) * s;
const yard = (r) => ({ front: between(r, 4, 8), back: between(r, 10, 22), side: between(r, 3, 9) });

export const TEMPLATES = {
  house1: { size: (r, p) => ({ w: step(r, 18, 24), d: step(r, 14, 18), yard: yard(r), o: { floors: 1, rural: p.kind !== 'city' } }), build: house },
  house2: { size: (r, p) => ({ w: step(r, 20, 26), d: step(r, 21, 25), yard: yard(r), o: { floors: 2, rural: p.kind === 'village' } }), build: house },
  cottage: { size: (r) => ({ w: step(r, 16, 20), d: step(r, 12, 15), yard: yard(r), o: { rural: true } }), build: cottage },
  shed: { size: (r) => ({ w: step(r, 8, 11), d: step(r, 7, 9) }), build: shed },
  barn: { size: (r) => ({ w: step(r, 24, 28), d: step(r, 34, 42) }), build: barn },
  apartment3: { size: (r) => ({ w: step(r, 38, 44), d: step(r, 22, 24), o: { floors: 3 } }), build: apartment },
  apartment5: { size: (r) => ({ w: step(r, 40, 46), d: step(r, 22, 24), o: { floors: r() < 0.5 ? 5 : 4 } }), build: apartment },
  shop: { size: (r) => ({ w: step(r, 22, 30), d: step(r, 18, 22), o: { shop: 'shop' } }), build: shop },
  bar: { size: (r) => ({ w: step(r, 20, 26), d: step(r, 18, 22), o: { shop: 'bar' } }), build: shop },
  pharmacy: { size: (r) => ({ w: step(r, 20, 24), d: step(r, 18, 20), o: { shop: 'pharmacy' } }), build: shop },
  supermarket: { size: () => ({ w: 52, d: 38 }), build: supermarket },
  office: { size: (r) => ({ w: step(r, 38, 46), d: 22, o: { floors: 3 } }), build: office },
  police: { size: () => ({ w: 44, d: 22, o: { floors: 2 } }), build: police },
  clinic: { size: () => ({ w: 40, d: 22, o: { floors: 1 } }), build: (K, s) => clinic(K, s) },
  hospital: { size: () => ({ w: 60, d: 24, o: { floors: 3 } }), build: hospital },
  school: { size: () => ({ w: 56, d: 26, o: { floors: 2 } }), build: school },
  church: { size: () => ({ w: 22, d: 44 }), build: church },
  fireStation: { size: () => ({ w: 42, d: 26 }), build: fireStation },
  garages: { size: (r) => ({ w: 11 * (3 + Math.floor(r() * 4)), d: 16 }), build: garages },
  warehouse: { size: (r) => ({ w: step(r, 44, 60, 4), d: step(r, 30, 36) }), build: warehouse },
  factory: { size: () => ({ w: 72, d: 40 }), build: factory },
  gas: { size: () => ({ w: 40, d: 34 }), build: gas },
  silo: { size: () => ({ w: 14, d: 14 }), build: silo },
  barracks: { size: () => ({ w: 52, d: 20 }), build: barracks },
  hq: { size: () => ({ w: 42, d: 22 }), build: hq },
  tower: { size: () => ({ w: 10, d: 10 }), build: tower },
  tent: { size: () => ({ w: 14, d: 20 }), build: tent },
  bunker: { size: () => ({ w: 12, d: 24 }), build: bunker },
  hangar: { size: () => ({ w: 64, d: 52 }), build: hangar },
  controlTower: { size: () => ({ w: 24, d: 24 }), build: controlTower },
  castle: { size: () => ({ w: 120, d: 100 }), build: castle },
  lighthouse: { size: () => ({ w: 16, d: 16 }), build: lighthouse },
  radio: { size: () => ({ w: 24, d: 44 }), build: radio },
};
