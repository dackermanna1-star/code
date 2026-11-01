// Conversation engine. Builds context-sensitive options for the person being addressed,
// resolves outcomes against personality, opinion, respect and smarts, and speaks replies.
// The presentation (DialogueUI) renders `lines` and `options` and calls choose().
import { ITEMS } from '../world/items.js';
import { JOBS } from './activities.js';
import { CRIMES } from './rules.js';
import { clamp } from '../core/mathutil.js';

const pick = (a) => a[Math.floor(Math.random() * a.length)];
const GREET = {
  warm: ['Hey, look who it is!', 'My favourite cellblock celebrity.', 'Pull up a stool, friend.', 'Good to see a friendly face in here.'],
  neutral: ['Yeah?', 'What do you want?', 'Make it quick.', 'You lost, fish?', 'Mm-hm?'],
  cold: ['Walk away.', 'You got a lot of nerve.', 'Wrong person to bother.', 'Keep talking, see what happens.'],
};
const SMALLTALK = {
  ok: ['Ha! Fair enough.', 'You\'re alright, you know that?', 'Funny. Real funny.', 'Don\'t tell anyone I laughed.', 'Huh. Never thought of it like that.'],
  meh: ['Uh-huh.', 'Riveting.', 'Is that a joke? Was that meant to be a joke?', 'Sure, sure.'],
  bad: ['Did I ask?', 'Get out of my face.', 'You talk too much.'],
};
const RUMORS = [
  (s) => { const a = s.randomInmate(); const b = s.enemyOf(a); return b ? `${a.short} and ${b.short} can\'t stand each other. Stay out of that.` : `${a.short} keeps to themselves. Usually means trouble.`; },
  () => 'Workshop keeps the bolt cutters on the rack by the east wall. Not that you heard it from me.',
  () => 'Guards hand out solitary for swinging at them. Swing at inmates and it\'s mostly a fine. Mostly.',
  () => 'Lift in the gym or the yard and you\'ll hit harder. Iron is patient.',
  () => 'Library\'s where you get smarter. Smarter talkers get out of trouble.',
  () => 'Keep your nose clean and the parole board shaves days off every week.',
  () => 'Lenny Two-Spoons can get you anything. For a price.',
  () => 'Officer Dooley takes "donations." Sgt. Kettle does NOT.',
  () => 'Behind the yard bleachers the fence is rusted through. You\'d need cutters.',
  () => 'You see a lightning bolt over someone winding up? Tap block right then. Counter them.',
  () => 'Food tray from the counter at mealtimes. Sit, eat. Starving makes you weak.',
  () => 'Crews look after their own. Hit one Iron Pit guy, you fight the whole Pit.',
];
const INSULTS = ['Your mother was a library fine.', 'You look like a wet sandwich.', 'I\'ve seen tougher pudding.', 'Even the mop has more personality.', 'You fight like a folded chair.'];

export class Dialogue {
  constructor(sim) {
    this.sim = sim;
    this.active = false;
    this.npc = null; this.player = null;
    this.lines = [];      // [{who, text, mood}]
    this.options = [];
    this.age = 0;
    this.mode = 'talk';   // talk | arrest | trade | jobs
    this.chatCount = new Map();
  }
  get social() { return this.sim.social; }
  open(player, npc, mode = 'talk', ctx = {}) {
    const op = this.social.opinionOf(npc, player);
    if (mode === 'talk') {
      if (npc.state === 'ko' || npc.isDown) return this._bounce(npc, '...');
      if (npc.spot && npc.spot.activity === 'sleep' && npc.spotPhase === 'use') return this._bounce(npc, 'Zzz... five more minutes...');
      const b = this.sim.brainOf(npc);
      if (b && b.fight && b.fight.target === player) return this._bounce(npc, 'Talk with your fists!');
      if (b && b.fight) return this._bounce(npc, 'Busy! Kinda in the middle of something!');
      if (npc.kind === 'inmate' && op < -70) return this._bounce(npc, pick(GREET.cold));
    }
    this.active = true; this.npc = npc; this.player = player; this.mode = mode; this.ctx = ctx; this.age = 0; this.lines = [];
    npc.talkPartner = player; player.talkPartner = npc;
    if (npc.state === 'free') npc.setState('talk');
    if (npc.spot && npc.state === 'spot') npc.talkPartner = player;
    const b = this.sim.brainOf(npc); if (b) { b.paused = true; }
    player.stop();
    if (mode === 'arrest') this._say(npc, ctx.line || 'Hands where I can see them. You know why I\'m here.', 'angry');
    else if (npc.kind === 'guard') this._say(npc, op > 20 ? 'Inmate. What do you need?' : 'Move along unless it\'s important.', 'neutral');
    else if (npc.def.role === 'warden') this._say(npc, 'Ah. One of my guests. Make it brief, I have snow globes to dust.', 'neutral');
    else if (npc.def.role === 'nurse') this._say(npc, player.hp < player.maxHp * 0.7 ? 'Oh, honey. Who did that to you?' : 'Feeling poorly?', 'neutral');
    else this._say(npc, pick(op > 35 ? GREET.warm : op < -25 ? GREET.cold : GREET.neutral), op > 35 ? 'happy' : op < -25 ? 'angry' : 'neutral');
    this.refresh();
    this.sim.events.emit('dialogueOpen', { npc, mode });
    return true;
  }
  _bounce(npc, text) { npc.say(text, 2.5, { mood: 'angry' }); this.sim.events.emit('dialogueBounce', { npc }); return false; }
  _say(c, text, mood = 'neutral') {
    this.lines.push({ who: c === this.player ? 'You' : c.short, text, mood, player: c === this.player });
    if (this.lines.length > 6) this.lines.shift();
    c.say(text, Math.min(6, 1.8 + text.length * 0.05), { mood, expr: mood === 'angry' ? 'angry' : mood === 'happy' ? 'happy' : undefined });
  }
  close(reason = 'bye') {
    if (!this.active) return;
    const npc = this.npc, p = this.player;
    this.active = false;
    if (npc) { npc.talkPartner = null; if (npc.state === 'talk') npc.setState('free'); npc.faceYaw = null; const b = this.sim.brainOf(npc); if (b) b.paused = false; }
    if (p) p.talkPartner = null;
    if (reason === 'walkaway' && npc && this.mode === 'arrest') this.sim.rules.report(p, 'resisting', npc);
    else if (reason === 'walkaway' && npc && npc.kind === 'inmate' && Math.random() < 0.4) npc.say(pick(['Rude.', 'Whatever.', 'Okay then.', 'Nice talking to you too.']), 2);
    this.sim.events.emit('dialogueClose', { npc, reason });
    this.npc = null;
  }
  update(dt) {
    if (!this.active) return;
    this.age += dt;
    const npc = this.npc, p = this.player;
    if (!npc || npc.isDown || p.isDown || Math.hypot(npc.x - p.x, npc.z - p.z) > 4.5) { this.close('interrupted'); return; }
    p.faceYaw = Math.atan2(npc.x - p.x, npc.z - p.z);
  }

  // ------------------------------------------------------------------ options
  refresh() {
    const npc = this.npc, p = this.player, sim = this.sim;
    const op = this.social.opinionOf(npc, p);
    const O = [];
    const add = (label, fn, extra = {}) => O.push({ label, fn, ...extra });
    if (this.mode === 'arrest') {
      const r = sim.rules.rec(p);
      const crimes = [...r.warrants].map((k) => CRIMES[k].name).join(', ');
      const bribe = 6 + [...r.warrants].reduce((s, k) => s + CRIMES[k].severity * 4, 0);
      add(`Go quietly (${crimes})`, () => this._comply());
      if (p.ramen >= bribe) add(`Slip them ${bribe} ramen`, () => this._bribe(bribe), { tag: 'bribe' });
      add('Talk your way out', () => this._talkOut(), { tag: `Smarts ${Math.round(p.stats.smt)}` });
      add('Resist!', () => this._resist(), { tag: 'danger' });
      this.options = O; return;
    }
    if (this.mode === 'trade') {
      for (const off of sim.economy.traderOffer(npc)) add(`Buy ${ITEMS[off.type].name} — ${off.price} ramen`, () => this._buy(off), { disabled: p.ramen < off.price });
      if (p.held) add(`Sell ${p.held.def.name} — ${sim.economy.sellPrice(p.held)} ramen`, () => this._sell(p.held));
      add('Back', () => { this.mode = 'talk'; this.refresh(); });
      this.options = O; return;
    }
    if (this.mode === 'jobs') {
      for (const [id, J] of Object.entries(JOBS)) add(`${J.name}${p.job === id ? ' (current)' : ''} — ${J.desc}`, () => this._assignJob(id), { disabled: p.job === id });
      add('Back', () => { this.mode = 'talk'; this.refresh(); });
      this.options = O; return;
    }
    if (npc.kind === 'guard') {
      add('What\'s going on today?', () => this._schedule());
      const snitchable = this._snitchable();
      if (snitchable) add(`Report ${snitchable.c.short} (${CRIMES[snitchable.crime].name})`, () => this._snitch(snitchable), { tag: 'snitch' });
      if (npc.def.corrupt > 0.5 && p.ramen >= 5) add('Slip a little something (5 ramen)', () => this._grease());
      add('Never mind', () => this.close('bye'));
      this.options = O; return;
    }
    if (npc.def.role === 'warden') {
      add('I want a job', () => { this.mode = 'jobs'; this._say(npc, 'Idle hands, et cetera. Pick one.'); this.refresh(); });
      add('How do I get out early?', () => { this._say(npc, `Behave, work, and the parole board trims your sentence every week. Your conduct score is ${Math.round(sim.progression.behavior)}.`); this.refresh(); });
      add('Goodbye', () => this.close('bye'));
      this.options = O; return;
    }
    if (npc.def.role === 'nurse') {
      if (p.hp < p.maxHp * 0.95) add('Patch me up', () => this._heal());
      add('Goodbye', () => this.close('bye'));
      this.options = O; return;
    }
    // Inmates
    add('Shoot the breeze', () => this._chat());
    add('Heard anything?', () => this._rumor());
    const ready = sim.economy.favors.find((f) => f.from === npc.id && f.status === 'ready');
    if (ready) add('That thing you wanted? Done.', () => this._claim());
    const deliverable = sim.economy.favors.find((f) => f.from === npc.id && f.status === 'open' && f.kind === 'fetch' && p.held && p.held.type === f.item);
    if (deliverable) add(`Here's your ${ITEMS[deliverable.item].name.toLowerCase()}`, () => this._deliver());
    else if (!sim.economy.openFavorsFrom(npc).length) add('Need anything?', () => this._favor());
    if (npc.def.trader) add('Let\'s do business', () => { this.mode = 'trade'; this._say(npc, 'Step into my office. My office is this corner.'); this.refresh(); });
    if (p.held) add(`Give them the ${p.held.def.name.toLowerCase()}`, () => this._gift());
    if (sim.social.followers.has(npc.id)) add('Go do your own thing', () => this._dismiss());
    else if (op >= 45) add('Got my back?', () => this._recruit());
    if (this.ctx.hassle) add(`Pay the toll (${this.ctx.hassle.demand} ramen)`, () => this._payToll(), { disabled: p.ramen < this.ctx.hassle.demand });
    add('Hand over some ramen. Now.', () => this._threaten(), { tag: 'threat' });
    add('Insult them', () => this._insult(), { tag: 'risky' });
    if (op < -20) add('Look... sorry about before.', () => this._apologize());
    add('Later.', () => this.close('bye'));
    this.options = O;
  }
  choose(i) {
    const o = this.options[i];
    if (!o || o.disabled) return;
    this.sim.events.emit('dialogueChoice', { label: o.label });
    o.fn();
  }

  // ------------------------------------------------------------------ outcomes
  _sm() { return this.player.stats.smt; }
  _chat() {
    const npc = this.npc, p = this.player;
    const n = (this.chatCount.get(npc.id) || 0) + 1; this.chatCount.set(npc.id, n);
    const soc = npc.def.traits?.sociability ?? 0.5;
    const op = this.social.opinionOf(npc, p);
    this._say(p, pick(['So what are you in for?', 'Food\'s getting worse, right?', 'You ever think about the ocean?', 'Nice weather we\'re not having.', 'I hear the Warden collects snow globes.']));
    const roll = Math.random() * 100 + this._sm() * 0.4 + soc * 30 - n * 8;
    let delta, mood;
    if (op < -30 && roll < 70) { delta = -1; mood = 'bad'; }
    else if (roll > 60) { delta = 4 + Math.round(soc * 4); mood = 'ok'; }
    else if (roll > 30) { delta = 1; mood = 'meh'; }
    else { delta = -2; mood = 'bad'; }
    if (n > 4) delta = Math.min(delta, 0);
    this.social.adjust(npc, p, delta, null);
    const crime = npc.def.crime && Math.random() < 0.35 ? `Me? ${npc.def.crime}. Long story.` : null;
    this._say(npc, crime || pick(SMALLTALK[mood]), mood === 'ok' ? 'happy' : mood === 'bad' ? 'angry' : 'neutral');
    this.refresh();
  }
  _rumor() {
    const s = { randomInmate: () => pick(this.sim.characters.filter((c) => c.kind === 'inmate' && !c.isPlayer)), enemyOf: (a) => this.sim.characters.find((c) => c.kind === 'inmate' && c !== a && !c.isPlayer && this.social.opinionOf(a, c) < -25) };
    const op = this.social.opinionOf(this.npc, this.player);
    if (op < -10) { this._say(this.npc, 'Find out yourself.', 'angry'); return this.refresh(); }
    this._say(this.player, 'Heard anything interesting?');
    this._say(this.npc, pick(RUMORS)(s));
    this.refresh();
  }
  _favor() {
    const f = this.sim.economy.offerFavor(this.npc, this.player);
    this._say(this.player, 'Need anything?');
    if (!f) this._say(this.npc, 'Nah. I\'m good. For now.');
    else this._say(this.npc, f.kind === 'fetch' ? `Actually... get me a ${ITEMS[f.item].name.toLowerCase()}. ${f.reward} ramen in it for you.` : `${this.sim.byId.get(f.target).short} has been running their mouth. Put them on the floor. ${f.reward} ramen.`, 'neutral');
    this.refresh();
  }
  _deliver() { const f = this.sim.economy.deliver(this.player, this.npc); if (f) this._say(this.npc, `Now THAT'S service. Here's ${f.reward} ramen.`, 'happy'); this.refresh(); }
  _claim() { const f = this.sim.economy.claim(this.player, this.npc); if (f) this._say(this.npc, `Ha! Heard all about it. ${f.reward} ramen, as promised.`, 'happy'); this.refresh(); }
  _gift() {
    const p = this.player, npc = this.npc, it = p.held;
    if (!it) return;
    p.held = null; it.holder = null; it.pocketOf = npc; npc.pockets.push(it);
    const val = it.def.value || 1;
    const delta = Math.round(4 + val * 1.5 + (it.def.gift ? 6 : 0));
    this.social.adjust(npc, p, delta, 'gave me a gift');
    this._say(p, `Here. Take the ${it.def.name.toLowerCase()}.`);
    this._say(npc, val >= 10 ? 'For me?! You\'re alright, friend.' : 'Huh. Thanks.', 'happy');
    this.refresh();
  }
  _recruit() {
    const npc = this.npc, p = this.player;
    const op = this.social.opinionOf(npc, p);
    const chance = (op - 30) / 60 + (p.respect || 0) / 150 + (npc.def.traits?.loyalty ?? 0.5) * 0.3;
    this._say(p, 'Got my back if things get ugly?');
    if (Math.random() < chance) { this.social.followers.add(npc.id); this._say(npc, 'Yeah. I got you. Lead the way.', 'happy'); this.sim.events.emit('recruited', { npc }); }
    else this._say(npc, 'I like you, but not THAT much.', 'neutral');
    this.refresh();
  }
  _dismiss() { this.social.followers.delete(this.npc.id); const b = this.sim.brainOf(this.npc); if (b) b.goal = null; this._say(this.npc, 'Holler if you need me.'); this.refresh(); }
  _payToll() { const d = this.ctx.hassle.demand; this.player.ramen -= d; this.npc.ramen += d; this.social.adjust(this.npc, this.player, 3, null); this.player.respect = Math.max(0, (this.player.respect || 0) - 2); this._say(this.npc, 'Smart. Real smart.', 'happy'); this.ctx.hassle = null; this.close('bye'); }
  _threaten() {
    const npc = this.npc, p = this.player;
    this._say(p, 'Hand over some ramen. Now.', 'angry');
    p.anim.play('threaten', 1.2);
    const fear = (p.respect || 0) / 100 + (p.stats.str - npc.stats.str) / 120 - (npc.def.traits?.bravery ?? 0.5) * 0.6 + 0.2;
    if (Math.random() < fear && npc.ramen > 0) {
      const amt = Math.min(npc.ramen, 2 + Math.floor(Math.random() * 5));
      npc.ramen -= amt; p.ramen += amt;
      this.social.adjust(npc, p, -15, 'shook me down');
      this._say(npc, `Okay, okay! ${amt} ramen. Happy?`, 'angry');
      this.sim.events.emit('extort', { c: p, npc, amt });
      this.close('bye');
    } else {
      this.social.adjust(npc, p, -12, 'threatened me');
      this._say(npc, pick(['You and what army?', 'Wrong guy, pal.', 'Big mistake.']), 'angry');
      this.close('bye');
      if (Math.random() < 0.55 + (npc.def.traits?.aggression ?? 0.5) * 0.4) this.sim.brainOf(npc)?.startFight(p, 'threatened');
    }
  }
  _insult() {
    const npc = this.npc, p = this.player;
    this._say(p, pick(INSULTS), 'angry');
    this.social.adjust(npc, p, -14, 'insulted me');
    const aggr = npc.def.traits?.aggression ?? 0.5;
    if (Math.random() < aggr * 0.9) { this._say(npc, pick(['That\'s it!', 'Say that again. I dare you.', 'Oh, you\'re DONE.']), 'angry'); this.close('bye'); this.sim.brainOf(npc)?.startFight(p, 'insulted'); }
    else { this._say(npc, pick(['Wow. Okay.', 'Rude!', 'That one actually hurt.']), 'angry'); this.refresh(); }
  }
  _apologize() {
    const npc = this.npc, p = this.player;
    this._say(p, 'Look... sorry about before.');
    const ok = Math.random() < 0.4 + this._sm() / 200;
    this.social.adjust(npc, p, ok ? 15 : 3, ok ? 'apologized' : null);
    p.respect = Math.max(0, (p.respect || 0) - 1);
    this._say(npc, ok ? 'Fine. Water under the bridge.' : 'Words are cheap.', ok ? 'happy' : 'neutral');
    this.refresh();
  }
  _buy(off) { const it = this.sim.economy.buy(this.player, off.type, off.price); if (it) { this.npc.ramen += off.price; this._say(this.npc, 'Pleasure doing business.', 'happy'); } this.refresh(); }
  _sell(item) { const price = this.sim.economy.sell(this.player, item, this.npc); this._say(this.npc, price ? `${price} ramen. Final offer. Already paid.` : 'I\'m tapped out. Come back later.'); this.refresh(); }
  _assignJob(id) { this.player.job = id; this._say(this.npc, `${JOBS[id].name} it is. Report during work detail.`, 'neutral'); this.sim.events.emit('jobAssigned', { c: this.player, job: id }); this.mode = 'talk'; this.refresh(); }
  _heal() {
    const p = this.player;
    this._say(this.npc, 'Lie still, this might sting. It will sting.');
    p.hp = p.maxHp;
    this.sim.events.emit('healed', { c: p });
    this.sim.timeSkip?.(30);
    this.close('bye');
  }
  _schedule() {
    const clk = this.sim.clock, per = clk.period;
    this._say(this.player, 'What\'s going on today?');
    this._say(this.npc, `It's ${clk.hhmm}. ${per.name}: ${per.desc}`);
    this.refresh();
  }
  _snitchable() {
    const recent = this.sim.rules.log.slice(-20).reverse();
    for (const r of recent) {
      if (r.who === this.player.id || this.sim.clock.total - r.t > 120) continue;
      const c = this.sim.byId.get(r.who);
      if (c && !this.sim.rules.rec(c).warrants.has(r.crime)) return { c, crime: r.crime };
    }
    // Things the player witnessed that guards didn't
    const w = this.sim.playerWitnessed?.slice(-5).reverse().find((x) => this.sim.clock.total - x.t < 90);
    return w ? { c: w.c, crime: w.crime } : null;
  }
  _snitch(s) {
    const p = this.player;
    this._say(p, `${s.c.short} did it. I saw the whole thing.`);
    this.sim.rules.report(s.c, s.crime, this.npc);
    this.sim.progression.behavior = Math.min(100, this.sim.progression.behavior + 5);
    this._say(this.npc, 'Noted. We\'ll handle it.', 'neutral');
    // Word gets around...
    for (const w of this.social.witnesses(p.x, p.z, 10, [p, this.npc])) if (w.kind === 'inmate') { this.social.adjust(w, p, -20, 'snitched'); p.respect = Math.max(0, (p.respect || 0) - 3); }
    this.sim.events.emit('snitch', { c: p, target: s.c });
    this.refresh();
  }
  _grease() { this.player.ramen -= 5; this.npc.ramen += 5; this.social.adjust(this.npc, this.player, 10, null); this.sim.rules.rec(this.player).heat = Math.max(0, this.sim.rules.rec(this.player).heat - 30); this._say(this.npc, 'I didn\'t see anything. I never see anything.', 'happy'); this.refresh(); }
  // Arrest outcomes
  _comply() {
    const res = this.sim.rules.arrest(this.player, this.npc, 'comply');
    this.close('done');
    return res;
  }
  _bribe(amount) {
    const g = this.npc, p = this.player;
    const corrupt = g.def.corrupt ?? 0.3;
    if (Math.random() < corrupt + (this._sm() - 40) / 300) {
      p.ramen -= amount; g.ramen += amount;
      const r = this.sim.rules.rec(p); r.warrants.clear(); r.heat = Math.max(0, r.heat - 40);
      g.flags.dispatch = null;
      this._say(g, 'I didn\'t see anything. Get lost.', 'neutral');
      this.sim.events.emit('bribed', { c: p, guard: g, amount });
      this.close('done');
    } else {
      this._say(g, 'Are you trying to BRIBE me?!', 'angry');
      this.sim.rules.report(p, 'bribery', g);
      this.refresh();
    }
  }
  _talkOut() {
    const g = this.npc, p = this.player;
    const r = this.sim.rules.rec(p);
    const sev = [...r.warrants].reduce((s, k) => s + CRIMES[k].severity, 0);
    const chance = clamp(0.15 + (p.stats.smt - 30) / 120 - sev * 0.08 + (this.social.opinionOf(g, p) / 300), 0.03, 0.85);
    this._say(p, pick(['This is all a misunderstanding.', 'He fell. Onto my fist. Repeatedly.', 'I was holding it for a friend.', 'I was told this was the gift shop.']));
    if (Math.random() < chance) { r.warrants.clear(); r.heat = Math.max(0, r.heat - 20); g.flags.dispatch = null; this._say(g, 'Ugh. Fine. Don\'t let me catch you again.', 'neutral'); this.close('done'); }
    else { this._say(g, 'Nice try. Hands behind your back.', 'angry'); this.options = this.options.filter((o) => !o.label.startsWith('Talk')); }
  }
  _resist() {
    const g = this.npc, p = this.player;
    this._say(p, 'Not today!', 'angry');
    this.sim.rules.report(p, 'resisting', g);
    this.close('resist');
    this.sim.brainOf(g)?.startFight(p, 'subdue');
  }
}
