import type { Appearance } from './Appearance';
import type { BunId, Doneness, IngredientId } from '../food/Ingredients';

export interface Personality {
  patience: number; // multiplier on wait tolerance
  generosity: number; // tip multiplier
  pickiness: number; // penalty multiplier
  energy: number; // animation bounce
  voice: number; // pitch multiplier
  voiceType: 'bright' | 'warm' | 'deep' | 'squeaky' | 'raspy';
}

export interface CustomerDef {
  id: string;
  name: string;
  title: string;
  unlockRank: number;
  app: Appearance;
  p: Personality;
  likes: IngredientId[];
  dislikes: IngredientId[];
  bun?: BunId;
  doneness: Doneness[];
  /** 0..1 how much they want big stacks */
  appetite: number;
  lines: { hello: string[]; happy: string[]; ok: string[]; bad: string[]; waiting: string[] };
  special?: 'critic' | 'vip';
}

const base: Appearance = {
  height: 1,
  width: 1,
  belly: 0,
  skin: '#f1b88a',
  hair: 'short',
  hairColor: '#3b2a20',
  hat: 'none',
  hatColor: '#c4262e',
  glasses: 'none',
  facialHair: 'none',
  top: 'tee',
  topColor: '#3a7bd5',
  topColor2: '#ffffff',
  pattern: 'none',
  bottom: 'pants',
  bottomColor: '#2e3a59',
  shoeColor: '#2a2a2a',
  eyeColor: '#5a3a22',
  eyeSize: 1,
  lashes: false,
  nose: 'button',
  blush: 0.2,
};

const A = (o: Partial<Appearance>): Appearance => ({ ...base, ...o });
const P = (o: Partial<Personality>): Personality => ({ patience: 1, generosity: 1, pickiness: 1, energy: 1, voice: 1, voiceType: 'warm', ...o });

export const ROSTER: CustomerDef[] = [
  {
    id: 'marty', name: 'Marty Mae', title: 'Mail Carrier', unlockRank: 1,
    app: A({ skin: '#e0a070', hair: 'short', hairColor: '#5c3b24', hat: 'cap', hatColor: '#2a4d8f', top: 'uniform', topColor: '#6fa0d8', topColor2: '#2a4d8f', bottom: 'shorts', bottomColor: '#2a4d8f', shoeColor: '#1b1b1b', nose: 'round', facialHair: 'mustache', belly: 0.35, width: 1.1 }),
    p: P({ patience: 1.2, generosity: 1.0, pickiness: 0.8, voice: 0.95, voiceType: 'warm' }),
    likes: ['lettuce', 'tomato', 'ketchup', 'cheese_american'], dislikes: ['jalapenos'], doneness: ['medium'], appetite: 0.4,
    lines: { hello: ["Special delivery: one hungry mailman!", 'Afternoon! Rain or shine, I need a burger.'], happy: ['Signed, sealed, delicious!', 'First-class burger!'], ok: ['Not bad, not bad.'], bad: ['Return to sender...'], waiting: ['I have a route to finish...'] },
  },
  {
    id: 'rosa', name: 'Rosa Reyes', title: 'Mural Artist', unlockRank: 1,
    app: A({ skin: '#c98a5a', hair: 'curly', hairColor: '#1f1a17', hat: 'beret', hatColor: '#d9434f', top: 'overalls', topColor: '#f5d76e', topColor2: '#ffffff', bottomColor: '#4a78c8', bottom: 'pants', shoeColor: '#e8e2d6', lashes: true, eyeColor: '#3b2a20', earrings: '#f5c542', blush: 0.5, freckles: true }),
    p: P({ patience: 1.1, generosity: 1.1, pickiness: 1.1, voice: 1.25, voiceType: 'bright', energy: 1.2 }),
    likes: ['avocado', 'tomato', 'onion', 'mayo'], dislikes: ['bacon'], doneness: ['medium', 'rare'], appetite: 0.5,
    lines: { hello: ['Hola! Something colorful, please!', 'I need fuel for my next masterpiece.'], happy: ['A work of art! Magnífico!', 'Beautiful composition!'], ok: ['Mm, a nice sketch.'], bad: ['This is... abstract.'], waiting: ['Is my canvas drying?'] },
  },
  {
    id: 'tony', name: 'Big Tony', title: 'Construction Foreman', unlockRank: 1,
    app: A({ skin: '#f9cfa8', hair: 'buzz', hairColor: '#3b2a20', hat: 'hardhat', hatColor: '#ffc21a', top: 'tee', topColor: '#ff7a1a', topColor2: '#ffe066', pattern: 'hstripes', bottomColor: '#37507a', width: 1.35, belly: 0.7, height: 1.08, facialHair: 'stubble', nose: 'wide', shoeColor: '#6b4a2a' }),
    p: P({ patience: 0.8, generosity: 1.2, pickiness: 0.9, voice: 0.7, voiceType: 'deep', energy: 0.9 }),
    likes: ['bacon', 'cheese_american', 'onion', 'bbq', 'patty_beef'], dislikes: ['avocado'], doneness: ['well'], appetite: 0.95,
    lines: { hello: ["Stack 'em high, kid!", "I'm hungry enough to eat the building."], happy: ['Now THAT is a foundation!', 'Built to code!'], ok: ["It'll hold."], bad: ['This wobbles like bad scaffolding.'], waiting: ["Lunch break's almost over..."] },
  },
  {
    id: 'penny', name: 'Penny Pepper', title: 'Future Chef', unlockRank: 1,
    app: A({ kid: true, skin: '#ffe0c7', hair: 'pigtails', hairColor: '#c98a3a', top: 'tee', topColor: '#ff6fa3', topColor2: '#ffe066', pattern: 'star', bottom: 'skirt', bottomColor: '#6b4fd8', shoeColor: '#ff4f7b', eyeSize: 1.2, lashes: true, blush: 0.7, freckles: true, eyeColor: '#2f7a4a' }),
    p: P({ patience: 0.9, generosity: 0.7, pickiness: 0.7, voice: 1.6, voiceType: 'squeaky', energy: 1.5 }),
    likes: ['pickles', 'ketchup', 'cheese_american'], dislikes: ['onion', 'mustard', 'jalapenos'], doneness: ['medium'], appetite: 0.2,
    lines: { hello: ['Hi hi hi! Can I have extra pickles?', 'My allowance says one burger!'], happy: ['BEST. BURGER. EVER!', 'Yay yay yay!'], ok: ['It is okay I guess!'], bad: ['Ewwww!'], waiting: ['Are we there yet?'] },
  },
  {
    id: 'ingrid', name: 'Dr. Ingrid Walsh', title: 'Food Scientist', unlockRank: 2,
    app: A({ skin: '#ffe0c7', hair: 'bob', hairColor: '#e8c170', top: 'labcoat', topColor: '#8fd3c7', topColor2: '#f7f7f5', bottomColor: '#3a3f4a', glasses: 'square', glassesColor: '#1b1b1b', lashes: true, eyeColor: '#3a6fd8', nose: 'pointy', height: 1.02 }),
    p: P({ patience: 1.0, generosity: 1.15, pickiness: 1.45, voice: 1.15, voiceType: 'bright' }),
    likes: ['lettuce', 'tomato', 'mustard', 'cheese_swiss'], dislikes: ['bbq'], doneness: ['medium'], appetite: 0.45,
    lines: { hello: ['Hypothesis: you can make a perfect burger.', 'Precision, please.'], happy: ['Results: statistically delicious!', 'Peer-review approved.'], ok: ['Margin of error acceptable.'], bad: ['This experiment has failed.'], waiting: ['Time is a variable I cannot control...'] },
  },
  {
    id: 'duke', name: 'Coach Duke', title: 'Little League Coach', unlockRank: 2,
    app: A({ skin: '#8a5431', hair: 'buzz', hairColor: '#1f1a17', hat: 'visor', hatColor: '#e23b3b', top: 'jersey', topColor: '#e23b3b', topColor2: '#ffffff', badge: '23', bottom: 'shorts', bottomColor: '#1b1b1b', shoeColor: '#ffffff', facialHair: 'goatee', width: 1.15, height: 1.06 }),
    p: P({ patience: 0.85, generosity: 1.0, pickiness: 1.0, voice: 0.8, voiceType: 'raspy', energy: 1.4 }),
    likes: ['cheese_cheddar', 'bacon', 'ketchup', 'pickles'], dislikes: ['mayo'], doneness: ['well', 'medium'], appetite: 0.7,
    lines: { hello: ["Let's go, let's go! Game day burger!", 'Hustle, rookie!'], happy: ['HOME RUN!', "That's a champion burger!"], ok: ['Decent effort, rookie.'], bad: ["Strike three, you're out!"], waiting: ["C'mon, we're burning daylight!"] },
  },
  {
    id: 'fern', name: 'Nana Fern', title: 'Garden Club President', unlockRank: 3,
    app: A({ elderly: true, skin: '#ffe0c7', hair: 'bun', hairColor: '#e9e4dc', top: 'sweater', topColor: '#b07ac9', topColor2: '#f3e9ff', pattern: 'dots', bottom: 'skirt', bottomColor: '#6a4c7a', glasses: 'round', glassesColor: '#c8a04a', height: 0.9, lashes: true, blush: 0.6, necklace: '#f2f2f2', nose: 'round' }),
    p: P({ patience: 1.6, generosity: 1.5, pickiness: 0.8, voice: 1.2, voiceType: 'warm', energy: 0.6 }),
    likes: ['lettuce', 'tomato', 'mayo', 'cheese_swiss'], dislikes: ['sriracha', 'jalapenos'], doneness: ['well'], appetite: 0.3,
    lines: { hello: ['Hello dearie! Take your time.', 'Such a lovely little diner.'], happy: ['Just like I used to make!', 'Oh, you sweetheart!'], ok: ['Very nice, dear.'], bad: ['Oh my... bless your heart.'], waiting: ["I'm not in a rush, dear..."] },
  },
  {
    id: 'skye', name: 'Skye Zhang', title: 'Pro Skater', unlockRank: 3,
    app: A({ skin: '#f9cfa8', hair: 'sidepart', hairColor: '#4a78c8', hat: 'beanie', hatColor: '#2f9e8f', top: 'hoodie', topColor: '#3a3f4a', topColor2: '#ffb13b', bottom: 'pants', bottomColor: '#6b8a5a', shoeColor: '#e23b3b', eyeColor: '#1f1a17' }),
    p: P({ patience: 0.7, generosity: 0.9, pickiness: 0.9, voice: 1.05, voiceType: 'bright', energy: 1.3 }),
    likes: ['jalapenos', 'bacon', 'sriracha', 'onion'], dislikes: ['cheese_swiss'], doneness: ['rare', 'medium'], appetite: 0.6,
    lines: { hello: ['Yo! Something gnarly, please.', 'Kickflip-level burger, go!'], happy: ['Sick! Totally radical!', 'Ten out of ten, no bails!'], ok: ['Solid landing.'], bad: ['Total wipeout, dude.'], waiting: ['Waiting is so not rad...'] },
  },
  {
    id: 'kim', name: 'Officer Kim', title: 'Beat Cop', unlockRank: 4,
    app: A({ skin: '#f1b88a', hair: 'short', hairColor: '#1f1a17', hat: 'cap', hatColor: '#1c2e5a', top: 'uniform', topColor: '#27406e', topColor2: '#d8b04a', bottomColor: '#1c2e5a', glasses: 'sunglasses', height: 1.04 }),
    p: P({ patience: 1.0, generosity: 1.0, pickiness: 1.1, voice: 0.9, voiceType: 'warm' }),
    likes: ['cheese_american', 'onion', 'mustard', 'pickles'], dislikes: ['avocado'], doneness: ['medium', 'well'], appetite: 0.55,
    lines: { hello: ["Just the usual, and don't make me write a ticket.", 'On patrol and starving.'], happy: ['Case closed. Delicious!', 'You have the right to more burgers!'], ok: ["I'll let it slide."], bad: ["That's a violation."], waiting: ["Somebody's stalling..."] },
  },
  {
    id: 'gus', name: 'Grandpa Gus', title: 'Retired Owner', unlockRank: 4,
    app: A({ elderly: true, skin: '#f1b88a', hair: 'bald', hairColor: '#e9e4dc', facialHair: 'mustache', top: 'longsleeve', topColor: '#f2efe6', topColor2: '#c4262e', bottom: 'pants', bottomColor: '#6a5a4a', bowtie: '#c4262e', glasses: 'round', glassesColor: '#1b1b1b', belly: 0.45, height: 0.95, nose: 'long' }),
    p: P({ patience: 1.3, generosity: 1.35, pickiness: 1.25, voice: 0.8, voiceType: 'raspy', energy: 0.7 }),
    likes: ['cheese_american', 'onion', 'pickles', 'ketchup', 'mustard'], dislikes: ['sriracha'], doneness: ['medium'], appetite: 0.5,
    lines: { hello: ["How's my old grill treating you?", 'Back in my day, we flipped with our hands!'], happy: ["You've done me proud, kid!", 'Now THAT is a Sizzle & Stack classic!'], ok: ["Not bad. Keep practicing."], bad: ['Oh dear, my poor grill...'], waiting: ['Patience is a virtue... mostly.'] },
  },
  {
    id: 'luna', name: 'Luna Vega', title: 'Night Owl Poet', unlockRank: 5,
    app: A({ skin: '#ffe0c7', hair: 'long', hairColor: '#6b3fa0', top: 'dress', topColor: '#26222e', topColor2: '#6b3fa0', bottom: 'skirt', bottomColor: '#26222e', glasses: 'cateye', glassesColor: '#6b3fa0', shoeColor: '#1b1b1b', lashes: true, eyeColor: '#6b3fa0', necklace: '#c0c0c0', blush: 0.1 }),
    p: P({ patience: 1.1, generosity: 1.05, pickiness: 1.1, voice: 1.1, voiceType: 'warm', energy: 0.7 }),
    likes: ['mushrooms', 'cheese_swiss', 'onion', 'bbq'], dislikes: ['ketchup'], doneness: ['rare'], appetite: 0.4,
    lines: { hello: ['A burger, dark as midnight...', 'Surprise me, beautifully.'], happy: ['Sublime. I shall write a sonnet.', 'Poetry on a bun.'], ok: ['A haiku of a burger. Brief.'], bad: ['A tragedy in three acts.'], waiting: ['Time drips like candle wax...'] },
  },
  {
    id: 'hank', name: 'Hank Hollister', title: 'Rancher', unlockRank: 5,
    app: A({ skin: '#e0a070', hair: 'short', hairColor: '#8a5a2b', hat: 'cowboy', hatColor: '#8a5a2b', top: 'longsleeve', topColor: '#c0392b', topColor2: '#f3e0c0', pattern: 'plaid', bottomColor: '#3a4a6a', facialHair: 'mustache', shoeColor: '#6b3a1e', width: 1.1, height: 1.1 }),
    p: P({ patience: 1.1, generosity: 1.2, pickiness: 1.0, voice: 0.75, voiceType: 'deep', energy: 0.8 }),
    likes: ['bbq', 'bacon', 'onion_rings', 'onion', 'cheese_cheddar'], dislikes: ['avocado'], doneness: ['well', 'medium'], appetite: 0.85,
    lines: { hello: ["Howdy! Rustle me up somethin' hearty.", "Been ridin' all day, partner."], happy: ['Yee-haw! Finest in the county!', "That's some mighty fine grub!"], ok: ["Reckon that'll do."], bad: ["That ain't fit for the cattle."], waiting: ["Slower than molasses in January..."] },
  },
  {
    id: 'priya', name: 'Priya Patel', title: 'Startup CEO', unlockRank: 6,
    app: A({ skin: '#a86b42', hair: 'ponytail', hairColor: '#1f1a17', top: 'suit', topColor: '#ffffff', topColor2: '#2b3a55', bottomColor: '#2b3a55', shoeColor: '#1b1b1b', lashes: true, earrings: '#f5c542', eyeColor: '#3b2a20', nose: 'pointy' }),
    p: P({ patience: 0.6, generosity: 1.45, pickiness: 1.2, voice: 1.1, voiceType: 'bright', energy: 1.1 }),
    likes: ['avocado', 'lettuce', 'tomato', 'special'], dislikes: ['bacon', 'onion_rings'], doneness: ['medium'], appetite: 0.35,
    lines: { hello: ['I have a meeting in six minutes.', 'Optimize my burger, please.'], happy: ["Disruptive! I'm investing.", 'Scalable deliciousness!'], ok: ['Meets expectations.'], bad: ["This doesn't pass due diligence."], waiting: ['Every second is money...'] },
  },
  {
    id: 'mo', name: 'Mo Mbeki', title: 'Street Musician', unlockRank: 6,
    app: A({ skin: '#6b3f22', hair: 'afro', hairColor: '#1f1a17', top: 'tee', topColor: '#2f9e8f', topColor2: '#ffd35a', pattern: 'logo', bottomColor: '#e8dcc6', bottom: 'pants', shoeColor: '#ffd35a', glasses: 'round', glassesColor: '#ffb13b', eyeColor: '#1f1a17' }),
    p: P({ patience: 1.2, generosity: 0.95, pickiness: 0.8, voice: 0.9, voiceType: 'warm', energy: 1.5 }),
    likes: ['cheese_cheddar', 'jalapenos', 'bbq', 'tomato', 'lettuce'], dislikes: ['mustard'], doneness: ['medium', 'rare'], appetite: 0.75,
    lines: { hello: ['Hey hey! Play me a tasty tune.', 'What’s cookin’, good lookin’?'], happy: ['That burger’s got SOUL!', 'Encore! Encore!'], ok: ['Groovy enough.'], bad: ['Off-key, my friend.'], waiting: ['Humming a waiting song...'] },
  },
  {
    id: 'olive', name: 'Olive Oswald', title: 'Tourist', unlockRank: 7,
    app: A({ skin: '#ffe0c7', hair: 'bob', hairColor: '#c98a3a', hat: 'bucket', hatColor: '#f2e6c8', glasses: 'sunglasses', top: 'tee', topColor: '#ff9f68', topColor2: '#ffffff', pattern: 'dots', bottom: 'shorts', bottomColor: '#6fbfa5', shoeColor: '#ffffff', belly: 0.25, blush: 0.6, lashes: true }),
    p: P({ patience: 1.3, generosity: 1.1, pickiness: 0.7, voice: 1.2, voiceType: 'bright', energy: 1.3 }),
    likes: ['cheese_american', 'ketchup', 'lettuce', 'onion_rings'], dislikes: [], doneness: ['medium'], appetite: 0.55,
    lines: { hello: ['Is this the famous burger place?!', "I read about you online!"], happy: ['Five stars! Posting it now!', 'Worth the whole trip!'], ok: ["Cute! I'll take a photo."], bad: ["Hmm, I'll leave a review..."], waiting: ["I'll just take some selfies..."] },
  },
  {
    id: 'bruno', name: 'Bruno Brick', title: 'Bodybuilder', unlockRank: 8,
    app: A({ skin: '#f1b88a', hair: 'mohawk', hairColor: '#e8c170', top: 'tank', topColor: '#1b1b1b', topColor2: '#ff4f4f', bottomColor: '#4a4a4a', width: 1.45, height: 1.12, shoeColor: '#ff4f4f', facialHair: 'none', nose: 'wide' }),
    p: P({ patience: 0.8, generosity: 1.0, pickiness: 0.9, voice: 0.72, voiceType: 'deep', energy: 1.4 }),
    likes: ['patty_beef', 'patty_chicken', 'bacon', 'egg', 'cheese_cheddar'], dislikes: ['mayo'], doneness: ['well', 'medium'], appetite: 1.0,
    lines: { hello: ['PROTEIN. NOW. PLEASE.', 'Double patty. Triple if you love me.'], happy: ['GAINS!!!', 'Absolutely SHREDDED burger!'], ok: ['Macros acceptable.'], bad: ['Skip leg day? Fine. Skip THIS.'], waiting: ['My muscles are shrinking...'] },
  },
  {
    id: 'wendy', name: 'Wendy Whisk', title: 'Pastry Chef', unlockRank: 9,
    app: A({ skin: '#f9cfa8', hair: 'bun', hairColor: '#b0342c', hat: 'bow', hatColor: '#ff6fa3', top: 'uniform', topColor: '#fdfbf5', topColor2: '#ff6fa3', bottom: 'pants', bottomColor: '#3a3a3a', lashes: true, blush: 0.6, freckles: true, eyeColor: '#2f7a4a' }),
    p: P({ patience: 1.1, generosity: 1.2, pickiness: 1.3, voice: 1.35, voiceType: 'bright', energy: 1.1 }),
    likes: ['egg', 'mushrooms', 'cheese_swiss', 'mayo'], dislikes: ['jalapenos'], doneness: ['medium'], appetite: 0.45,
    lines: { hello: ['Presentation is everything, darling!', "Ooh, let's see your plating!"], happy: ['Simply scrumptious!', 'Chef’s kiss! Mwah!'], ok: ['Needs a little more love.'], bad: ['Oh no, the layers are all wrong!'], waiting: ['My soufflé would have risen by now...'] },
  },
  {
    id: 'dash', name: 'DJ Dash', title: 'Club DJ', unlockRank: 10,
    app: A({ skin: '#8a5431', hair: 'short', hairColor: '#1f1a17', hat: 'cap', hatColor: '#8e44ad', top: 'jacket', topColor: '#ffd35a', topColor2: '#8e44ad', bottomColor: '#1b1b1b', glasses: 'sunglasses', shoeColor: '#ffffff', necklace: '#f5c542', facialHair: 'stubble' }),
    p: P({ patience: 0.75, generosity: 1.3, pickiness: 1.0, voice: 0.95, voiceType: 'raspy', energy: 1.6 }),
    likes: ['sriracha', 'jalapenos', 'cheese_pepperjack', 'onion_rings'], dislikes: ['lettuce'], doneness: ['rare', 'medium'], appetite: 0.7,
    lines: { hello: ['Drop the beat... and a burger!', 'Make it spicy, make it loud!'], happy: ['That burger SLAPS!', 'Bass-boosted flavor!'], ok: ['Kinda mid, not gonna lie.'], bad: ['Record scratch. Nope.'], waiting: ['This wait is killing the vibe...'] },
  },
  {
    id: 'plum', name: 'Professor Plum', title: 'History Professor', unlockRank: 11,
    app: A({ elderly: true, skin: '#f9cfa8', hair: 'sidepart', hairColor: '#b8b2aa', facialHair: 'beard', top: 'jacket', topColor: '#f2efe6', topColor2: '#8a6a4a', pattern: 'none', bottomColor: '#5a4a3a', glasses: 'round', glassesColor: '#c8a04a', bowtie: '#6b3fa0', height: 1.02, belly: 0.3 }),
    p: P({ patience: 1.4, generosity: 1.1, pickiness: 1.35, voice: 0.85, voiceType: 'warm', energy: 0.7 }),
    likes: ['mushrooms', 'cheese_swiss', 'onion', 'mustard'], dislikes: ['sriracha'], doneness: ['medium', 'well'], appetite: 0.5,
    lines: { hello: ['The hamburger, a fascinating history!', 'Allow me to lecture you on toppings.'], happy: ['A historic achievement!', 'Summa cum laude!'], ok: ['A passing grade.'], bad: ['This goes in the history books... as a warning.'], waiting: ['In 1904, burgers were faster...'] },
  },
  {
    id: 'max', name: 'Max Mischief', title: 'Mischief Maker', unlockRank: 12,
    app: A({ kid: true, skin: '#e0a070', hair: 'spiky', hairColor: '#e8c170', top: 'tee', topColor: '#27ae60', topColor2: '#ffffff', pattern: 'hstripes', bottom: 'shorts', bottomColor: '#3a4a8a', shoeColor: '#e23b3b', eyeSize: 1.2, freckles: true, blush: 0.6 }),
    p: P({ patience: 0.7, generosity: 0.7, pickiness: 0.8, voice: 1.55, voiceType: 'squeaky', energy: 1.8 }),
    likes: ['ketchup', 'cheese_american', 'onion_rings', 'bacon'], dislikes: ['tomato', 'onion', 'mushrooms'], doneness: ['well'], appetite: 0.35,
    lines: { hello: ['No veggies! No veggies!', 'I want the BIGGEST burger!'], happy: ['AWESOME!!!', 'You rock, burger person!'], ok: ['Meh.'], bad: ['Grossss!'], waiting: ['Booooored!'] },
  },
  {
    id: 'yuki', name: 'Yuki Tanaka', title: 'Game Developer', unlockRank: 13,
    app: A({ skin: '#ffe0c7', hair: 'bob', hairColor: '#1f1a17', top: 'sweater', topColor: '#f5a3b8', topColor2: '#ffffff', bottomColor: '#5a5a7a', glasses: 'round', glassesColor: '#1b1b1b', lashes: true, eyeColor: '#1f1a17', blush: 0.5 }),
    p: P({ patience: 1.0, generosity: 1.1, pickiness: 1.2, voice: 1.3, voiceType: 'bright', energy: 1.0 }),
    likes: ['egg', 'avocado', 'special', 'cheese_cheddar'], dislikes: ['mustard'], doneness: ['medium'], appetite: 0.45,
    lines: { hello: ["Level up my lunch, please!", 'Loading appetite... 100%.'], happy: ['Achievement unlocked!', 'Perfect score! S-rank!'], ok: ['A-rank, not bad.'], bad: ['Game over...'], waiting: ['Respawning patience...'] },
  },
  {
    id: 'sam', name: 'Sam Sparks', title: 'Electrician', unlockRank: 14,
    app: A({ skin: '#c98a5a', hair: 'ponytail', hairColor: '#5c3b24', hat: 'visor', hatColor: '#ffc21a', top: 'overalls', topColor: '#ffffff', topColor2: '#ffc21a', bottomColor: '#3a5a8a', lashes: true, freckles: true, shoeColor: '#6b4a2a' }),
    p: P({ patience: 0.95, generosity: 1.05, pickiness: 1.0, voice: 1.15, voiceType: 'bright', energy: 1.2 }),
    likes: ['jalapenos', 'cheese_pepperjack', 'sriracha', 'bacon'], dislikes: ['mayo'], doneness: ['well'], appetite: 0.6,
    lines: { hello: ["I'm wired for a burger!", 'Something with a real spark!'], happy: ['Electrifying!', "You're a live wire!"], ok: ['Current is steady.'], bad: ['Short circuit!'], waiting: ['My patience is running low voltage...'] },
  },
  {
    id: 'bea', name: 'Queen Bea', title: 'Local Celebrity', unlockRank: 15, special: 'vip',
    app: A({ skin: '#a86b42', hair: 'long', hairColor: '#e8c170', hat: 'crown', hatColor: '#f5c542', top: 'dress', topColor: '#d93b8a', topColor2: '#f5c542', bottom: 'skirt', bottomColor: '#d93b8a', shoeColor: '#f5c542', glasses: 'cateye', glassesColor: '#f5c542', lashes: true, earrings: '#f5c542', necklace: '#f5c542', blush: 0.6 }),
    p: P({ patience: 0.9, generosity: 2.2, pickiness: 1.4, voice: 1.2, voiceType: 'bright', energy: 1.3 }),
    likes: ['avocado', 'egg', 'special', 'cheese_swiss', 'mushrooms'], dislikes: ['onion'], doneness: ['medium'], appetite: 0.6,
    lines: { hello: ['Darling! Make it FABULOUS.', 'The Queen is hungry.'], happy: ['Iconic. Simply iconic.', 'You may kiss the ring!'], ok: ['Adequate, peasant.'], bad: ['Off with its bun!'], waiting: ['Royalty does not wait.'] },
  },
  {
    id: 'rex', name: 'Rex Rumble', title: 'Pro Wrestler', unlockRank: 16,
    app: A({ skin: '#8a5431', hair: 'bald', hairColor: '#1f1a17', facialHair: 'beard', top: 'tank', topColor: '#e23b3b', topColor2: '#ffd35a', badge: '★', bottom: 'pants', bottomColor: '#ffd35a', width: 1.5, height: 1.15, belly: 0.2, shoeColor: '#e23b3b', glasses: 'sunglasses' }),
    p: P({ patience: 0.75, generosity: 1.3, pickiness: 0.9, voice: 0.65, voiceType: 'deep', energy: 1.7 }),
    likes: ['patty_beef', 'bacon', 'onion_rings', 'bbq', 'cheese_cheddar', 'egg'], dislikes: ['lettuce'], doneness: ['rare', 'medium'], appetite: 1.0,
    lines: { hello: ['OHHH YEAHHH! BURGER TIME!', 'Feed the CHAMPION!'], happy: ['PILE-DRIVER OF FLAVOR!', 'THE CROWD GOES WILD!'], ok: ['A two-count. Not bad.'], bad: ['I DEMAND A REMATCH!'], waiting: ['The champ is getting CRANKY!'] },
  },
  {
    id: 'ada', name: 'Ada Byte', title: 'Robotics Student', unlockRank: 18,
    app: A({ skin: '#f1b88a', hair: 'short', hairColor: '#2f9e8f', hat: 'headband', hatColor: '#ff6f3a', top: 'hoodie', topColor: '#ff6f3a', topColor2: '#2b2b2b', bottomColor: '#3a3a4a', glasses: 'square', glassesColor: '#2f9e8f', lashes: true, blush: 0.4 }),
    p: P({ patience: 1.0, generosity: 1.0, pickiness: 1.3, voice: 1.25, voiceType: 'bright', energy: 1.2 }),
    likes: ['patty_veggie', 'avocado', 'tomato', 'sriracha'], dislikes: ['bacon'], doneness: ['medium'], appetite: 0.5,
    lines: { hello: ['Beep boop! One burger, optimized.', 'Calibrating hunger sensors...'], happy: ['Output: pure joy!', '100% efficiency!'], ok: ['Within tolerances.'], bad: ['Error 404: flavor not found.'], waiting: ['Buffering...'] },
  },
  {
    id: 'critic', name: 'Julian Frost', title: 'Food Critic', unlockRank: 6, special: 'critic',
    app: A({ skin: '#ffe0c7', hair: 'sidepart', hairColor: '#1f1a17', hat: 'tophat', hatColor: '#1b1b1b', top: 'suit', topColor: '#f7f7f5', topColor2: '#1b1b1b', bottomColor: '#1b1b1b', tie: '#8e1b1b', glasses: 'none', facialHair: 'goatee', nose: 'long', height: 1.1, eyeColor: '#3a6fd8' }),
    p: P({ patience: 0.9, generosity: 2.5, pickiness: 1.6, voice: 0.85, voiceType: 'warm', energy: 0.5 }),
    likes: ['cheese_swiss', 'mushrooms', 'onion', 'special', 'egg'], dislikes: ['ketchup'], doneness: ['rare', 'medium'], appetite: 0.6,
    lines: { hello: ['I am... the critic. Impress me.', 'My review goes to print tonight.'], happy: ['Magnifique. Five stars.', 'A revelation on a bun.'], ok: ['Competent. Three stars.'], bad: ['Dreadful. One star.'], waiting: ['I am noting the wait time.'] },
  },
];

export const ROSTER_BY_ID: Record<string, CustomerDef> = Object.fromEntries(ROSTER.map((c) => [c.id, c]));
