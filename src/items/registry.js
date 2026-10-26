// Item definition registry. Catalogue files call defineItems([...]).
//
// Item definition fields:
//   id, name, category, price, desc, stores: [storeId], rarity, tags: [],
//   build(def): THREE.Object3D   (origin at bottom-center; wall items: back-center, facing +z)
//   use: { type, ... }           behavior config (see items/behaviors)
//   place: 'surface' | 'floor' | 'wall'  (auto-detected if omitted)
//   furniture: bool              too big to hold -> moved with placement mode (auto if > ~0.95m)
//   hold: { pos, rot, scale }    optional view-model override
//   brand, emoji (shop fallback icon), season, limited, unlockLevel, packaging
import * as THREE from 'three';
import { localBox } from '../core/utils.js';

export const ITEMS = {};
export const CATEGORIES = {
  food: { label: 'Food', icon: '🍔' },
  drink: { label: 'Drinks', icon: '🥤' },
  grocery: { label: 'Groceries', icon: '🥕' },
  clothing: { label: 'Clothing', icon: '👕' },
  shoes: { label: 'Shoes', icon: '👟' },
  accessories: { label: 'Accessories', icon: '🧢' },
  hygiene: { label: 'Bath & Beauty', icon: '🧴' },
  electronics: { label: 'Electronics', icon: '📺' },
  games: { label: 'Video Games', icon: '🎮' },
  furniture: { label: 'Furniture', icon: '🛋️' },
  decor: { label: 'Decor', icon: '🪴' },
  art: { label: 'Wall Art', icon: '🖼️' },
  lighting: { label: 'Lighting', icon: '💡' },
  plants: { label: 'Plants', icon: '🌿' },
  toys: { label: 'Toys & Fun', icon: '🪀' },
  collectibles: { label: 'Collectibles', icon: '🏆' },
  books: { label: 'Books & Media', icon: '📚' },
  hobby: { label: 'Hobbies', icon: '🎨' },
  kitchen: { label: 'Kitchenware', icon: '🍳' },
  package: { label: 'Packages', icon: '📦' },
  misc: { label: 'Misc', icon: '✨' },
};

export const RARITY = {
  common: { label: 'Common', color: '#9aa3ad', weight: 60 },
  uncommon: { label: 'Uncommon', color: '#4caf7a', weight: 25 },
  rare: { label: 'Rare', color: '#3d8bfd', weight: 10 },
  epic: { label: 'Epic', color: '#a259ff', weight: 4 },
  legendary: { label: 'Legendary', color: '#ffb020', weight: 1 },
};

export function defineItem(def) {
  if (!def.id || !def.build) throw new Error('item needs id and build: ' + def.id);
  if (ITEMS[def.id]) console.warn('duplicate item id', def.id);
  def.name ||= def.id;
  def.category ||= 'misc';
  def.price ??= 10;
  def.rarity ||= 'common';
  def.tags ||= [];
  def.stores ||= [];
  def.desc ||= '';
  ITEMS[def.id] = def;
  return def;
}
export function defineItems(list) { list.forEach(defineItem); }
export function getDef(id) { return ITEMS[id]; }

// Lazily measured bounds of a definition's model.
const tmpObjects = new Map();
export function defBounds(def) {
  if (def._bounds) return def._bounds;
  const obj = def.build(def, def.thumbState ? def.thumbState() : {});
  const box = localBox(obj);
  if (box.isEmpty()) box.set(new THREE.Vector3(-0.05, 0, -0.05), new THREE.Vector3(0.05, 0.1, 0.05));
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  def._bounds = { box, size, center, max: Math.max(size.x, size.y, size.z) };
  if (def.furniture === undefined) def.furniture = def.place === 'floor' || (def.place !== 'wall' && (size.x > 0.95 || size.y > 1.1 || size.z > 0.95));
  if (!def.place) def.place = def.furniture ? 'floor' : 'surface';
  tmpObjects.set(def.id, obj); // reuse for the first instance
  return def._bounds;
}
export function takePrebuilt(def) {
  const o = tmpObjects.get(def.id);
  if (o) { tmpObjects.delete(def.id); return o; }
  return null;
}
