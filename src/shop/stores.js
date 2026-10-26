// Virtual retailers. Items list the stores that sell them in `stores: [...]`.
export const STORES = {
  grubhop: {
    name: 'GrubHop', tagline: 'Restaurants, delivered hot', kind: 'food', color: '#06c167', color2: '#0b3d2a', logo: '🛵', unlock: 1,
    delivery: [8, 18], fee: 2.99, freeOver: 35, serviceFee: 0.08, app: 'GrubHop',
    restaurants: true,
  },
  dashr: {
    name: 'Dashr', tagline: 'Cafés, sweets & late-night cravings', kind: 'food', color: '#ff3008', color2: '#3d0a02', logo: '🏃', unlock: 2,
    delivery: [6, 14], fee: 1.99, freeOver: 25, serviceFee: 0.08,
    restaurants: true,
  },
  freshcart: {
    name: 'FreshCart', tagline: 'Groceries & essentials in minutes', kind: 'grocery', color: '#43b02a', color2: '#ff7009', logo: '🥕', unlock: 1,
    delivery: [10, 22], fee: 3.99, freeOver: 50, serviceFee: 0.05,
  },
  primo: {
    name: 'Primo', tagline: 'Everything. Delivered now.', kind: 'retail', color: '#232f3e', color2: '#ff9900', logo: '📦', unlock: 1,
    delivery: [12, 25], fee: 0, freeOver: 0, serviceFee: 0,
  },
  threadline: {
    name: 'Threadline', tagline: 'Fresh fits, zero lines', kind: 'retail', color: '#111111', color2: '#f2f2f2', logo: '🧵', unlock: 2,
    delivery: [14, 26], fee: 4.99, freeOver: 60, serviceFee: 0,
  },
  nestly: {
    name: 'Nestly', tagline: 'Furniture & decor for your nest', kind: 'retail', color: '#7f187f', color2: '#f7e9f7', logo: '🪺', unlock: 2,
    delivery: [18, 32], fee: 9.99, freeOver: 120, serviceFee: 0,
  },
  volt: {
    name: 'Volt', tagline: 'Tech, games & gadgets', kind: 'retail', color: '#0046be', color2: '#ffe000', logo: '⚡', unlock: 3,
    delivery: [14, 28], fee: 5.99, freeOver: 80, serviceFee: 0,
  },
  glow: {
    name: 'Glow', tagline: 'Beauty, bath & self-care', kind: 'retail', color: '#d4a5a5', color2: '#2b1d1d', logo: '🌸', unlock: 3,
    delivery: [12, 24], fee: 3.99, freeOver: 40, serviceFee: 0,
  },
  greenhouse: {
    name: 'Greenhouse', tagline: 'Plants that ship happy', kind: 'retail', color: '#2d6a4f', color2: '#d8f3dc', logo: '🌿', unlock: 3,
    delivery: [16, 30], fee: 6.99, freeOver: 70, serviceFee: 0,
  },
  arthaus: {
    name: 'ArtHaus', tagline: 'Prints, posters & art supplies', kind: 'retail', color: '#f4d35e', color2: '#1b1b1b', logo: '🖼️', unlock: 4,
    delivery: [14, 26], fee: 4.99, freeOver: 60, serviceFee: 0,
  },
  kollectiv: {
    name: 'Kollectiv', tagline: 'Blind boxes, figures & cards', kind: 'retail', color: '#ff6fb5', color2: '#2a0a1d', logo: '🧸', unlock: 4,
    delivery: [12, 24], fee: 3.99, freeOver: 50, serviceFee: 0,
  },
  stockpile: {
    name: 'Stockpile', tagline: 'The live market for sneakers & collectibles', kind: 'resale', color: '#006340', color2: '#e5f2ec', logo: '📈', unlock: 5,
    delivery: [20, 40], fee: 14.95, freeOver: 0, serviceFee: 0.06,
  },
  luxe: {
    name: 'Maison Luxe', tagline: 'Rare, refined, ridiculous', kind: 'retail', color: '#1c1a17', color2: '#c9a86a', logo: '💎', unlock: 7,
    delivery: [25, 45], fee: 0, freeOver: 0, serviceFee: 0,
  },
};

export const STORE_ORDER = ['grubhop', 'dashr', 'freshcart', 'primo', 'threadline', 'nestly', 'volt', 'glow', 'greenhouse', 'arthaus', 'kollectiv', 'stockpile', 'luxe'];

// Restaurants inside the food apps (items set `restaurant`)
export const RESTAURANTS = {
  smashbros: { name: 'Smash Bros. Burgers', store: 'grubhop', cuisine: 'Burgers', emoji: '🍔', color: '#e63946', rating: 4.7 },
  slicehouse: { name: 'Slice House Pizza', store: 'grubhop', cuisine: 'Pizza', emoji: '🍕', color: '#f4a261', rating: 4.6 },
  koisushi: { name: 'Koi Sushi Bar', store: 'grubhop', cuisine: 'Japanese', emoji: '🍣', color: '#264653', rating: 4.8 },
  noodlenook: { name: 'Noodle Nook', store: 'grubhop', cuisine: 'Ramen & Noodles', emoji: '🍜', color: '#9c2c2c', rating: 4.7 },
  tacoloco: { name: 'Taco Loco', store: 'grubhop', cuisine: 'Mexican', emoji: '🌮', color: '#2a9d8f', rating: 4.5 },
  greenbowl: { name: 'Green Bowl', store: 'grubhop', cuisine: 'Healthy', emoji: '🥗', color: '#52b788', rating: 4.6 },
  curryhouse: { name: 'Saffron Curry House', store: 'grubhop', cuisine: 'Indian', emoji: '🍛', color: '#e9a03b', rating: 4.8 },
  wokstar: { name: 'Wok Star', store: 'grubhop', cuisine: 'Chinese & Thai', emoji: '🥡', color: '#d62828', rating: 4.5 },
  cluckhut: { name: 'Cluck Hut', store: 'grubhop', cuisine: 'Fried Chicken', emoji: '🍗', color: '#f77f00', rating: 4.4 },
  sunnyside: { name: 'Sunny Side Diner', store: 'grubhop', cuisine: 'Breakfast', emoji: '🥞', color: '#ffb703', rating: 4.6 },
  beanery: { name: 'The Beanery', store: 'dashr', cuisine: 'Coffee', emoji: '☕', color: '#6f4e37', rating: 4.8 },
  bobabliss: { name: 'Boba Bliss', store: 'dashr', cuisine: 'Bubble Tea', emoji: '🧋', color: '#c08497', rating: 4.7 },
  glazed: { name: 'Glazed & Confused', store: 'dashr', cuisine: 'Donuts', emoji: '🍩', color: '#ff70a6', rating: 4.6 },
  scoops: { name: 'Big Scoops', store: 'dashr', cuisine: 'Ice Cream', emoji: '🍦', color: '#8ecae6', rating: 4.7 },
  crumb: { name: 'Crumb Bakery', store: 'dashr', cuisine: 'Bakery', emoji: '🥐', color: '#dda15e', rating: 4.8 },
  blendz: { name: 'Blendz', store: 'dashr', cuisine: 'Smoothies & Juice', emoji: '🥤', color: '#90be6d', rating: 4.5 },
  nightowl: { name: 'Night Owl Mart', store: 'dashr', cuisine: 'Convenience', emoji: '🏪', color: '#5a189a', rating: 4.3 },
};

export function storeUnlocked(id, level) { return (STORES[id]?.unlock || 1) <= level; }
