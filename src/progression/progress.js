// Money, lifestyle XP & levels, daily challenges and long-term achievements.
import { G } from '../game.js';
import { pick, fmtMoney } from '../core/utils.js';
import { queueSave } from '../core/state.js';

// ------------------------------------------------------------------ wallet
export class Wallet {
  get money() { return G.state.money; }
  canAfford(n) { return G.state.money >= n - 1e-6; }
  _tx(amount, label, kind) {
    const list = (G.state.transactions ||= []);
    list.unshift({ amount, label, kind, t: G.clock.total });
    if (list.length > 150) list.length = 150;
  }
  spend(n, label = 'Purchase') {
    if (!this.canAfford(n)) return false;
    G.state.money = Math.round((G.state.money - n) * 100) / 100;
    G.state.stats.spent += n;
    this._tx(-n, label, 'spend');
    G.events.emit('money', -n);
    queueSave();
    return true;
  }
  earn(n, label = 'Income', { quiet = false } = {}) {
    n = Math.round(n * 100) / 100;
    G.state.money = Math.round((G.state.money + n) * 100) / 100;
    G.state.stats.earned += n;
    this._tx(n, label, 'earn');
    G.events.emit('money', n);
    if (!quiet) { G.ui.toast(`+${fmtMoney(n)} · ${label}`, { icon: '💵', kind: 'money' }); G.audio.play('cash'); }
    queueSave();
  }
}

// ------------------------------------------------------------------ levels
export const LEVELS = [0, 120, 320, 650, 1100, 1700, 2500, 3500, 4800, 6400, 8500, 11000, 14000, 17500, 21500, 26000, 31000, 37000, 44000, 52000];
export const LEVEL_TITLES = ['New in Town', 'Homebody', 'Couch Connoisseur', 'Delivery Regular', 'Indoor Enthusiast', 'Nest Builder', 'Cozy Curator', 'Apartment Aficionado', 'Lifestyle Guru', 'Hermit Royalty', 'Legend of 24F', 'Indoor Icon', 'Comfort Sage', 'The Final Homebody', 'Mythical Homebody', 'Transcendent', 'Ascended', 'Infinite Cozy', 'Peak Homebody', 'The Apartment Itself'];

export function levelProgress() {
  const lv = G.state.level;
  const cur = LEVELS[lv - 1] ?? 0, next = LEVELS[lv] ?? cur + 10000;
  return { level: lv, xp: G.state.xp, cur, next, frac: (G.state.xp - cur) / (next - cur), title: LEVEL_TITLES[lv - 1] || 'Homebody' };
}

export function addXP(n, reason = '') {
  G.state.xp += Math.round(n);
  G.ui.xpPopup?.(Math.round(n), reason);
  while (G.state.level < LEVELS.length && G.state.xp >= LEVELS[G.state.level]) {
    G.state.level++;
    G.audio.play('levelup');
    G.particles.confetti(G.camera.position.clone().add(G.camera.getWorldDirection(G.camera.position.clone()).multiplyScalar(1.2)), 50);
    G.ui.levelUp?.(G.state.level);
    G.events.emit('levelUp', G.state.level);
  }
  G.events.emit('xp');
}

// ------------------------------------------------------------------ challenges & achievements
// Daily challenge templates. ev: 'act' type; test(data) optional; n: target count
const DAILY = [
  { id: 'eat3', text: 'Eat 3 meals or snacks', ev: 'eat', n: 3, money: 45, xp: 40, icon: '🍽️' },
  { id: 'sweet', text: 'Eat something sweet', ev: 'eat', test: (d) => d.sweet, n: 1, money: 30, xp: 30, icon: '🍩' },
  { id: 'healthy', text: 'Eat something healthy', ev: 'eat', test: (d) => d.healthy, n: 1, money: 35, xp: 35, icon: '🥗' },
  { id: 'homecook', text: 'Cook a homemade meal', ev: 'cook', n: 1, money: 60, xp: 60, icon: '🍳' },
  { id: 'drink2', text: 'Finish 2 drinks', ev: 'drink', n: 2, money: 25, xp: 25, icon: '🥤' },
  { id: 'coffee', text: 'Have a caffeinated drink', ev: 'drink', test: (d) => d.caffeine, n: 1, money: 25, xp: 25, icon: '☕' },
  { id: 'shower', text: 'Take a shower or a bath', ev: ['shower', 'bath'], n: 1, money: 30, xp: 30, icon: '🚿' },
  { id: 'teeth', text: 'Brush your teeth', ev: 'brushTeeth', n: 1, money: 25, xp: 25, icon: '🪥' },
  { id: 'order2', text: 'Order from 2 different stores', ev: 'order', unique: 'store', n: 2, money: 50, xp: 50, icon: '🛍️' },
  { id: 'unbox3', text: 'Unbox 3 deliveries', ev: 'unbox', n: 3, money: 40, xp: 45, icon: '📦' },
  { id: 'place3', text: 'Place or move 3 items', ev: 'place', n: 3, money: 40, xp: 40, icon: '🪴' },
  { id: 'wall', text: 'Hang something on a wall', ev: 'place', test: (d) => d.wall, n: 1, money: 40, xp: 40, icon: '🖼️' },
  { id: 'play10', text: 'Play with 10 toys or fidgets', ev: 'play', n: 10, money: 45, xp: 45, icon: '🪀' },
  { id: 'game', text: 'Play a video game', ev: 'gameOver', n: 1, money: 40, xp: 40, icon: '🎮' },
  { id: 'gig', text: 'Finish a freelance gig', ev: 'gig', n: 1, money: 50, xp: 50, icon: '💼' },
  { id: 'gig3', text: 'Finish 3 freelance gigs', ev: 'gig', n: 3, money: 90, xp: 90, icon: '💼' },
  { id: 'read', text: 'Read 10 pages', ev: 'readPage', n: 10, money: 35, xp: 40, icon: '📖' },
  { id: 'tv', text: 'Watch 2 minutes of TV', ev: 'watchTV', n: 60, money: 25, xp: 25, icon: '📺' },
  { id: 'music', text: 'Put on some music', ev: 'music', n: 1, money: 20, xp: 20, icon: '🎵' },
  { id: 'water', text: 'Water a plant', ev: 'water', n: 1, money: 30, xp: 30, icon: '🪴' },
  { id: 'nap', text: 'Take a nap or sleep', ev: 'sleep', n: 1, money: 30, xp: 30, icon: '😴' },
  { id: 'outfit', text: 'Change your outfit', ev: 'wear', n: 2, money: 30, xp: 30, icon: '👕' },
  { id: 'mirror', text: 'Check your fit in a mirror', ev: 'mirror', n: 1, money: 20, xp: 20, icon: '🪞' },
  { id: 'recycle', text: 'Recycle 3 things', ev: 'recycle', n: 3, money: 30, xp: 30, icon: '♻️' },
  { id: 'throw', text: 'Throw something across the room', ev: 'throw', n: 1, money: 15, xp: 15, icon: '🫳' },
  { id: 'photo', text: 'Take a photo', ev: ['photo', 'selfie'], n: 1, money: 25, xp: 25, icon: '📸' },
  { id: 'reply', text: 'Reply to a message', ev: 'reply', n: 1, money: 20, xp: 25, icon: '💬' },
  { id: 'sell', text: 'Sell something on Stockpile', ev: 'sell', n: 1, money: 40, xp: 40, icon: '📈' },
  { id: 'selfcare', text: 'Do 2 self-care things', ev: ['selfcare', 'spray', 'bath', 'meditate'], n: 2, money: 35, xp: 35, icon: '💆' },
  { id: 'lights', text: 'Set the mood with lighting', ev: ['lamp', 'candle', 'lightSwitch', 'projector'], n: 3, money: 20, xp: 20, icon: '💡' },
];

export const ACHIEVEMENTS = [
  { id: 'first_order', text: 'First Order', desc: 'Place your first delivery order', icon: '🛵', test: (s) => s.stats.ordersPlaced >= 1, money: 50, xp: 50 },
  { id: 'orders25', text: 'Delivery VIP', desc: 'Place 25 orders', icon: '🏍️', test: (s) => s.stats.ordersPlaced >= 25, money: 250, xp: 250 },
  { id: 'unbox10', text: 'Unboxing Channel', desc: 'Open 10 packages', icon: '📦', test: (s) => (s.goals.counters.unbox || 0) >= 10, money: 100, xp: 120 },
  { id: 'foodie10', text: 'Foodie', desc: 'Taste 10 different foods', icon: '🍜', test: (s) => uniq(s, 'eat') >= 10, money: 120, xp: 150 },
  { id: 'foodie30', text: 'Gourmand', desc: 'Taste 30 different foods & drinks', icon: '🍱', test: (s) => uniq(s, 'eat') + uniq(s, 'drink') >= 30, money: 400, xp: 400 },
  { id: 'chef5', text: 'Home Chef', desc: 'Cook 5 homemade meals', icon: '👨‍🍳', test: (s) => (s.goals.counters.cook || 0) >= 5, money: 150, xp: 200 },
  { id: 'decor10', text: 'Interior Designer', desc: 'Place 10 decorations', icon: '🖼️', test: (s) => s.stats.itemsPlaced >= 10, money: 120, xp: 150 },
  { id: 'decor50', text: 'Magazine Worthy', desc: 'Place 50 items', icon: '🏡', test: (s) => s.stats.itemsPlaced >= 50, money: 400, xp: 500 },
  { id: 'gallery', text: 'Gallery Wall', desc: 'Have 6 pieces of art on your walls', icon: '🎨', test: () => G.items.all().filter((i) => i.data.loc === 'world' && i.def.place === 'wall').length >= 6, money: 200, xp: 250 },
  { id: 'jungle', text: 'Urban Jungle', desc: 'Have 8 plants placed', icon: '🌿', test: () => G.items.all().filter((i) => i.data.loc === 'world' && i.def.category === 'plants').length >= 8, money: 200, xp: 250 },
  { id: 'sneakers5', text: 'Sneakerhead', desc: 'Own 5 pairs of sneakers', icon: '👟', test: () => G.items.owned().filter((i) => i.def.category === 'shoes').length >= 5, money: 200, xp: 250 },
  { id: 'closet20', text: 'Fashionista', desc: 'Own 20 clothing items', icon: '👗', test: () => G.items.owned().filter((i) => i.def.use?.type === 'wear').length >= 20, money: 300, xp: 300 },
  { id: 'gamer', text: 'Gamer', desc: 'Own 5 video games', icon: '🕹️', test: (s) => s.games.length >= 5, money: 150, xp: 200 },
  { id: 'highscore', text: 'High Scorer', desc: 'Score 1,000+ in any game', icon: '🏆', test: (s) => Object.values(s.flags.highscores || {}).some((v) => v >= 1000), money: 100, xp: 150 },
  { id: 'gigs10', text: 'Remote Worker', desc: 'Complete 10 freelance gigs', icon: '💼', test: (s) => s.stats.gigs >= 10, money: 300, xp: 300 },
  { id: 'rich', text: 'Comfortable', desc: 'Have $5,000 in the bank', icon: '💰', test: (s) => s.money >= 5000, money: 0, xp: 300 },
  { id: 'reader', text: 'Bookworm', desc: 'Finish 3 books', icon: '📚', test: (s) => (s.goals.counters.finishBook || 0) >= 3, money: 150, xp: 200 },
  { id: 'collector', text: 'Collector', desc: 'Open 10 blind boxes', icon: '🎁', test: (s) => s.stats.boxesOpened >= 10, money: 200, xp: 250 },
  { id: 'legendary', text: 'Legendary Pull', desc: 'Pull a legendary from a blind box or card pack', icon: '🌟', test: (s) => !!s.flags.legendaryPull, money: 300, xp: 300 },
  { id: 'clean', text: 'Squeaky Clean', desc: 'Shower 10 times', icon: '🛁', test: (s) => s.stats.showers >= 10, money: 100, xp: 120 },
  { id: 'week', text: 'One Week In', desc: 'Reach day 7', icon: '📅', test: () => G.clock.day >= 7, money: 300, xp: 300 },
  { id: 'nightowl', text: 'Night Owl', desc: 'Be awake at 3 AM', icon: '🦉', test: () => Math.floor(G.clock.hour) === 3, money: 50, xp: 60 },
  { id: 'artist', text: 'Artist', desc: 'Paint your own artwork', icon: '🖌️', test: (s) => (s.goals.counters.paint || 0) >= 1, money: 120, xp: 150 },
  { id: 'musician', text: 'Musician', desc: 'Practice an instrument 5 times', icon: '🎸', test: (s) => (s.goals.counters.practice || 0) >= 5, money: 150, xp: 150 },
  { id: 'flipper', text: 'Flipper', desc: 'Sell 5 items on Stockpile', icon: '📈', test: (s) => (s.goals.counters.sell || 0) >= 5, money: 200, xp: 200 },
  { id: 'cards50', text: 'Card Shark', desc: 'Collect 50 trading cards', icon: '🃏', test: (s) => Object.values(s.collection.cards || {}).reduce((a, b) => a + b, 0) >= 50, money: 200, xp: 250 },
  { id: 'daily10', text: 'Routine Builder', desc: 'Complete 10 daily challenges', icon: '✅', test: (s) => (s.goals.counters.dailyDone || 0) >= 10, money: 250, xp: 300 },
  { id: 'level5', text: 'Settled In', desc: 'Reach lifestyle level 5', icon: '⭐', test: (s) => s.level >= 5, money: 300, xp: 0 },
];
function uniq(s, ev) { return Object.keys(s.goals.counters['u_' + ev] || {}).length; }

export class Goals {
  constructor() {
    G.events.on('act', (type, data = {}) => this.onAct(type, data));
    G.events.on('newDay', () => this.rollDaily());
    G.events.on('money', () => this.checkAchievements());
    G.events.on('levelUp', () => this.checkAchievements());
    this._acc = 0;
  }
  get st() { return G.state.goals; }

  rollDaily(force = false) {
    if (!force && this.st.dailyDay === G.clock.day && this.st.daily.length) return;
    this.st.dailyDay = G.clock.day;
    const pool = [...DAILY];
    const picks = [];
    while (picks.length < 3 && pool.length) { const i = Math.floor(Math.random() * pool.length); picks.push(pool.splice(i, 1)[0]); }
    this.st.daily = picks.map((d) => ({ id: d.id, progress: 0, done: false, seen: [] }));
    G.events.emit('goals');
    if (G.started && G.clock.day > 1) G.ui.toast('New daily challenges are up!', { icon: '📋' });
  }

  dailyDefs() { return this.st.daily.map((d) => ({ ...DAILY.find((x) => x.id === d.id), state: d })).filter((d) => d.text); }

  onAct(type, data) {
    const c = this.st.counters;
    c[type] = (c[type] || 0) + (type === 'watchTV' ? 2 : 1);
    if (data.item) { const u = (c['u_' + type] ||= {}); u[data.item] = 1; }
    // XP for activities (first time doing something gives more)
    const firstKey = 'first_' + type;
    if (!G.state.flags[firstKey] && !['readPage', 'watchTV', 'play', 'lightSwitch'].includes(type)) { G.state.flags[firstKey] = true; addXP(15, 'New experience'); }
    const xpMap = { eat: 3, drink: 2, cook: 12, shower: 6, bath: 10, place: 3, unbox: 5, finishBook: 30, gig: 0, workout: 8, meditate: 8, paint: 30, practice: 6, projectDone: 40, blindbox: 4, cardpack: 4, journal: 6, water: 3, sleep: 6, solveCube: 25 };
    if (xpMap[type]) addXP(xpMap[type]);
    if (type === 'blindbox' && data.rarity === 'legendary') G.state.flags.legendaryPull = true;
    if (type === 'cardpack' && data.pulls?.includes('legendary')) G.state.flags.legendaryPull = true;
    // daily progress
    for (const d of this.dailyDefs()) {
      const s = d.state;
      if (s.done) continue;
      const evs = Array.isArray(d.ev) ? d.ev : [d.ev];
      if (!evs.includes(type)) continue;
      if (d.test && !d.test(data)) continue;
      if (d.unique) { const key = data[d.unique]; if (s.seen.includes(key)) continue; s.seen.push(key); }
      s.progress += type === 'watchTV' ? 2 : 1;
      if (s.progress >= d.n) {
        s.done = true;
        c.dailyDone = (c.dailyDone || 0) + 1;
        G.audio.play('success');
        G.ui.toast(`Challenge complete: ${d.text}`, { icon: d.icon || '✅', kind: 'good', duration: 3.5 });
        G.wallet.earn(d.money, 'Daily challenge', { quiet: true });
        addXP(d.xp, 'Challenge');
        if (this.st.daily.every((x) => x.done)) { G.ui.toast('All daily challenges done! Bonus +$75', { icon: '🌟', kind: 'good' }); G.wallet.earn(75, 'Daily bonus', { quiet: true }); addXP(60, 'Daily bonus'); }
      }
      G.events.emit('goals');
    }
    this.checkAchievements();
    G.messages?.onAct?.(type, data);
  }

  checkAchievements() {
    const done = this.st.done;
    for (const a of ACHIEVEMENTS) {
      if (done[a.id]) continue;
      let ok = false;
      try { ok = a.test(G.state); } catch { ok = false; }
      if (ok) {
        done[a.id] = G.clock.total;
        G.audio.play('reveal');
        G.ui.achievement?.(a);
        if (a.money) G.wallet.earn(a.money, `Achievement: ${a.text}`, { quiet: true });
        if (a.xp) addXP(a.xp, 'Achievement');
        G.events.emit('goals');
      }
    }
  }

  update(dt) {
    this._acc += dt;
    if (this._acc > 10) { this._acc = 0; this.checkAchievements(); }
  }
}
export { pick };
