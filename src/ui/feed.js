// Play-by-play commentary built from simulation events. Returns
// { text, level } (level 0..3 = routine..spectacular) or null.

const pick = (arr, n) => arr[n % arr.length];
let n = 0;

const MOVE_NAMES = {
  jab: 'a jab', cross: 'a cross', hook: 'a hook', uppercut: 'an uppercut', elbow: 'an elbow', knee: 'a knee',
  teep: 'a push kick', roundhouse: 'a roundhouse', spinkick: 'a spinning back kick', sweep: 'a low sweep',
  flyingkick: 'a flying kick', backkick: 'a back kick', backelbow: 'a back elbow', shove: 'a shove',
  wswing: 'a full swing', woverhead: 'an overhead smash', wthrust: 'a thrust',
};

const WEAPON_NAMES = { pipe: 'steel pipe', bat: 'bat', crowbar: 'crowbar', plank: 'plank' };

export function describe(e) {
  n++;
  switch (e.t) {
    case 'ko': {
      const f = e.f;
      const name = f.name;
      const by = e.by;
      const viaHero = by && by.isHero;
      if (by && !by.isHero && by !== f && (e.cause === 'beaten' || e.cause === 'body')) {
        return { text: `${by.name} accidentally knocks out ${name}`, level: 2 };
      }
      switch (e.cause) {
        case 'electric': return { text: `${name} is fried on the live panel`, level: 3 };
        case 'window': return { text: `${name} goes through the window`, level: 3 };
        case 'fell': return { text: viaHero ? `Onyx sends ${name} over the edge` : `${name} falls to their doom`, level: 3 };
        case 'explosion': return { text: `${name} is caught in the blast`, level: 3 };
        case 'steam': return { text: `${name} is scalded by the steam vent`, level: 2 };
        case 'wall': return { text: `${name} is slammed into the wall`, level: 2 };
        case 'object': return { text: `${name} is flattened by flying debris`, level: 2 };
        case 'throw': return { text: pick([`Onyx throws ${name} down hard`, `${name} is thrown and stays down`], n), level: 1 };
        case 'body': return { text: `${name} is taken out by a flying body`, level: 2 };
        case 'slam': return { text: pick([`${name} hits the floor and stays there`, `${name} crashes down, out cold`], n), level: 1 };
        default:
          if (viaHero) return { text: pick([`Onyx drops ${name}`, `${name} is out cold`, `Onyx finishes ${name}`, `${name} goes down for good`], n), level: 0 };
          return { text: `${name} is down`, level: 0 };
      }
    }
    case 'chain':
      if (e.count >= 2) return { text: `Chain reaction — ${e.count + 1} bodies down`, level: e.count >= 3 ? 3 : 2 };
      if (e.via) return { text: `${e.victim.name} is bowled over by ${e.via.name}`, level: 1 };
      return null;
    case 'parry':
      return { text: `Onyx parries ${e.b.name}`, level: 1 };
    case 'guardbreak':
      if (e.a && e.a.isHero) return { text: `Onyx breaks ${e.b.name}'s guard`, level: 1 };
      return { text: `${e.a.name} breaks through Onyx's guard`, level: 2 };
    case 'throw':
      if (e.move === 'spinthrow') return { text: `Onyx spins ${e.b.name} into the crowd`, level: 2 };
      if (e.move === 'reversal') return { text: `Reversal — ${e.b.name} goes over the shoulder`, level: 2 };
      if (e.move === 'shouldertoss') return { text: `Onyx tosses ${e.b.name} over his shoulder`, level: 1 };
      return { text: `Onyx hip-throws ${e.b.name}`, level: 1 };
    case 'grab':
      if (e.hold && e.b && e.b.isHero) return { text: `${e.a.name} grabs Onyx from behind`, level: 2 };
      return null;
    case 'hit':
      if (e.friendly && e.down && n % 2 === 0) return { text: `${e.a.name} clobbers ${e.b.name} by mistake`, level: 1 };
      if (e.a && e.a.isHero && e.down && (e.move === 'spinkick' || e.move === 'flyingkick') && n % 2 === 0) return { text: `${MOVE_NAMES[e.move] ? MOVE_NAMES[e.move][0].toUpperCase() + MOVE_NAMES[e.move].slice(1) : 'A kick'} floors ${e.b.name}`, level: 1 };
      return null;
    case 'combo':
      if (e.n === 4 || e.n === 6 || e.n === 9) return { text: `${e.n}-hit combo`, level: 1 };
      return null;
    case 'wave':
      return { text: `Wave ${e.n} — ${e.count} more coming`, level: 2 };
    case 'explosion':
      return { text: 'The gas canister explodes', level: 3 };
    case 'pickup':
      if (e.f && e.f.isHero) return { text: `Onyx picks up the ${WEAPON_NAMES[e.weapon] || 'weapon'}`, level: 1 };
      if (n % 3 === 0) return { text: `${e.f.name} arms up with a ${WEAPON_NAMES[e.weapon] || 'weapon'}`, level: 0 };
      return null;
    case 'break':
      if (e.weaponBreak && e.f) return { text: `${e.f.isHero ? "Onyx's" : e.f.name + "'s"} ${e.material === 'wood' ? 'weapon snaps' : 'weapon breaks'}`, level: 0 };
      return null;
    case 'trip':
      return { text: `${e.a.name} trips over a body`, level: 1 };
    case 'feed':
      return { text: e.text, level: e.level || 1 };
    case 'heroDefeated': {
      const how = { electric: 'electrocuted', fell: 'fallen', explosion: 'caught in a blast', window: 'thrown out', body: 'buried under bodies' }[e.cause];
      return { text: how ? `Onyx is ${how}. It's over.` : `Onyx is down${e.by ? ` — ${e.by.name} lands the final blow` : ''}.`, level: 3 };
    }
    case 'victory':
      return { text: e.reason === 'cleared' ? 'Every last one of them is down' : 'Onyx survives the onslaught', level: 3 };
  }
  return null;
}
