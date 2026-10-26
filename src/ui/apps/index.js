// App registry shared by the phone and the computer.
import { store, product, cart, confirm } from './shop.js';
import { orders, messages, wallet, goals, home, music, weather, storage, collection, camera, photos, gigs, settings } from './misc.js';

export const APPS = { store, product, cart, confirm, orders, messages, wallet, goals, home, music, weather, storage, collection, camera, photos, gigs, settings };
export function registerApp(id, app) { APPS[id] = app; }
