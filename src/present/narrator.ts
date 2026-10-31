import type { Rng } from '../core/rng';
import { PLAN_NAMES, type PlanKind } from '../ai/context';

/**
 * Turns fight events into varied, human-sounding narration lines ("the story of the fight").
 * Templates use {A} (actor), {B} (other fighter), and event-specific fields.
 */

const T: Record<string, string[]> = {
  opening: [
    '{A} and {B} face each other across {arena}.',
    'The air over {arena} goes still. Two gods. One survives.',
    '{arena} holds its breath as {A} and {B} take their stances.',
    'No words. {A} and {B} have already said everything with their eyes.',
  ],
  fight: ['The duel begins!', 'Steel meets divinity — the battle is on!', 'They move — and the world shakes.'],
  'intent:scouted': ['{A} has seen enough — switching to {plan}.', '{A} finishes measuring {B}. Time for {plan}.'],
  'intent:failed': ['{A} abandons the {prev} and shifts to {plan}.', 'The {prev} isn\'t working — {A} changes tack: {plan}.'],
  'intent:winning': ['{A} presses the advantage — {plan}.', 'Smelling blood, {A} turns up the {plan}.'],
  'intent:adapt:parries': ['{A} adapts to {B}\'s parries — time for misdirection.', '{A} stops feeding {B} clean strikes and starts setting traps.'],
  'intent:adapt:zoning': ['{A} is done eating projectiles and charges in.', 'Tired of the barrage, {A} closes the distance.'],
  'intent:adapt:aggression': ['{A} notices {B}\'s hunger to attack — and starts baiting it.', '{A} dances at the edge of {B}\'s reach, waiting for a mistake.'],
  'intent:wrathFull': ['{A}\'s wrath boils over — hunting for the perfect opening.', 'Divine fury fills {A}. Something terrible is coming.'],
  'intent:lowHp': ['{A} is badly hurt and fights to create space.', 'Bleeding light, {A} regroups.'],
  'intent:oppAscended': ['{A} braces against the ascended {B}.', '{A} turns defensive against {B}\'s transformed power.'],
  'intent:energyLow': ['{A} backs off to gather power.', '{A} disengages to draw on fresh strength.'],
  'intent:cornering': ['{A} starts driving {B} toward the wall.', '{A} cuts off {B}\'s escape routes.'],
  'intent:shift': ['{A} switches to {plan}.', '{A} changes rhythm: {plan}.'],
  'read:teleport': ['{A} reads the teleport and is already waiting!', 'A perfect read — {A} turns to meet the vanishing {B}!'],
  'read:opener': ['{A} saw that coming from a mile away.', '{A} reads {B}\'s opener perfectly.'],
  'read:throw': ['{A} smells the throw and slips away.', '{A} anticipates the grab!'],
  'read:jump': ['{A} swats {B} out of the air.', '{A} punishes the leap!'],
  'read:interrupt': ['{A} interrupts {B} mid-swing!', '{A} beats {B} to the punch.'],
  guardBreak: ['{A} shatters {B}\'s guard!', '{B}\'s defense crumbles under {A}\'s assault!'],
  perfectParry: ['{A} perfectly parries {B}!', 'A flawless deflection from {A}!', '{A} turns {B}\'s strike aside with contemptuous ease.'],
  combo: ['{A} lands a {n}-hit combo for {dmg} damage!', '{A} rips through {B}: {n} hits, {dmg} damage.', 'A brutal {n}-hit string from {A}!'],
  ultimate: ['{A} unleashes {ult}!', '{A} calls upon {ult}!'],
  lastStand: ['{A} refuses to fall — LAST STAND!', 'Death knocks — and {A} slams the door. LAST STAND!'],
  'bladeLock:start': ['Blades lock! {A} and {B} strain against each other!', 'Steel grinds on steel — a contest of raw will!'],
  'bladeLock:overpower': ['{A} overpowers {B} and breaks the lock!', '{A}\'s strength wins out — {B} is sent reeling!'],
  'bladeLock:slip': ['{A} slips the lock — {B} stumbles into the void!', 'A cunning release! {B} falls forward into {A}\'s trap.'],
  'bladeLock:repel': ['The lock explodes apart in a shockwave!', 'Neither yields — the lock bursts!'],
  'beamStruggle:start': ['Beams collide! A struggle of divine wills!', 'Two beams meet — the sky splits in half!'],
  'beamStruggle:overwhelm': ['{A}\'s beam overwhelms {B}!', '{A} pours everything in — and {B} is engulfed!'],
  'beamStruggle:mutual': ['Both beams detonate in a blinding explosion!'],
  'beamStruggle:escape': ['{A} vanishes out of the struggle!', '{A} abandons the struggle in a flash!'],
  'blitz:start': ['They vanish — a clash of gods across the sky!', 'Speed beyond sight: {A} and {B} trade blows everywhere at once!'],
  'blitz:decisive': ['{A} wins the exchange and sends {B} crashing down!', '{A} emerges from the blitz victorious!'],
  counter: ['{A} answers with a lightning iai counter!', 'Stillness, then death — {A} counters!'],
  thousandCuts: ['{A}: Thousand Cuts!', '{A} takes a single step. A thousand cuts follow.'],
  transform: ['{A} ascends!', '{A} sheds every limit and ascends!'],
  timeStop: ['{A} stops time itself.', 'The world freezes at {A}\'s command.'],
  rewind: ['{A} rewinds their own fate.', 'Time unwinds around {A}.'],
  throwBreak: ['{B} breaks the throw!', 'The grab is torn free!'],
  throwSlam: ['{A} slams {B} into the earth!', '{A} hurls {B} down!'],
  propBreak: ['{A} is smashed through a {prop}!', 'A {prop} explodes as {A} crashes into it!'],
  'phase:escalation': ['The feeling-out is over. The real fight begins.'],
  'phase:climax': ['The battle reaches its climax — wrath runs high.'],
  'phase:collapse': ['The arena begins to collapse — DIVINE COLLAPSE!'],
  'phase:judgment': ['JUDGMENT: every blow is lethal now.'],
  ko: ['{A} defeats {B} with {fin}!', '{fin}! {A} stands victorious over {B}.'],
  comeback: ['{A} completes an impossible comeback!', 'From the brink — {A} turns it all around!'],
  leadChange: ['{A} seizes the momentum.', 'The tide turns in {A}\'s favour.'],
  firstBlood: ['First blood: {A}.', '{A} draws first blood.'],
  deceived: ['{B} falls for {A}\'s mirage!', '{A}\'s decoy fools {B} completely!'],
  hazard: ['The arena itself strikes!', '{arena} lashes out!'],
  burst: ['{A} bursts free of the combo!', '{A} explodes out of {B}\'s pressure!'],
  clashWin: ['{A} wins the clash.', 'Sparks fly — {A} comes out on top.'],
  finalClash: ['Time is up — only one can remain. FINAL CLASH!', 'Both fall at once — but there will be no draw. FINAL CLASH!'],
  heal: ['{A} draws a second wind.', '{A} restores their strength.'],
  whiffPunish: ['{A} punishes the whiff!', '{B} overextends — {A} makes them pay.'],
};

export class Narrator {
  constructor(private rng: Rng, private names: [string, string], private arena: string) {}

  line(key: string, a: 0 | 1 | null, vars: Record<string, string | number> = {}): string | null {
    const pool = T[key];
    if (!pool) return null;
    let s = this.rng.pick(pool);
    const A = a === null ? '' : this.names[a];
    const B = a === null ? '' : this.names[a === 0 ? 1 : 0];
    s = s.replace(/\{A\}/g, A).replace(/\{B\}/g, B).replace(/\{arena\}/g, this.arena);
    for (const [k, v] of Object.entries(vars)) s = s.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
    return s;
  }

  planName(p: string): string {
    return PLAN_NAMES[p as PlanKind]?.toLowerCase() ?? p;
  }
}
