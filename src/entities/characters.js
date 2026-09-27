// The four survivors. Visual identity (silhouette, clothing, colours), voice
// settings and personality flags used by dialogue and bots.
export const CHARACTERS = {
  bill: {
    id: 'bill', name: 'Bill', color: '#8fa86a',
    bio: 'Vietnam veteran. Gruff, protective, the natural leader. Has seen hell before and walked out of it.',
    skin: 0xc49a7a, sleeve: 0x4a5230, gloves: null, fingerless: false,
    body: { shirt: 0x4a5230, pants: 0x6e6450, shoes: 0x2a2018, hair: 0xb8b4ac, beard: 0xc8c4bc, hat: 'beret', hatColor: 0x2e3a22, jacket: true, scale: 1.0, build: 1.05, age: 'old' },
    voice: { pitch: 0.75, rate: 0.92, prefer: ['Daniel', 'George', 'Google UK English Male', 'Microsoft David', 'Alex', 'Fred', 'male'] },
    bot: { aim: 0.8, reaction: 0.28, aggression: 0.6, preferred: ['rifle', 'autoShotgun', 'scar'] },
  },
  zoey: {
    id: 'zoey', name: 'Zoey', color: '#d0707a',
    bio: 'College film student and horror-movie fanatic. Sharp-tongued, quick, deadly with pistols.',
    skin: 0xe8c0a0, sleeve: 0x8e2638, stripe: 0xe8e0d8, gloves: null,
    body: { shirt: 0x8e2638, under: 0xe8e4dc, pants: 0x3a4a6a, shoes: 0x3a3230, hair: 0x4a2a18, ponytail: true, scale: 0.94, build: 0.9, female: true },
    voice: { pitch: 1.25, rate: 1.05, prefer: ['Samantha', 'Google US English', 'Microsoft Zira', 'Victoria', 'Karen', 'female'] },
    bot: { aim: 0.85, reaction: 0.22, aggression: 0.5, preferred: ['huntingRifle', 'rifle', 'smg'] },
  },
  louis: {
    id: 'louis', name: 'Louis', color: '#7aa0d0',
    bio: 'Junior systems analyst. Relentlessly upbeat, practical, the first to spot the pills.',
    skin: 0x6a4630, sleeve: 0xe4e4dc, rolledSleeves: true, gloves: null,
    body: { shirt: 0xe4e4dc, tie: 0x8a1a1a, pants: 0x3a3a40, shoes: 0x1a1614, hair: null, bald: true, scale: 1.0, build: 1.0 },
    voice: { pitch: 1.05, rate: 1.08, prefer: ['Google US English', 'Microsoft Mark', 'Tom', 'Alex', 'male'] },
    bot: { aim: 0.75, reaction: 0.3, aggression: 0.5, preferred: ['smg', 'rifle', 'autoShotgun'] },
  },
  francis: {
    id: 'francis', name: 'Francis', color: '#d0a060',
    bio: 'Biker. Tattooed, confrontational, hates just about everything - except a good fight.',
    skin: 0xd0a080, sleeve: 0x1a1816, bareArms: true, tattoo: true, gloves: null,
    body: { shirt: 0x1a1816, vest: 0x141210, pants: 0x2e3a52, shoes: 0x1a1410, hair: 0x2a2018, beard: 0x2a2018, scale: 1.04, build: 1.18, bareArms: true },
    voice: { pitch: 0.7, rate: 0.95, prefer: ['Microsoft David', 'Google UK English Male', 'Fred', 'Ralph', 'male'] },
    bot: { aim: 0.72, reaction: 0.3, aggression: 0.85, preferred: ['autoShotgun', 'pumpShotgun', 'rifle'] },
  },
};
export const ORDER = ['bill', 'zoey', 'louis', 'francis'];
