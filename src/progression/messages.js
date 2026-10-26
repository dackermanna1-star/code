// Text messages from friends, family & neighbors. Conversations are picked
// based on time, weather and what you've been up to; replies matter a little.
import { G } from '../game.js';
import { pick, rand } from '../core/utils.js';

export const CONTACTS = {
  mom: { name: 'Mom', avatar: '👩‍🦰', color: '#ff8fab' },
  jules: { name: 'Jules', avatar: '🧑‍🎤', color: '#7b5cff' },
  bea: { name: 'Bea (2404)', avatar: '🐈', color: '#f4a261' },
  patel: { name: 'Mr. Patel · Building', avatar: '🏢', color: '#457b9d' },
  sam: { name: 'Sam from work', avatar: '🧑‍💻', color: '#2a9d8f' },
  grandpa: { name: 'Grandpa Lou', avatar: '👴', color: '#8d6e63' },
};

// cond(state) -> bool ; effect keys: money, buff, xp, item
const CONVOS = [
  { id: 'mom_welcome', who: 'mom', event: 'welcome', text: ['Sweetie!! Your first day in the new place 🏡', 'I\'m so proud of you. Did the building leave you a welcome gift?', 'Sending a little housewarming money. Buy something cozy!'], replies: [
    { label: 'Thank you mom!! ❤️', reply: 'Love you! Eat something real today 🥦', money: 100 },
    { label: 'Already shopping 👀', reply: 'Of course you are 😂 Love you!', money: 100 },
  ] },
  { id: 'mom_breakfast', who: 'mom', when: (h) => h >= 7 && h < 11, text: ['Morning sweetie! ☀️', 'Did you eat breakfast?'], replies: [
    { label: 'Yes mom 🙄', reply: 'Good! Love you 💕' },
    { label: '…not yet', reply: 'Eat something healthy please! Sending you $20 for groceries 🥦', money: 20 },
  ] },
  { id: 'mom_call', who: 'mom', when: (h) => h >= 17 && h < 21, text: ['Your father figured out video calls', 'He has been staring at his own face for 20 minutes'], replies: [
    { label: 'LOL tell him hi', reply: 'He says hi. He also says "how do I leave"' },
    { label: 'Iconic 😂', reply: 'He is very proud of himself' },
  ] },
  { id: 'mom_plants', who: 'mom', cond: () => G.items.all().some((i) => i.def.category === 'plants' && i.data.loc === 'world'), text: ['Are you watering your plants?', 'You know plants have feelings'], replies: [
    { label: 'Every day!', reply: 'That\'s my kid 🌱' },
    { label: 'They\'re thriving (mostly)', reply: 'Talk to them, it helps!' },
  ] },
  { id: 'jules_boba', who: 'jules', unlock: 2, text: ['ok you HAVE to try boba bliss', 'brown sugar milk tea with extra pearls. life changing'], replies: [
    { label: 'ordering rn', reply: 'that\'s my bestie. here\'s a $15 gift card 🧋', money: 15 },
    { label: 'pearls are a texture crime', reply: 'blocked. unblocked. but wow' },
  ] },
  { id: 'jules_game', who: 'jules', text: ['are you still playing games or did you finally touch grass', 'jk we both know the answer'], replies: [
    { label: 'grass is overrated', reply: 'based. send me your high score' },
    { label: 'my apartment has a plant, that counts', reply: 'it literally does not but ok 🌱' },
  ] },
  { id: 'jules_fit', who: 'jules', cond: () => G.items.owned().filter((i) => i.def.use?.type === 'wear').length >= 6, text: ['saw your mirror selfie on the story', 'the fit was kinda hard ngl'], replies: [
    { label: 'I know 😎', reply: 'humble too wow', buff: 'stylish' },
    { label: 'stop 🥹', reply: 'no YOU stop. looking good' , buff: 'social' },
  ] },
  { id: 'bea_music', who: 'bea', cond: () => !!G.phone?.music?.playing || G.items.all().some((i) => i.runtime?.music?.playing), text: ['hi neighbor! is that your music? 🎶', 'it\'s actually really nice, my cat is vibing'], replies: [
    { label: 'Glad you like it!', reply: 'Mochi says thank you 🐈' },
    { label: 'Sorry, I\'ll turn it down', reply: 'No no keep it! It\'s cozy' },
  ] },
  { id: 'bea_rain', who: 'bea', weather: ['rain', 'storm'], text: ['rainy day = soup day 🍲', 'anyway I\'m making too much. leaving some at your door!'], replies: [
    { label: 'You\'re the best!!', reply: 'enjoy! knock knock 🚪', item: 'soup_gift' },
    { label: 'Aww thank you', reply: 'it\'s tomato basil, hope you like it', item: 'soup_gift' },
  ] },
  { id: 'bea_package', who: 'bea', cond: () => G.state.stats.ordersPlaced >= 3, text: ['lol the delivery guy knows your name now', 'he asked if you were ok'], replies: [
    { label: 'I am thriving', reply: 'clearly 😂' },
    { label: 'tell him I said hi', reply: 'he says hi back. he seems to really like you' },
  ] },
  { id: 'patel_maint', who: 'patel', text: ['Hello resident of 2403.', 'Reminder: the rooftop is closed for pigeon maintenance. Thank you for your patience.'], replies: [
    { label: 'Pigeon maintenance?', reply: 'Do not ask questions about the pigeons.' },
    { label: 'Thanks Mr. Patel', reply: 'You are a model tenant.' },
  ] },
  { id: 'patel_compliment', who: 'patel', cond: () => G.state.stats.itemsPlaced >= 10, text: ['Bea from 2404 says your apartment is "very nice and very cozy".', 'The building is proud. Here is a small tenant appreciation bonus.'], replies: [
    { label: 'Wow, thank you!', reply: 'Keep up the cozy work.', money: 50 },
  ] },
  { id: 'sam_gig', who: 'sam', text: ['hey! got a quick freelance thing if you\'re free', 'check WorkHub on your computer, bonus pay today 💼'], replies: [
    { label: 'On it!', reply: 'legend 🙏', buff: 'inspired' },
    { label: 'Maybe later', reply: 'no worries, it\'ll be there' },
  ] },
  { id: 'grandpa_tech', who: 'grandpa', text: ['HELLO THIS IS GRANDPA', 'HOW DO I TURN OFF THE CAPITALS', 'nevermind. Here is $10 for being a good grandkid. Buy yourself something nice.'], replies: [
    { label: 'Thanks Grandpa! ❤️', reply: 'LOVE YOU. oops', money: 10 },
  ] },
  { id: 'jules_late', who: 'jules', when: (h) => h >= 23 || h < 3, text: ['why are you awake', 'actually why am I awake'], replies: [
    { label: 'snack o\'clock', reply: 'respect. night owl gang 🦉' },
    { label: 'going to bed now', reply: 'sleep well!! 💤', buff: 'cozy' },
  ] },
  { id: 'mom_level', who: 'mom', event: 'levelUp', text: ['I don\'t really understand what you do all day', 'but I\'m very proud of you! 🥹'], replies: [
    { label: 'Thanks mom ❤️', reply: '❤️❤️❤️', buff: 'social' },
  ] },
  { id: 'jules_order', who: 'jules', event: 'order', text: ['did you just order AGAIN', 'your delivery history is a cry for help (affectionate)'], replies: [
    { label: 'treat yourself culture', reply: 'king/queen behavior honestly' },
    { label: 'mind your business 😤', reply: 'it IS my business, I\'m invested' },
  ] },
];

export class Messages {
  constructor() {
    this.next = G.clock.total + rand(20, 50);
    G.events.on('levelUp', () => this.trigger('levelUp'));
    G.events.on('act', (t) => { if (t === 'order' && Math.random() < 0.25) setTimeout(() => this.trigger('order'), 8000); });
  }
  get st() { return G.state.messages; }
  thread(id) { return (this.st.threads[id] ||= []); }
  pending(id) { return this.st.pending?.[id] || null; }

  trigger(event) {
    const c = CONVOS.find((c) => c.event === event && !this.recently(c.id));
    if (c) this.send(c);
  }
  recently(id) { const u = (this.st.used ||= {}); return u[id] && G.clock.total - u[id] < 1440 * 2; }

  update() {
    if (G.clock.total < this.next) return;
    this.next = G.clock.total + rand(110, 260);
    const h = G.clock.hour;
    const pool = CONVOS.filter((c) => !c.event && !this.recently(c.id) && (!c.when || c.when(h)) && (!c.cond || safe(c.cond)) && (!c.weather || c.weather.includes(G.weather.kind)) && (!c.unlock || G.state.level >= c.unlock) && !this.pending(c.who));
    if (pool.length) this.send(pick(pool));
  }

  send(c) {
    (this.st.used ||= {})[c.id] = G.clock.total;
    const th = this.thread(c.who);
    c.text.forEach((t, i) => setTimeout(() => {
      th.push({ from: 'them', text: t, t: G.clock.total });
      if (i === c.text.length - 1) {
        (this.st.pending ||= {})[c.who] = c.id;
        this.st.unread = (this.st.unread || 0) + 1;
        G.phone.notify({ app: 'messages', title: `${CONTACTS[c.who].avatar} ${CONTACTS[c.who].name}`, body: c.text[c.text.length - 1] });
        G.phone.refresh();
      }
    }, i * 1400));
  }

  reply(who, idx) {
    const cid = this.pending(who);
    const c = CONVOS.find((x) => x.id === cid);
    if (!c) return;
    const r = c.replies[idx];
    const th = this.thread(who);
    th.push({ from: 'me', text: r.label, t: G.clock.total });
    delete this.st.pending[who];
    G.audio.play('message', { pitch: 1.2 });
    G.events.emit('act', 'reply', { who });
    G.needs.add({ fun: 3, comfort: 2 });
    G.needs.addBuff('social', 90);
    setTimeout(() => {
      th.push({ from: 'them', text: r.reply, t: G.clock.total });
      G.audio.play('message');
      if (r.money) G.wallet.earn(r.money, `Gift from ${CONTACTS[who].name}`);
      if (r.buff) G.needs.addBuff(r.buff, 120);
      if (r.item) {
        const spot = G.apartment.packageSpots[1];
        G.items.spawn(r.item, { loc: 'world', pos: spot.clone(), st: { madeAt: G.clock.total } });
        G.audio.play('knock', { pos: spot.clone().setY(1.4) });
        G.ui.toast('Something was left at your door!', { icon: '🚪' });
      }
      G.phone.refresh();
    }, 1600);
    G.phone.refresh();
  }
  repliesFor(who) { const c = CONVOS.find((x) => x.id === this.pending(who)); return c ? c.replies : []; }
  markRead() { this.st.unread = 0; G.phone.badges.messages = 0; }
}
function safe(fn) { try { return fn(); } catch { return false; } }
